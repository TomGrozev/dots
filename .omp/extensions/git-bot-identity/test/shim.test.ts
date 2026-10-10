import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	GH_READ_ALLOWLIST,
	GH_READ_NAMESPACES,
	GH_READ_VERBS,
	GIT_LOCAL_ALLOWLIST,
	GIT_READ_ALLOWLIST,
	GRANT_CLIENT_PATH,
	defaultPidIsAlive,
	installShim,
	removeShimState,
	sweepStaleShimState,
} from "../lib/shim";
import { evalGuidance } from "../lib/guidance";
import { getGrantServer, stopGrantServer, type GrantMode } from "../lib/grant-server";

const MARKER = "FAKE_BINARY_RAN";
// A distinctive phrase from evalGuidance that must appear on a blocked write.
const BLOCK_PHRASE = "do not route around this";

let dir: string;
// Fake real binaries live OUTSIDE the creds dir: a resolved real git/gh inside
// it is refused by installShim (it would exec itself).
let binDir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "gbi-shim-"));
	binDir = mkdtempSync(join(tmpdir(), "gbi-bin-"));
});

afterEach(() => {
	stopGrantServer(dir);
	rmSync(dir, { recursive: true, force: true });
	rmSync(binDir, { recursive: true, force: true });
});

/** Write a tiny executable fake binary that prints a marker and echoes its args. */
function fakeBinary(name: string): string {
	const p = join(binDir, name);
	writeFileSync(p, `#!/bin/sh\nprintf '%s %s\\n' '${MARKER}' "$*"\n`, { mode: 0o755 });
	return p;
}

/** A fake binary that prints the credential env it received plus its args — used
 * to prove the shim handed the granted env (or the neutral env) to the binary. */
function fakeTokenBinary(name: string): string {
	const p = join(binDir, name);
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
	const p = join(binDir, "fake-runtime");
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

/** A recording resolver: returns a grant tagged with the requested mode and
 * keeps every mode it was asked for, so a test can prove a call did (or did
 * not) contact the grant server. */
function recordingResolver(): { seen: GrantMode[]; resolver: (mode: GrantMode) => { ok: true; env: Record<string, string> } } {
	const seen: GrantMode[] = [];
	return {
		seen,
		resolver: mode => {
			seen.push(mode);
			return { ok: true as const, env: { GH_TOKEN: `granted-${mode}` } };
		},
	};
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

	test("two processes install independent shim dirs (their baked paths never collide)", () => {
		const a = installShim(dir, { git: fakeBinary("git-a"), gh: fakeBinary("gh-a"), runtime: "/bin/bun-a" }, 10001);
		const b = installShim(dir, { git: fakeBinary("git-b"), gh: fakeBinary("gh-b"), runtime: "/bin/bun-b" }, 10002);
		expect(a.shimDir).toBe(join(dir, "shim-10001"));
		expect(b.shimDir).toBe(join(dir, "shim-10002"));

		const aGit = readFileSync(join(a.shimDir, "git"), "utf8");
		const bGit = readFileSync(join(b.shimDir, "git"), "utf8");
		expect(aGit).toContain("/bin/bun-a");
		expect(bGit).toContain("/bin/bun-b");
		expect(aGit).not.toContain("/bin/bun-b");
		expect(bGit).not.toContain("/bin/bun-a");

		// Removing one process's state leaves the other's untouched.
		removeShimState(a.shimDir, join(dir, "grant-10001.sock"));
		expect(existsSync(a.shimDir)).toBe(false);
		expect(existsSync(b.shimDir)).toBe(true);
	});

	test("refuses a resolved real binary that is inside the creds dir", () => {
		expect(() => installShim(dir, { git: join(dir, "shim-1", "git"), gh: "gh", runtime: "/bin/bun" })).toThrow(
			/inside the credentials dir/,
		);
		expect(() => installShim(dir, { git: "git", gh: join(dir, "shim", "gh"), runtime: "/bin/bun" })).toThrow(
			/inside the credentials dir/,
		);
	});

	test("git write subcommand with no grant channel is blocked, binary never runs", async () => {
		const fakeGit = fakeBinary("fake-git");
		const fakeGh = fakeBinary("fake-gh");
		const { shimDir } = installShim(dir, { git: fakeGit, gh: fakeGh, runtime: process.execPath });

		const res = await run([join(shimDir, "git"), "push", "origin", "main"]);
		expect(res.code).toBe(1);
		expect(res.stderr).toContain("GBI_GRANT_SOCK is unset");
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

	test("gh write subcommand is blocked; read subcommand passes through", async () => {
		const fakeGit = fakeBinary("fake-git");
		const fakeGh = fakeBinary("fake-gh");
		const { shimDir } = installShim(dir, { git: fakeGit, gh: fakeGh, runtime: process.execPath });

		const blocked = await run([join(shimDir, "gh"), "pr", "create", "--title", "x"]);
		expect(blocked.code).toBe(1);
		expect(blocked.stderr).toContain("GBI_GRANT_SOCK is unset");
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
		expect(blocked.stderr).toContain("GBI_GRANT_SOCK is unset");
	});
});

describe("git class boundaries", () => {
	test("every local subcommand runs without ever contacting the grant server", async () => {
		const { seen, resolver } = recordingResolver();
		const server = getGrantServer(dir, resolver);
		const { shimDir } = installShim(dir, {
			git: fakeTokenBinary("fake-git"),
			gh: fakeBinary("fake-gh"),
			runtime: process.execPath,
		});
		for (const sub of GIT_LOCAL_ALLOWLIST) {
			const res = await run([join(shimDir, "git"), sub], { GBI_GRANT_SOCK: server.socketPath });
			expect(res.code).toBe(0);
			expect(res.stdout).toContain(`ARGS=${sub}`);
			expect(res.stdout).not.toContain("TOKEN=granted");
		}
		expect(seen).toEqual([]);
	});

	test("remote-touching and commit-creating subcommands still request a grant", async () => {
		const { seen, resolver } = recordingResolver();
		const server = getGrantServer(dir, resolver);
		const { shimDir } = installShim(dir, {
			git: fakeTokenBinary("fake-git"),
			gh: fakeBinary("fake-gh"),
			runtime: process.execPath,
		});
		for (const args of [
			["pull"], ["clone", "x"], ["submodule", "update"], ["push"], ["commit", "-m", "x"], ["tag", "-a", "v1", "-m", "x"],
			// Commit-creating commands need the bot identity and signing key.
			["merge", "topic"], ["rebase", "main"], ["cherry-pick", "abc"], ["revert", "abc"], ["am", "p.mbox"], ["notes", "add"], ["stash"],
		]) {
			seen.length = 0;
			const res = await run([join(shimDir, "git"), ...args], { GBI_GRANT_SOCK: server.socketPath });
			expect(res.code).toBe(0);
			expect(seen).toEqual(["write"]);
			expect(res.stdout).toContain("TOKEN=granted-write");
		}
	});

	test("read subcommands request the read grant; annotated tag flips to write", async () => {
		const { seen, resolver } = recordingResolver();
		const server = getGrantServer(dir, resolver);
		const { shimDir } = installShim(dir, {
			git: fakeTokenBinary("fake-git"),
			gh: fakeBinary("fake-gh"),
			runtime: process.execPath,
		});
		for (const args of [["status"], ["diff"], ["log", "--oneline"], ["fetch"], ["tag"], ["tag", "-l"]]) {
			seen.length = 0;
			const res = await run([join(shimDir, "git"), ...args], { GBI_GRANT_SOCK: server.socketPath });
			expect(seen).toEqual(["read"]);
			expect(res.stdout).toContain("TOKEN=granted-read");
		}
		seen.length = 0;
		const signed = await run([join(shimDir, "git"), "tag", "-s", "v1", "-m", "x"], { GBI_GRANT_SOCK: server.socketPath });
		expect(seen).toEqual(["write"]);
		expect(signed.stdout).toContain("TOKEN=granted-write");
	});

	test("git --version, -h/--help and an empty subcommand classify as read", async () => {
		const { seen, resolver } = recordingResolver();
		const server = getGrantServer(dir, resolver);
		const { shimDir } = installShim(dir, {
			git: fakeTokenBinary("fake-git"),
			gh: fakeBinary("fake-gh"),
			runtime: process.execPath,
		});
		for (const args of [["--version"], ["-h"], ["--help"], []]) {
			seen.length = 0;
			await run([join(shimDir, "git"), ...args], { GBI_GRANT_SOCK: server.socketPath });
			expect(seen).toEqual(["read"]);
		}
	});
});

describe("gh classification", () => {
	const readCases: string[][] = [
		["api", "/repos/o/r"],
		["api", "-X", "GET", "/x"],
		["api", "--method=GET", "/x"],
		["api", "--method", "get", "/x"],
		["api", "/x", "-X", "GET"],
		["pr", "view", "1"],
		["pr", "list"],
		["issue", "status"],
		["run", "list"],
		["release", "view", "v1"],
		["repo", "view"],
		["repo", "list"],
		["workflow", "list"],
		["label", "list"],
		["search", "repos", "q"],
		["auth", "status"],
		["version"],
		["-R", "o/r", "pr", "view", "1"],
	];
	const writeCases: string[][] = [
		["api", "-X", "POST", "/x"],
		["api", "--method=POST", "/x"],
		["api", "-f", "k=v", "/x"],
		["api", "-F", "f=@body", "/x"],
		["api", "--field=k=v", "/x"],
		["api", "--raw-field=k=v", "/x"],
		["api", "--input", "body.json"],
		["pr", "create", "--title", "x"],
		["repo", "clone", "o/r"],
		["label", "create", "bug"],
		["codespace", "list"],
		["workflow", "run", "ci"],
		["frobnicate"],
	];

	test("read verbs request read; everything else fails closed to write", async () => {
		const { seen, resolver } = recordingResolver();
		const server = getGrantServer(dir, resolver);
		const { shimDir } = installShim(dir, {
			git: fakeBinary("fake-git"),
			gh: fakeTokenBinary("fake-gh"),
			runtime: process.execPath,
		});
		for (const args of readCases) {
			seen.length = 0;
			const res = await run([join(shimDir, "gh"), ...args], { GBI_GRANT_SOCK: server.socketPath });
			expect(seen).toEqual(["read"]);
			expect(res.stdout).toContain("TOKEN=granted-read");
		}
		for (const args of writeCases) {
			seen.length = 0;
			const res = await run([join(shimDir, "gh"), ...args], { GBI_GRANT_SOCK: server.socketPath });
			expect(seen).toEqual(["write"]);
			expect(res.stdout).toContain("TOKEN=granted-write");
		}
	});

	test("the allowlist constants exclude codespace and blanket label", () => {
		expect(GH_READ_ALLOWLIST).not.toContain("codespace");
		expect(GH_READ_ALLOWLIST).not.toContain("label");
		expect(GH_READ_ALLOWLIST).not.toContain("api");
		expect(GH_READ_NAMESPACES).toContain("label");
		expect(GH_READ_VERBS).toContain("list");
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
		const fakeGit = join(binDir, "fake-git-nested");
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
		const record = join(dir, "runtime-record");
		const runtime = fakeRuntime(record);
		const { shimDir } = installShim(dir, { git: fakeGit, gh: fakeBinary("fake-gh"), runtime });
		const server = getGrantServer(dir, mode =>
			mode === "write"
				? { ok: true, env: { GH_TOKEN: "outer-token-value", PATH: `${shimDir}:/usr/bin:/bin` } }
				: { ok: true, env: { GH_TOKEN: "read-token" } },
		);

		const res = await runSh('git commit -m "x"', shimDir, {
			GBI_GRANT_SOCK: server.socketPath,
			RECORD: record,
			REAL_BUN: process.execPath,
		});
		expect(res.code).toBe(0);
		// The outer call got the credentials and the socket was unset before exec...
		expect(res.stdout).toContain("OUTER_TOKEN=outer-token-value");
		expect(res.stdout).toContain("OUTER_SOCK=unset");
		// ...so the nested git (now with no socket) is blocked, not granted again.
		expect(res.stdout).toContain("OUTER_DONE");
		expect(res.stderr).toContain("GBI_GRANT_SOCK is unset");
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

		// A read still runs, without any runtime.
		const read = await runSh("git status", shimDir, env);
		expect(read.code).toBe(0);
		expect(read.stdout).not.toContain("TOKEN=transport-only");
		expect(read.stdout).toContain("ARGS=status");

		// A write is blocked with guidance; still no runtime.
		const write = await runSh("git push origin main", shimDir, env);
		expect(write.code).toBe(1);
		expect(write.stderr).toContain(BLOCK_PHRASE);
		expect(write.stdout).not.toContain("TOKEN=");
		expect(existsSync(record)).toBe(false);
	});
});

describe("no grant channel", () => {
	test("write with the socket unset says which check failed", async () => {
		const { shimDir } = installShim(dir, { git: fakeBinary("git"), gh: fakeBinary("gh"), runtime: process.execPath });
		const res = await run([join(shimDir, "git"), "push", "origin", "main"]);
		expect(res.code).toBe(1);
		expect(res.stderr).toContain("grant server unreachable (GBI_GRANT_SOCK is unset)");
		expect(res.stdout).not.toContain(MARKER);
	});

	test("write with an unreachable socket reports the server unreachable at its path", async () => {
		const { shimDir } = installShim(dir, { git: fakeBinary("git"), gh: fakeBinary("gh"), runtime: process.execPath });
		const sock = join(dir, "missing.sock");
		const res = await run([join(shimDir, "git"), "push", "origin", "main"], { GBI_GRANT_SOCK: sock });
		expect(res.code).toBe(1);
		expect(res.stderr).toContain(`git-bot-identity: grant server unreachable at ${sock}`);
		expect(res.stdout).not.toContain(MARKER);
	});

	test("write with a non-executable runtime names the runtime path", async () => {
		const missingRuntime = join(binDir, "no-runtime");
		const { shimDir } = installShim(dir, { git: fakeBinary("git"), gh: fakeBinary("gh"), runtime: missingRuntime });
		const res = await run([join(shimDir, "git"), "push"], { GBI_GRANT_SOCK: join(dir, "s.sock") });
		expect(res.code).toBe(1);
		expect(res.stderr).toContain(`grant runtime is not executable at ${missingRuntime}`);
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
});

describe("stale-state sweep", () => {
	test("removes dead-pid sockets and shim dirs, keeps live ones and the legacy dir another live process may use", () => {
		mkdirSync(join(dir, "shim-99999"));
		writeFileSync(join(dir, "grant-99999.sock"), "");
		mkdirSync(join(dir, "shim-4242"));
		writeFileSync(join(dir, "grant-4242.sock"), "");
		mkdirSync(join(dir, "shim"));

		sweepStaleShimState(dir, pid => pid === 4242);

		expect(existsSync(join(dir, "shim-99999"))).toBe(false);
		expect(existsSync(join(dir, "grant-99999.sock"))).toBe(false);
		expect(existsSync(join(dir, "shim-4242"))).toBe(true);
		expect(existsSync(join(dir, "grant-4242.sock"))).toBe(true);
		expect(existsSync(join(dir, "shim"))).toBe(true);
	});

	test("drops the legacy shim dir once no other process holds a live socket", () => {
		writeFileSync(join(dir, "grant-99999.sock"), "");
		writeFileSync(join(dir, `grant-${process.pid}.sock`), "");
		mkdirSync(join(dir, "shim"));

		sweepStaleShimState(dir, pid => pid === process.pid);

		expect(existsSync(join(dir, "shim"))).toBe(false);
		expect(existsSync(join(dir, `grant-${process.pid}.sock`))).toBe(true);
	});

	test("default liveness keeps this process and rejects an invalid pid", () => {
		expect(defaultPidIsAlive(process.pid)).toBe(true);
		expect(defaultPidIsAlive(0)).toBe(false);
	});
});

describe("lifecycle cleanup", () => {
	test("removeShimState removes only its own dir and socket", () => {
		const mine = join(dir, "shim-11");
		const other = join(dir, "shim-22");
		mkdirSync(mine);
		mkdirSync(other);
		const sock = join(dir, "grant-11.sock");
		const otherSock = join(dir, "grant-22.sock");
		writeFileSync(sock, "");
		writeFileSync(otherSock, "");

		removeShimState(mine, sock);

		expect(existsSync(mine)).toBe(false);
		expect(existsSync(sock)).toBe(false);
		expect(existsSync(other)).toBe(true);
		expect(existsSync(otherSock)).toBe(true);
	});

	test("runs on natural exit and re-raises SIGTERM (default disposition preserved)", async () => {
		const shimTs = join(import.meta.dir, "..", "lib", "shim.ts");
		const childDir = mkdtempSync(join(tmpdir(), "gbi-life-"));
		const mkState = (n: string) => {
			const d = join(childDir, `shim-${n}`);
			const s = join(childDir, `grant-${n}.sock`);
			mkdirSync(d);
			writeFileSync(s, "");
			return { d, s };
		};
		const source = (d: string, s: string, stayAlive: boolean) => `
import { installShimCleanup } from ${JSON.stringify(shimTs)};
installShimCleanup({ shimDir: ${JSON.stringify(d)}, socketPath: ${JSON.stringify(s)} });
${stayAlive ? 'process.stdout.write("READY\\n");\nsetInterval(() => {}, 1000);' : ""}
`;

		try {
			// Natural exit: the `exit` handler removes the state.
			const exitState = mkState("1");
			const exitScript = join(childDir, "exit-child.ts");
			writeFileSync(exitScript, source(exitState.d, exitState.s, false));
			const exitProc = Bun.spawn(["bun", exitScript], { stdout: "ignore", stderr: "ignore" });
			expect(await exitProc.exited).toBe(0);
			expect(existsSync(exitState.d)).toBe(false);
			expect(existsSync(exitState.s)).toBe(false);

			// SIGTERM: the handler cleans up, then the signal is re-raised so the
			// process dies by the signal rather than being swallowed.
			const sigState = mkState("2");
			const sigScript = join(childDir, "sig-child.ts");
			writeFileSync(sigScript, source(sigState.d, sigState.s, true));
			const sigProc = Bun.spawn(["bun", sigScript], { stdout: "pipe", stderr: "ignore" });
			await readUntil(sigProc.stdout, "READY");
			sigProc.kill("SIGTERM");
			// Bun's per-test timeout fails the run if the handler ever swallowed the
			// signal; awaiting the real exit is the deterministic signal.
			const code = await sigProc.exited;
			expect(existsSync(sigState.d)).toBe(false);
			expect(existsSync(sigState.s)).toBe(false);
			expect(sigProc.signalCode === "SIGTERM" || code === 143).toBe(true);
		} finally {
			rmSync(childDir, { recursive: true, force: true });
		}
	});
});

/** Read a stream until `marker` appears (the child signals readiness). */
async function readUntil(stream: ReadableStream<Uint8Array> | null, marker: string): Promise<void> {
	if (!stream) return;
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buf = "";
	while (!buf.includes(marker)) {
		const { value, done } = await reader.read();
		if (done) break;
		buf += decoder.decode(value);
	}
	reader.releaseLock();
}

describe("evalGuidance", () => {
	test("contains the guidance markers used by the shim", () => {
		expect(evalGuidance()).toContain(BLOCK_PHRASE);
	});
});
