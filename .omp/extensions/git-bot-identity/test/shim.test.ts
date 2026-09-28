import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GRANT_CLIENT_PATH, installShim } from "../lib/shim";
import { evalGuidance } from "../lib/guidance";
import { getGrantServer, stopGrantServer, type GrantMode } from "../lib/grant-server";

const MARKER = "FAKE_BINARY_RAN";
// A distinctive phrase from evalGuidance that must appear on a blocked write.
const BLOCK_PHRASE = "do not route around this";

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "gbi-shim-"));
});

afterEach(() => {
	stopGrantServer(dir);
	rmSync(dir, { recursive: true, force: true });
});

/** Write a tiny executable fake binary that prints a marker and echoes its args. */
function fakeBinary(name: string): string {
	const p = join(dir, name);
	writeFileSync(p, `#!/bin/sh\nprintf '%s %s\\n' '${MARKER}' "$*"\n`, { mode: 0o755 });
	return p;
}

/** A fake binary that prints the credential env it received plus its args — used
 * to prove the shim handed the granted env to the real binary. */
function fakeTokenBinary(name: string): string {
	const p = join(dir, name);
	writeFileSync(
		p,
		`#!/bin/sh\nprintf 'TOKEN=%s\\n' "\${GH_TOKEN:-unset}"\nprintf 'SIGNING=%s\\n' "\${SIGNING_KEY:-unset}"\nprintf 'ARGS=%s\\n' "$*"\n`,
		{ mode: 0o755 },
	);
	return p;
}

async function run(argv: string[], env?: Record<string, string>): Promise<{ code: number; stdout: string; stderr: string }> {
	// This omp session neutralizes its own env and exports a GBI_GRANT_SOCK;
	// clear it (and the re-entry flag) so each test supplies exactly its channel.
	const proc = Bun.spawn(argv, {
		stdout: "pipe",
		stderr: "pipe",
		env: { ...process.env, GBI_GRANT_SOCK: "", GBI_IN_SHIM: "", ...env },
	});
	const readAll = async (s: ReadableStream<Uint8Array> | null) => (s ? new Response(s).text() : Promise.resolve(""));
	const [stdout, stderr] = await Promise.all([readAll(proc.stdout), readAll(proc.stderr)]);
	const exit = await proc.exited;
	return { code: exit, stdout, stderr };
}

/** Run a shell command with PATH pointing at the shim dir first. Clears any
 * ambient GBI_GRANT_SOCK (this very omp session neutralizes the env and sets
 * one) so a test's grant channel is exactly what it supplies. */
async function runSh(command: string, shimDir: string, extraEnv: Record<string, string> = {}) {
	return run(["/bin/sh", "-c", command], {
		...process.env,
		PATH: `${shimDir}:/usr/bin:/bin:/usr/sbin:/sbin`,
		GBI_GRANT_SOCK: "",
		...extraEnv,
	});
}

/**
 * A fake runtime standing in for omp's `process.execPath`. It records the env
 * the shim handed it (proving `BUN_BE_BUN=1`, the mode/socket, and a PATH without
 * the shim dir), then execs the real bun on the same argv so the shim's grant
 * client still runs to completion.
 */
function fakeRuntime(recordPath: string): string {
	const p = join(dir, "fake-runtime");
	writeFileSync(
		p,
		`#!/bin/sh
printf 'BUN_BE_BUN=%s GBI_GRANT_MODE=%s GBI_GRANT_SOCK=%s PATH=%s ARGV=%s\\n' \\
  "$BUN_BE_BUN" "\${GBI_GRANT_MODE:-unset}" "\${GBI_GRANT_SOCK:-unset}" "$PATH" "$*" >> "$RECORD"
exec "$REAL_BUN" "$@"
`,
		{ mode: 0o755 },
	);
	return p;
}

const READ_WRITE_RESOLVER = (mode: GrantMode) =>
	mode === "read"
		? { ok: true as const, env: { GH_TOKEN: "transport-only", SIGNING_KEY: "unset" } }
		: { ok: true as const, env: { GH_TOKEN: "full-creds", SIGNING_KEY: "ABCDEF1234567890" } };

describe("installShim", () => {
	test("git read subcommand passes through, forwards args, prints marker", async () => {
		const fakeGit = fakeBinary("fake-git");
		const fakeGh = fakeBinary("fake-gh");
		const { shimDir } = installShim(dir, { git: fakeGit, gh: fakeGh, runtime: process.execPath });

		const res = await run([join(shimDir, "git"), "status", "--short", "src"]);
		expect(res.code).toBe(0);
		expect(res.stdout).toContain(MARKER);
		expect(res.stdout).toContain("status --short src");
	});

	test("git write subcommand with no grant channel is blocked with guidance and does not reach the binary", async () => {
		const fakeGit = fakeBinary("fake-git");
		const fakeGh = fakeBinary("fake-gh");
		const { shimDir } = installShim(dir, { git: fakeGit, gh: fakeGh, runtime: process.execPath });

		const res = await run([join(shimDir, "git"), "push", "origin", "main"]);
		expect(res.code).toBe(1);
		expect(res.stderr).toContain(BLOCK_PHRASE);
		expect(res.stdout).not.toContain(MARKER);
	});

	test("global options before the subcommand are skipped, including their values", async () => {
		const fakeGit = fakeBinary("fake-git");
		const fakeGh = fakeBinary("fake-gh");
		const { shimDir } = installShim(dir, { git: fakeGit, gh: fakeGh, runtime: process.execPath });
		const git = join(shimDir, "git");

		for (const args of [["-c", "core.quotePath=off", "diff"], ["-C", ".", "--no-pager", "status"], ["--git-dir=.git", "log"]]) {
			const res = await run([git, ...args]);
			expect(res.code).toBe(0);
			expect(res.stdout).toContain(args.join(" "));
		}
		// A value that looks like a read subcommand must not be taken as one.
		for (const args of [["-C", "status", "push"], ["-c", "diff", "commit"]]) {
			const res = await run([git, ...args]);
			expect(res.code).toBe(1);
			expect(res.stdout).not.toContain(MARKER);
		}
	});

	test("gh write subcommand is blocked with guidance; read subcommand passes through", async () => {
		const fakeGit = fakeBinary("fake-git");
		const fakeGh = fakeBinary("fake-gh");
		const { shimDir } = installShim(dir, { git: fakeGit, gh: fakeGh, runtime: process.execPath });

		const blocked = await run([join(shimDir, "gh"), "pr", "create", "--title", "x"]);
		expect(blocked.code).toBe(1);
		expect(blocked.stderr).toContain(BLOCK_PHRASE);
		expect(blocked.stdout).not.toContain(MARKER);

		const read = await run([join(shimDir, "gh"), "auth", "status"]);
		expect(read.code).toBe(0);
		expect(read.stdout).toContain(MARKER);
		expect(read.stdout).toContain("auth status");
	});

	test("shim is idempotent: reinstall keeps scripts working", async () => {
		const fakeGit = fakeBinary("fake-git");
		const fakeGh = fakeBinary("fake-gh");
		const first = installShim(dir, { git: fakeGit, gh: fakeGh, runtime: process.execPath });
		const second = installShim(dir, { git: fakeGit, gh: fakeGh, runtime: process.execPath });
		expect(second.shimDir).toBe(first.shimDir);

		const read = await run([join(second.shimDir, "git"), "log", "--oneline"]);
		expect(read.code).toBe(0);
		expect(read.stdout).toContain(MARKER);

		const blocked = await run([join(second.shimDir, "git"), "commit", "-m", "x"]);
		expect(blocked.code).toBe(1);
		expect(blocked.stderr).toContain(BLOCK_PHRASE);
	});
});

describe("shim argv-driven grants (end to end)", () => {
	test("git status gets the read env and git commit gets the write env", async () => {
		const server = getGrantServer(dir, READ_WRITE_RESOLVER);
		const fakeGit = fakeTokenBinary("fake-git");
		const fakeGh = fakeTokenBinary("fake-gh");
		const { shimDir } = installShim(dir, { git: fakeGit, gh: fakeGh, runtime: process.execPath });
		const env = { GBI_GRANT_SOCK: server.socketPath };

		// Read-class argv → transport-only grant.
		const read = await runSh("git status", shimDir, env);
		expect(read.code).toBe(0);
		expect(read.stdout).toContain("TOKEN=transport-only");
		expect(read.stdout).toContain("SIGNING=unset");
		expect(read.stdout).toContain("ARGS=status");

		// Write-class argv → full creds + signing.
		const write = await runSh('git commit -m "x"', shimDir, env);
		expect(write.code).toBe(0);
		expect(write.stdout).toContain("TOKEN=full-creds");
		expect(write.stdout).toContain("SIGNING=ABCDEF1234567890");
		expect(write.stdout).toContain('ARGS=commit -m x');

		// gh reads/writes classify the same way.
		const ghRead = await runSh("gh auth status", shimDir, env);
		expect(ghRead.stdout).toContain("TOKEN=transport-only");
		const ghWrite = await runSh("gh pr create --title x", shimDir, env);
		expect(ghWrite.stdout).toContain("TOKEN=full-creds");
		expect(ghWrite.stdout).toContain("ARGS=pr create --title x");
	});

	test("a refused write prints the server's reason and exits 1; the real binary never runs", async () => {
		const server = getGrantServer(dir, () => ({ ok: false, reason: "REASON-MARKER: bot credentials absent" }));
		const fakeGit = fakeTokenBinary("fake-git");
		const fakeGh = fakeTokenBinary("fake-gh");
		const { shimDir } = installShim(dir, { git: fakeGit, gh: fakeGh, runtime: process.execPath });

		const res = await runSh("git push origin main", shimDir, { GBI_GRANT_SOCK: server.socketPath });
		expect(res.code).toBe(1);
		expect(res.stderr).toContain("REASON-MARKER: bot credentials absent");
		expect(res.stdout).not.toContain("TOKEN=");
	});

	test("a refused read still runs the real binary under the neutral env", async () => {
		const server = getGrantServer(dir, () => ({ ok: false, reason: "nope" }));
		const fakeGit = fakeTokenBinary("fake-git");
		const fakeGh = fakeBinary("fake-gh");
		const { shimDir } = installShim(dir, { git: fakeGit, gh: fakeGh, runtime: process.execPath });

		const res = await runSh("git status", shimDir, { GBI_GRANT_SOCK: server.socketPath });
		expect(res.code).toBe(0);
		// Neutral env: no granted token, but the real git ran.
		expect(res.stdout).not.toContain("TOKEN=transport-only");
		expect(res.stdout).toContain("ARGS=status");
	});

	test("a read with the server unreachable still runs the real binary", async () => {
		const fakeGit = fakeTokenBinary("fake-git");
		const fakeGh = fakeBinary("fake-gh");
		const { shimDir } = installShim(dir, { git: fakeGit, gh: fakeGh, runtime: process.execPath });

		const res = await runSh("git log --oneline", shimDir, { GBI_GRANT_SOCK: join(dir, "no-such.sock") });
		expect(res.code).toBe(0);
		expect(res.stdout).not.toContain("TOKEN=transport-only");
		expect(res.stdout).toContain("ARGS=log --oneline");
	});

	test("the shim runs the client as BUN_BE_BUN=1 <runtime> exactly once, with the mode and a safe PATH", async () => {
		const server = getGrantServer(dir, READ_WRITE_RESOLVER);
		const record = join(dir, "runtime-record");
		const fakeGit = fakeTokenBinary("fake-git");
		const fakeGh = fakeTokenBinary("fake-gh");
		const runtime = fakeRuntime(record);
		const { shimDir } = installShim(dir, { git: fakeGit, gh: fakeGh, runtime });

		const res = await runSh('git commit -m "x"', shimDir, {
			GBI_GRANT_SOCK: server.socketPath,
			RECORD: record,
			REAL_BUN: process.execPath,
		});
		expect(res.code).toBe(0);
		expect(res.stdout).toContain("TOKEN=full-creds");

		const runs = readFileSync(record, "utf8").trim().split("\n");
		expect(runs).toHaveLength(1);
		expect(runs[0]).toContain("BUN_BE_BUN=1");
		expect(runs[0]).toContain("GBI_GRANT_MODE=write");
		expect(runs[0]).toContain(`GBI_GRANT_SOCK=${server.socketPath}`);
		// A PATH that never resolves git/gh back to the shim.
		expect(runs[0]).toContain("PATH=/usr/bin:/bin:/usr/sbin:/sbin");
		expect(runs[0]).not.toContain("PATH=" + shimDir);
		expect(runs[0]).toContain(`ARGV=${GRANT_CLIENT_PATH}`);
	});

	test("the shim records read mode for a read-class argv", async () => {
		const server = getGrantServer(dir, READ_WRITE_RESOLVER);
		const record = join(dir, "runtime-record");
		const runtime = fakeRuntime(record);
		const { shimDir } = installShim(dir, { git: fakeTokenBinary("fake-git"), gh: fakeBinary("fake-gh"), runtime });

		await runSh("git diff", shimDir, { GBI_GRANT_SOCK: server.socketPath, RECORD: record, REAL_BUN: process.execPath });
		expect(readFileSync(record, "utf8")).toContain("GBI_GRANT_MODE=read");
	});

	test("a granted write unsets the socket, so a nested git call cannot redeem again", async () => {
		const server = getGrantServer(dir, mode =>
			mode === "write"
				? { ok: true, env: { GH_TOKEN: "outer-token-value", PATH: `${dir}/shim:/usr/bin:/bin` } }
				: { ok: true, env: { GH_TOKEN: "read-token" } },
		);
		const record = join(dir, "runtime-record");
		// The "real" git is itself a script that invokes git through PATH (the
		// shim is first). This is the shape that recursed into nested omp instances.
		const fakeGit = join(dir, "fake-git-nested");
		writeFileSync(
			fakeGit,
			`#!/bin/sh
printf 'OUTER_TOKEN=%s\\n' "\${GH_TOKEN:-unset}"
printf 'OUTER_SOCK=%s\\n' "\${GBI_GRANT_SOCK:-unset}"
git push origin main
printf 'OUTER_DONE\\n'
`,
			{ mode: 0o755 },
		);
		const runtime = fakeRuntime(record);
		const { shimDir } = installShim(dir, { git: fakeGit, gh: fakeBinary("fake-gh"), runtime });

		const res = await runSh('git commit -m "x"', shimDir, {
			GBI_GRANT_SOCK: server.socketPath,
			RECORD: record,
			REAL_BUN: process.execPath,
		});
		expect(res.code).toBe(0);
		// The outer call got the credentials and the socket was unset before exec...
		expect(res.stdout).toContain("OUTER_TOKEN=outer-token-value");
		expect(res.stdout).toContain("OUTER_SOCK=unset");
		// ...so the nested git fell through to the guidance block.
		expect(res.stdout).toContain("OUTER_DONE");
		expect(res.stderr).toContain(BLOCK_PHRASE);
		expect(res.stdout.match(/OUTER_TOKEN=/g)).toHaveLength(1);
		expect(readFileSync(record, "utf8").trim().split("\n")).toHaveLength(1);
	});

	test("re-entry guard: GBI_IN_SHIM set means no runtime is ever started", async () => {
		const server = getGrantServer(dir, READ_WRITE_RESOLVER);
		const record = join(dir, "runtime-record");
		const fakeGit = fakeTokenBinary("fake-git");
		const fakeGh = fakeBinary("fake-gh");
		const runtime = fakeRuntime(record);
		const { shimDir } = installShim(dir, { git: fakeGit, gh: fakeGh, runtime });
		const env = { GBI_GRANT_SOCK: server.socketPath, GBI_IN_SHIM: "1", RECORD: record, REAL_BUN: process.execPath };

		// A read still runs (real binary, neutral env), without any runtime.
		const read = await runSh("git status", shimDir, env);
		expect(read.code).toBe(0);
		expect(read.stdout).not.toContain("TOKEN=transport-only");
		expect(read.stdout).toContain("ARGS=status");

		// A write is blocked; still no runtime.
		const write = await runSh("git push origin main", shimDir, env);
		expect(write.code).toBe(1);
		expect(write.stderr).toContain(BLOCK_PHRASE);
		expect(write.stdout).not.toContain("TOKEN=");
	});
});

describe("evalGuidance", () => {
	test("contains the guidance markers used by the shim", () => {
		expect(evalGuidance()).toContain(BLOCK_PHRASE);
	});
});
