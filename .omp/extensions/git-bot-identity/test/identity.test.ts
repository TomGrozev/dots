/**
 * Extension wiring tests under the shim-only model: the grant server's resolver
 * reproduces the two credential classes (read = transport only, write = full
 * creds + signing) and refuses when config/identity are absent or signing fails.
 */
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefault } from "../index";
import { redeem } from "./grant-probe";
import { stopGrantServer } from "../lib/grant-server";
import { GRANT_CLIENT_PATH } from "../lib/shim";
import type { SpawnFn } from "../lib/config";

let credsDir: string;
let botDirBackup: string | undefined;
let botDirTemp: string;

beforeEach(() => {
	credsDir = mkdtempSync(join(tmpdir(), "gbi-identity-"));
	botDirBackup = process.env.GIT_BOT_CONFIG_DIR;
	botDirTemp = mkdtempSync(join(tmpdir(), "gbi-bot-"));
	process.env.GIT_BOT_CONFIG_DIR = botDirTemp;
});

afterEach(() => {
	stopGrantServer(credsDir);
	if (botDirBackup === undefined) delete process.env.GIT_BOT_CONFIG_DIR;
	else process.env.GIT_BOT_CONFIG_DIR = botDirBackup;
	rmSync(credsDir, { recursive: true, force: true });
	rmSync(botDirTemp, { recursive: true, force: true });
});

const BASE = {
	name: "MyProject Agent",
	email: "12345678+myproject-agent@users.noreply.github.com",
	token: "github_pat_identitytoken",
	humanName: "TomGrozev",
	humanNoreply: "1491414+TomGrozev@users.noreply.github.com",
};

function writeCreds(overrides: Record<string, unknown> = {}) {
	writeFileSync(join(credsDir, "config.json"), JSON.stringify({ ...BASE, ...overrides }));
}

/** Fake gpg: the bot keyring already holds a secret key, so ensureBotKey never
 * shells out to a real gpg or generates anything. */
function fakeGpgSpawn(): SpawnFn {
	return async (cmd: string[]) => {
		if (cmd.includes("--list-secret-keys")) {
			return { exitCode: 0, stdout: "sec:u:2048:1:ABCDEF1234567890:20260101::...", stderr: "" };
		}
		return { exitCode: 0, stdout: "", stderr: "" };
	};
}

describe("grant resolver (read)", () => {
	test("read with creds: transport only, no signing, real PATH", async () => {
		writeCreds();
		const { neutralEnv } = await createDefault({ credsDir, spawn: fakeGpgSpawn() });
		const reply = await redeem(neutralEnv.GBI_GRANT_SOCK as string, "read");
		expect(reply.ok).toBe(true);
		const env = reply.env as Record<string, string>;
		expect(env.GH_TOKEN).toBe("github_pat_identitytoken");
		expect(env.GIT_CONFIG_KEY_0).toBe("url.https://x-access-token:github_pat_identitytoken@github.com/.insteadOf");
		expect(env.GIT_AUTHOR_NAME).toBe("MyProject Agent");
		// PATH restored to the pristine (pre-neutralization) value so the shim
		// execs the real git/gh and children resolve real binaries.
		const pristine = (globalThis as unknown as Record<symbol, Record<string, string> | undefined>)[
			Symbol.for("omp.git-bot-identity.pristine-env")
		];
		expect(env.PATH).toBe(pristine?.PATH);
		// No signing for a read (no gpg key resolution).
		const gitconfig = readFileSync(join(botDirTemp, "gitconfig"), "utf8");
		expect(gitconfig).not.toContain("gpgsign");
		expect(gitconfig).not.toContain("signingkey");
	});

	test("read with no config: refused with the block reason", async () => {
		const { neutralEnv } = await createDefault({ credsDir });
		const reply = await redeem(neutralEnv.GBI_GRANT_SOCK as string, "read");
		expect(reply.ok).toBe(false);
		expect(String(reply.reason)).toContain("bot credentials absent");
		expect(String(reply.reason)).toContain("no fallback");
	});
});

describe("grant resolver (write)", () => {
	test("write with creds: full creds plus bot signing and the co-author hook", async () => {
		writeCreds();
		const { neutralEnv } = await createDefault({ credsDir, spawn: fakeGpgSpawn() });
		const reply = await redeem(neutralEnv.GBI_GRANT_SOCK as string, "write");
		expect(reply.ok).toBe(true);
		const env = reply.env as Record<string, string>;
		expect(env.GIT_AUTHOR_EMAIL).toBe("12345678+myproject-agent@users.noreply.github.com");
		expect(env.GNUPGHOME).toBe(join(botDirTemp, "gnupg"));
		expect(env.GIT_BOT_COAUTHOR).toBe("Co-authored-by: TomGrozev <1491414+TomGrozev@users.noreply.github.com>");
		const gitconfig = readFileSync(join(botDirTemp, "gitconfig"), "utf8");
		expect(gitconfig).toContain("signingkey = ABCDEF1234567890");
		expect(gitconfig).toContain("gpgsign = true");
		expect(existsSync(join(botDirTemp, "hooks", "prepare-commit-msg"))).toBe(true);
	});

	test("write with no config: refused with the block reason", async () => {
		const { neutralEnv } = await createDefault({ credsDir });
		const reply = await redeem(neutralEnv.GBI_GRANT_SOCK as string, "write");
		expect(reply.ok).toBe(false);
		expect(String(reply.reason)).toContain("bot credentials absent");
	});

	test("write with a config.json missing a required key: refused (fail-closed)", async () => {
		writeCreds({ token: undefined });
		const { neutralEnv } = await createDefault({ credsDir });
		const reply = await redeem(neutralEnv.GBI_GRANT_SOCK as string, "write");
		expect(reply.ok).toBe(false);
		expect(String(reply.reason)).toContain("no fallback");
	});

	test("write with failing gpg key setup: refused (fail-closed, no unsigned fallback)", async () => {
		writeCreds();
		const failingSpawn: SpawnFn = async () => ({ exitCode: 1, stdout: "", stderr: "" });
		const { neutralEnv } = await createDefault({ credsDir, spawn: failingSpawn });
		const reply = await redeem(neutralEnv.GBI_GRANT_SOCK as string, "write");
		expect(reply.ok).toBe(false);
		expect(String(reply.reason)).toContain("signing key setup failed");
	});
});

describe("createDefault neutral scaffold", () => {
	test("returns a neutral env that strips credentials (strip by default)", async () => {
		const { neutralEnv } = await createDefault({ credsDir });
		expect(neutralEnv.GH_TOKEN).toBe("git-bot-identity-no-creds");
		expect(neutralEnv.GITHUB_TOKEN).toBe("git-bot-identity-no-creds");
		expect(neutralEnv.GIT_SSH_COMMAND).toBe("false");
		expect(neutralEnv.GIT_TERMINAL_PROMPT).toBe("0");
		expect(neutralEnv.SSH_AUTH_SOCK).toBe("");
		expect(neutralEnv.GIT_CONFIG_GLOBAL).toBe(join(credsDir, "deny-gitconfig"));
		expect((neutralEnv.PATH ?? "").startsWith(join(credsDir, "shim") + ":")).toBe(true);
		expect(existsSync(join(credsDir, "deny-gitconfig"))).toBe(true);
		expect(existsSync(join(credsDir, "shim", "git"))).toBe(true);
		expect(existsSync(join(credsDir, "shim", "gh"))).toBe(true);
		// The grant client is NOT copied into the shim dir; wrappers reference it.
		expect(existsSync(join(credsDir, "shim", "grant-client.ts"))).toBe(false);
		expect(readFileSync(join(credsDir, "shim", "git"), "utf8")).toContain(GRANT_CLIENT_PATH);
		expect(readFileSync(join(credsDir, "deny-gitconfig"), "utf8")).toContain("[credential]");
	});
});
