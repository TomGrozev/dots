import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GRANT_CLIENT_PATH, installShim } from "../lib/shim";
import { evalGuidance } from "../lib/guidance";
import { getGrantServer, stopGrantServer } from "../lib/grant-server";

const MARKER = "FAKE_BINARY_RAN";
// A distinctive phrase from evalGuidance that must appear on a blocked write.
const BLOCK_PHRASE = "blocked write means stop";

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

/** A fake binary that prints the GH_TOKEN it received plus its args — used to
 * prove the shim handed the grant env to the real binary. */
function fakeTokenBinary(name: string): string {
	const p = join(dir, name);
	writeFileSync(p, `#!/bin/sh\nprintf 'TOKEN=%s\\n' "$GH_TOKEN"\nprintf 'ARGS=%s\\n' "$*"\n`, { mode: 0o755 });
	return p;
}

async function run(argv: string[], env?: Record<string, string>): Promise<{ code: number; stdout: string; stderr: string }> {
	const proc = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", ...(env ? { env } : {}) });
	const readAll = async (s: ReadableStream<Uint8Array> | null) => (s ? new Response(s).text() : Promise.resolve(""));
	const [stdout, stderr] = await Promise.all([readAll(proc.stdout), readAll(proc.stderr)]);
	const exit = await proc.exited;
	return { code: exit, stdout, stderr };
}

/** Run a shell command with PATH pointing at the shim dir first. */
async function runSh(command: string, shimDir: string, extraEnv: Record<string, string> = {}) {
	return run(["/bin/sh", "-c", command], {
		...process.env,
		PATH: `${shimDir}:/usr/bin:/bin:/usr/sbin:/sbin`,
		...extraEnv,
	});
}

/**
 * A fake runtime standing in for omp's `process.execPath`. It records the env
 * the shim handed it (proving `BUN_BE_BUN=1`, the ticket/socket, and a PATH
 * without the shim dir), then execs the real bun on the same argv so the shim's
 * grant client still runs to completion.
 */
function fakeRuntime(recordPath: string): string {
	const p = join(dir, "fake-runtime");
	writeFileSync(p, `#!/bin/sh
printf 'BUN_BE_BUN=%s GBI_TICKET=%s GBI_GRANT_SOCK=%s PATH=%s ARGV=%s\\n' \\
  "$BUN_BE_BUN" "\${GBI_TICKET:-unset}" "\${GBI_GRANT_SOCK:-unset}" "$PATH" "$*" >> "$RECORD"
exec "$REAL_BUN" "$@"
`, { mode: 0o755 });
	return p;
}

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

	test("git write subcommand is blocked with guidance and does not reach the binary", async () => {
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

describe("shim grant redemption (end to end)", () => {
	test("a ticket makes the shim exec the real binary with the grant env; revoking blocks it", async () => {
		const grant = getGrantServer(dir);
		const fakeGit = fakeBinary("fake-git");
		const fakeGh = fakeTokenBinary("fake-gh-token");
		const { shimDir } = installShim(dir, { git: fakeGit, gh: fakeGh, runtime: process.execPath });

		const ticket = grant.grant({ GH_TOKEN: "sekret-token-value", GIT_AUTHOR_NAME: "Bot" });
		const command = `export GBI_TICKET=${ticket}; gh pr create --title "x"`;
		const env = { PATH: `${shimDir}:/usr/bin:/bin:/usr/sbin:/sbin`, GBI_GRANT_SOCK: grant.socketPath };

		// With a live ticket: guidance allowlist bypassed, real gh gets the token.
		const granted = await runSh(command, shimDir, env);
		expect(granted.code).toBe(0);
		expect(granted.stdout).toContain("TOKEN=sekret-token-value");
		expect(granted.stdout).toContain("ARGS=pr create --title x");
		expect(granted.stderr).not.toContain(BLOCK_PHRASE);

		// Revoked: the same command falls back to the block, real gh never runs.
		grant.revoke(ticket);
		const blocked = await runSh(command, shimDir, env);
		expect(blocked.code).toBe(1);
		expect(blocked.stderr).toContain(BLOCK_PHRASE);
		expect(blocked.stdout).not.toContain("TOKEN=");
	});

	test("without any ticket the shim still blocks a write and never prints a token", async () => {
		const fakeGit = fakeBinary("fake-git");
		const fakeGh = fakeTokenBinary("fake-gh-token");
		const { shimDir } = installShim(dir, { git: fakeGit, gh: fakeGh, runtime: process.execPath });

		const res = await runSh(`gh pr create --title "x"`, shimDir);
		expect(res.code).toBe(1);
		expect(res.stderr).toContain(BLOCK_PHRASE);
		expect(res.stdout).not.toContain("TOKEN=");
	});

	test("the token reaches the real binary via env, never via argv", async () => {
		const grant = getGrantServer(dir);
		const fakeGit = fakeBinary("fake-git");
		const fakeGh = fakeTokenBinary("fake-gh-token");
		const { shimDir } = installShim(dir, { git: fakeGit, gh: fakeGh, runtime: process.execPath });

		const ticket = grant.grant({ GH_TOKEN: "argv-leak-canary", PATH: `${shimDir}:/usr/bin:/bin` });
		const command = `export GBI_TICKET=${ticket}; gh pr create`;
		// The command the hook rewrote carries only the ticket, never the token.
		expect(command).not.toContain("argv-leak-canary");
		const res = await runSh(command, shimDir, {
			PATH: `${shimDir}:/usr/bin:/bin`,
			GBI_GRANT_SOCK: grant.socketPath,
		});
		expect(res.code).toBe(0);
		// The real gh received the token in its environment...
		expect(res.stdout).toContain("TOKEN=argv-leak-canary");
		// ...and saw it in neither its own argv nor the shim's command line.
		expect(res.stdout).toContain("ARGS=pr create");
		expect(res.stdout).not.toContain("ARGS=pr create --token");
	});

	test("the shim runs the client as BUN_BE_BUN=1 <runtime> exactly once per call", async () => {
		const grant = getGrantServer(dir);
		const record = join(dir, "runtime-record");
		const fakeGit = fakeBinary("fake-git");
		const fakeGh = fakeTokenBinary("fake-gh-token");
		const runtime = fakeRuntime(record);
		const { shimDir } = installShim(dir, { git: fakeGit, gh: fakeGh, runtime });

		const ticket = grant.grant({ GH_TOKEN: "runtime-canary" });
		const res = await runSh(`export GBI_TICKET=${ticket}; gh pr create`, shimDir, {
			PATH: `${shimDir}:/usr/bin:/bin:/usr/sbin:/sbin`,
			GBI_GRANT_SOCK: grant.socketPath,
			RECORD: record,
			REAL_BUN: process.execPath,
		});
		expect(res.code).toBe(0);
		expect(res.stdout).toContain("TOKEN=runtime-canary");

		// The runtime ran once, as plain bun, on the checked-in client...
		const runs = readFileSync(record, "utf8").trim().split("\n");
		expect(runs).toHaveLength(1);
		expect(runs[0]).toContain("BUN_BE_BUN=1");
		// ...with the ticket and socket passed to it...
		expect(runs[0]).toContain(`GBI_TICKET=${ticket}`);
		expect(runs[0]).toContain(`GBI_GRANT_SOCK=${grant.socketPath}`);
		// ...and a PATH that never resolves git/gh back to the shim.
		expect(runs[0]).toContain("PATH=/usr/bin:/bin:/usr/sbin:/sbin");
		expect(runs[0]).not.toContain("PATH=" + shimDir);
		expect(runs[0]).toContain(`ARGV=${GRANT_CLIENT_PATH}`);
	});

	test("recursion guard: a granted call's descendants cannot redeem again", async () => {
		const grant = getGrantServer(dir);
		const record = join(dir, "runtime-record");
		// The "real" git is itself a script that invokes git through PATH (the
		// shim is first, as the neutral env prefixes it). This is the shape that
		// recursed into nested omp instances before the fix.
		const fakeGit = join(dir, "fake-git-nested");
		writeFileSync(
			fakeGit,
			`#!/bin/sh
printf 'OUTER_TOKEN=%s\\n' "$GH_TOKEN"
printf 'OUTER_TICKET=%s\\n' "\${GBI_TICKET:-unset}"
git push origin main
printf 'OUTER_DONE\\n'
`,
			{ mode: 0o755 },
		);
		const fakeGh = fakeBinary("fake-gh");
		const runtime = fakeRuntime(record);
		const { shimDir } = installShim(dir, { git: fakeGit, gh: fakeGh, runtime });

		const ticket = grant.grant({ GH_TOKEN: "outer-token-value" });
		const res = await runSh(`export GBI_TICKET=${ticket}; git push origin main`, shimDir, {
			PATH: `${shimDir}:/usr/bin:/bin:/usr/sbin:/sbin`,
			GBI_GRANT_SOCK: grant.socketPath,
			RECORD: record,
			REAL_BUN: process.execPath,
		});
		expect(res.code).toBe(0);
		// The outer call got the credentials...
		expect(res.stdout).toContain("OUTER_TOKEN=outer-token-value");
		// ...and the ticket/socket were unset before the real binary ran, so the
		// nested git call fell through to the guidance block with no credentials
		// and no second runtime invocation.
		expect(res.stdout).toContain("OUTER_TICKET=unset");
		expect(res.stdout).toContain("OUTER_DONE");
		expect(res.stderr).toContain(BLOCK_PHRASE);
		expect(res.stdout.match(/OUTER_TOKEN=/g)).toHaveLength(1);
		expect(readFileSync(record, "utf8").trim().split("\n")).toHaveLength(1);
	});

	test("re-entry guard: a runtime that ignores BUN_BE_BUN and calls git cannot loop", async () => {
		// Reproduces the incident: the runtime boots something that runs git
		// through the shim with the ticket still in its env. Without the guard
		// each such git starts another runtime, without bound.
		const grant = getGrantServer(dir);
		const record = join(dir, "runtime-record");
		const runtime = join(dir, "rogue-runtime");
		writeFileSync(
			runtime,
			`#!/bin/sh
echo run >> "$RECORD"
PATH="$SHIM:$PATH" git push origin main
exit 1
`,
			{ mode: 0o755 },
		);
		const { shimDir } = installShim(dir, { git: fakeBinary("fake-git"), gh: fakeBinary("fake-gh"), runtime });
		const ticket = grant.grant({ GH_TOKEN: "never" });
		const res = await runSh(`export GBI_TICKET=${ticket}; git push origin main`, shimDir, {
			GBI_GRANT_SOCK: grant.socketPath,
			RECORD: record,
			SHIM: shimDir,
		});
		expect(res.code).toBe(1);
		expect(res.stdout).not.toContain("never");
		expect(readFileSync(record, "utf8").trim().split("\n")).toHaveLength(1);
	});
});

describe("evalGuidance", () => {
	test("contains the guidance markers used by the shim", () => {
		expect(evalGuidance()).toContain(BLOCK_PHRASE);
	});
});
