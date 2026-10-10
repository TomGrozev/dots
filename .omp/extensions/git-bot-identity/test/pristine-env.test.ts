/**
 * Regression tests for the pristine-env capture and the fail-closed bind path.
 *
 * Root cause covered here: `createDefault` used to snapshot `process.env` on
 * every bind. After the FIRST bind the default export overwrote `process.env`
 * with the neutral overlay (GIT_CONFIG_GLOBAL → the deny gitconfig), so a
 * SECOND bind in the same process (subagent, new session) resolved the human
 * identity against the overlay and threw — leaving the bot path dead. Latent
 * seam: if the first bind threw, the overlay was never installed, so writes ran
 * unguarded.
 */
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefault } from "../index";
import { redeem } from "./grant-probe";
import { stopGrantServer } from "../lib/grant-server";
import type { SpawnFn } from "../lib/config";

/** Same registry key the extension uses to hold its process-wide snapshot. */
const PRISTINE_ENV_KEY = Symbol.for("omp.git-bot-identity.pristine-env");

let credsDir: string;
let stubDir: string;
let stubPath: string;
let envBackup: Record<string, string | undefined>;

const BOT = {
	name: "MyProject Agent",
	email: "12345678+myproject-agent@users.noreply.github.com",
	token: "github_pat_pristine",
};

const HUMAN_NAME = "TomGrozev";
const HUMAN_EMAIL = "1491414+TomGrozev@users.noreply.github.com";

/** Credentials WITHOUT humanName/humanNoreply, so the human co-author identity
 * can only come from the real git config read (the stub below). */
function writeCreds() {
	writeFileSync(join(credsDir, "config.json"), JSON.stringify(BOT));
}

/**
 * Stub `git` on PATH: honours GIT_CONFIG_GLOBAL exactly as git does — the deny
 * gitconfig has no `[user]`, so it fails. This is what makes the pre-fix bug
 * observable without depending on the developer's real git config.
 */
function installStubGit() {
	const script = `#!/bin/sh
case "$GIT_CONFIG_GLOBAL" in
  *deny-gitconfig) echo "fatal: unable to read config: no user" >&2; exit 1;;
esac
case "$*" in
  *user.name*) echo "${HUMAN_NAME}";;
  *user.email*) echo "${HUMAN_EMAIL}";;
esac
exit 0
`;
	const stub = join(stubDir, "git");
	writeFileSync(stub, script);
	chmodSync(stub, 0o755);
}

/** Minimal executable stand-in for a git/gh binary on PATH. */
function writeStubExe(file: string) {
	writeFileSync(file, "#!/bin/sh\nexit 0\n");
	chmodSync(file, 0o755);
}

/** Extract the single-quoted `REALBIN=` path a generated shim script bakes in. */
function realBinOf(script: string): string {
	const line = script.split("\n").find(l => l.startsWith("REALBIN="));
	if (line === undefined) throw new Error("no REALBIN line in shim script");
	return line.slice("REALBIN=".length).replace(/^'(.*)'$/, "$1");
}

beforeEach(() => {
	envBackup = { ...process.env };
	credsDir = mkdtempSync(join(tmpdir(), "gbi-pristine-"));
	stubDir = mkdtempSync(join(tmpdir(), "gbi-stub-"));
	installStubGit();
	stubPath = stubDir;
	// The snapshot is process-wide; clear it so this test captures the stub PATH.
	delete (globalThis as unknown as Record<symbol, unknown>)[PRISTINE_ENV_KEY];
	// Ambient omp-neutralized env (a leaked GIT_CONFIG_GLOBAL would make the
	// stub git fail-closed for reasons unrelated to the snapshot).
	delete process.env.GIT_CONFIG_GLOBAL;
	delete process.env.GIT_BOT_CONFIG_DIR;
	process.env.PATH = stubPath;
});

afterEach(() => {
	stopGrantServer(credsDir);
	delete (globalThis as unknown as Record<symbol, unknown>)[PRISTINE_ENV_KEY];
	// Restore process.env wholesale: these tests emulate the default export's
	// `Object.assign(process.env, neutralEnv)`.
	for (const key of Object.keys(process.env)) {
		if (envBackup[key] === undefined) delete process.env[key];
	}
	for (const [key, value] of Object.entries(envBackup)) {
		if (value !== undefined) process.env[key] = value;
	}
	rmSync(credsDir, { recursive: true, force: true });
	rmSync(stubDir, { recursive: true, force: true });
});

describe("pristine env across binds", () => {
	test("two consecutive binds in one process both resolve the human identity", async () => {
		writeCreds();

		// Bind #1, then the production default export's neutralization.
		const bind1 = await createDefault({ credsDir });
		Object.assign(process.env, bind1.neutralEnv);
		delete process.env.SSH_AUTH_SOCK;
		expect(process.env.GIT_CONFIG_GLOBAL).toBe(join(credsDir, "deny-gitconfig"));

		// Bind #2 in the same process: identity must come from the pristine
		// snapshot, not from the overlay installed above (pre-fix: threw).
		const bind2 = await createDefault({ credsDir });
		// Overlay unchanged: same deny config, no shim dir prepended twice.
		expect(bind2.neutralEnv.GIT_CONFIG_GLOBAL).toBe(join(credsDir, "deny-gitconfig"));
		expect(bind2.neutralEnv.PATH).toBe(`${join(credsDir, "shim")}:${stubPath}`);

		// A read is granted the bot transport + resolved human co-author, which
		// only happens when `identity` is non-null. The grant is redeemed over the
		// live socket, exactly as the shim does.
		const env = (await redeem(bind2.neutralEnv.GBI_GRANT_SOCK as string, "read")).env as Record<string, string>;
		expect(env.GH_TOKEN).toBe(BOT.token);
		expect(env.PATH).toBe(stubPath);
		expect(env.GIT_BOT_COAUTHOR).toBe(`Co-authored-by: ${HUMAN_NAME} <${HUMAN_EMAIL}>`);
	});

	test("a throwing first bind still installs the overlay and keeps every request refused", async () => {
		writeCreds();
		// Every git-config read fails → resolveHumanIdentity throws.
		const failingSpawn: SpawnFn = async () => ({ exitCode: 1, stdout: "", stderr: "fatal: no user" });

		const warnings: string[] = [];
		const originalWarn = console.warn;
		console.warn = (...args: unknown[]) => void warnings.push(args.map(String).join(" "));
		const result = await createDefault({ credsDir, spawn: failingSpawn }).finally(() => {
			console.warn = originalWarn;
		});

		// Distinct warning, not a load error — the caller (default export) can
		// still install the overlay.
		expect(warnings.length).toBe(1);
		expect(warnings[0]).toContain("[git-bot-identity] human identity unresolved");

		// The full deny overlay is produced even on a failed bind.
		expect(result.neutralEnv.GIT_CONFIG_GLOBAL).toBe(join(credsDir, "deny-gitconfig"));
		expect(result.neutralEnv.GH_TOKEN).toBe("git-bot-identity-no-creds");
		expect(result.neutralEnv.GIT_SSH_COMMAND).toBe("false");

		// A later bind in the same process shares the socket but re-installs its
		// own (still-refusing) resolver; no mode ever receives credentials.
		const later = await createDefault({ credsDir, spawn: failingSpawn });
		const write = await redeem(later.neutralEnv.GBI_GRANT_SOCK as string, "write");
		expect(write.ok).toBe(false);
		expect(String(write.reason)).toContain("no fallback");
		const read = await redeem(later.neutralEnv.GBI_GRANT_SOCK as string, "read");
		expect(read.ok).toBe(false);
	});

	test("inherited neutral env: a shim dir first on PATH never becomes the shim's own REALBIN", async () => {
		writeCreds();

		// An omp process launched from an agent shell inherits the NEUTRALIZED
		// env as its "pristine" snapshot: PATH already starts with the shim dir.
		// Give that dir executable git/gh stubs — exactly what `Bun.which` would
		// resolve to if the snapshot's shim-dir filter were absent — and put the
		// real dir after it, with its own git/gh.
		const shimDir = join(credsDir, "shim");
		mkdirSync(shimDir, { recursive: true });
		writeStubExe(join(shimDir, "git"));
		writeStubExe(join(shimDir, "gh"));
		writeStubExe(join(stubDir, "gh"));
		process.env.PATH = `${shimDir}:${stubDir}`;

		const bind = await createDefault({ credsDir });

		// The pristine snapshot keeps the REAL path: the shim dir is filtered out.
		const pristinePath = bind.pristineEnv.PATH ?? "";
		expect(pristinePath).toBe(stubDir);
		expect(pristinePath.split(":")).not.toContain(shimDir);

		// The installed shims resolve their real binaries OUTSIDE the shim dir —
		// pointing REALBIN at the shim itself re-enters it (no socket → writes
		// block, reads loop forever).
		for (const bin of ["git", "gh"] as const) {
			const realbin = realBinOf(readFileSync(join(shimDir, bin), "utf8"));
			expect(realbin).toBe(join(stubDir, bin));
			expect(realbin.startsWith(`${shimDir}/`)).toBe(false);
		}

		// The PATH granted to an actual call excludes the shim dir too.
		const env = (await redeem(bind.neutralEnv.GBI_GRANT_SOCK as string, "read")).env as Record<string, string>;
		expect(env.PATH).toBe(stubDir);
	});
});
