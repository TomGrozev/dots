import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefault } from "../index";
import { FakeExtensionAPI, bashEvent } from "./fake-extension-api";
import type { SpawnFn } from "../lib/config";
import type { BashToolCallEvent } from "@oh-my-pi/pi-coding-agent";

let credsDir: string;
let botDirBackup: string | undefined;
let botDirTemp: string;

beforeEach(() => {
	credsDir = mkdtempSync(join(tmpdir(), "gbi-hook-"));
	botDirBackup = process.env.GIT_BOT_CONFIG_DIR;
	botDirTemp = mkdtempSync(join(tmpdir(), "gbi-bot-"));
	process.env.GIT_BOT_CONFIG_DIR = botDirTemp;
});

afterEach(() => {
	if (botDirBackup === undefined) delete process.env.GIT_BOT_CONFIG_DIR;
	else process.env.GIT_BOT_CONFIG_DIR = botDirBackup;
	rmSync(credsDir, { recursive: true, force: true });
	rmSync(botDirTemp, { recursive: true, force: true });
});

const BASE = {
	name: "MyProject Agent",
	email: "12345678+myproject-agent@users.noreply.github.com",
	token: "github_pat_hooktoken",
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

describe("git-bot-identity hook", () => {
	test("write with creds present: env overlaid with agent identity and PAT transport", async () => {
		writeCreds();
		const pi = new FakeExtensionAPI();
		await createDefault(pi, { credsDir, spawn: fakeGpgSpawn() });
		const event = bashEvent("git add -A && git commit -m x");
		const result = await pi.dispatchToolCall(event);

		// No block: the call proceeds with mutated input env.
		expect(result).toBeUndefined();
		const env = event.input.env as Record<string, string>;
		expect(env.GIT_AUTHOR_NAME).toBe("MyProject Agent");
		expect(env.GIT_AUTHOR_EMAIL).toBe("12345678+myproject-agent@users.noreply.github.com");
		expect(env.GH_TOKEN).toBe("github_pat_hooktoken");
		expect(env.GIT_CONFIG_GLOBAL).toMatch(/gitconfig$/);
		// Transport uses the static PAT in the x-access-token slot.
		expect(env.GIT_CONFIG_KEY_0).toBe("url.https://x-access-token:github_pat_hooktoken@github.com/.insteadOf");
		// Bot owns signing: GNUPGHOME points at the bot gnupg dir (never the
		// human keyring) and the generated config pins the bot key.
		expect(env.GNUPGHOME).toBe(join(botDirTemp, "gnupg"));
		const gitconfig = readFileSync(join(botDirTemp, "gitconfig"), "utf8");
		expect(gitconfig).toContain("signingkey = ABCDEF1234567890");
		expect(gitconfig).toContain("gpgsign = true");
		// Co-author trailer is delivered via the bot's prepare-commit-msg hook.
		expect(env.GIT_BOT_COAUTHOR).toBe("Co-authored-by: TomGrozev <1491414+TomGrozev@users.noreply.github.com>");
	});

	test("read-only with creds present: runs as the agent account (transport granted, no signing)", async () => {
		writeCreds();
		const pi = new FakeExtensionAPI();
		await createDefault(pi, { credsDir });
		const event = bashEvent("git status");
		const result = await pi.dispatchToolCall(event);
		expect(result).toBeUndefined();
		const env = event.input.env as Record<string, string>;
		// Reads run as the agent account: PAT transport is granted...
		expect(env.GH_TOKEN).toBe("github_pat_hooktoken");
		expect(env.GIT_CONFIG_KEY_0).toBe("url.https://x-access-token:github_pat_hooktoken@github.com/.insteadOf");
		// ...with the real PATH restored so the real git runs, not the shim.
		expect(env.PATH).toBe(process.env.PATH);
		// ...but no signing is configured for a read (no gpg key resolution).
		const gitconfig = readFileSync(join(botDirTemp, "gitconfig"), "utf8");
		expect(gitconfig).not.toContain("gpgsign");
		expect(gitconfig).not.toContain("signingkey");
	});

	test("read-only without creds: passes through untouched", async () => {
		const pi = new FakeExtensionAPI();
		await createDefault(pi, { credsDir });
		const event = bashEvent("git log --oneline");
		await pi.dispatchToolCall(event);
		expect(event.input.env).toBeUndefined();
	});

	test("createDefault returns a neutral env that strips credentials (block by default)", async () => {
		const pi = new FakeExtensionAPI();
		const { neutralEnv } = await createDefault(pi, { credsDir });
		// gh keyring is defeated by an invalid sentinel token; git transport is
		// disabled; PATH is prefixed with the guidance shim; global config is a
		// credential-less deny file.
		expect(neutralEnv.GH_TOKEN).toBe("git-bot-identity-no-creds");
		expect(neutralEnv.GITHUB_TOKEN).toBe("git-bot-identity-no-creds");
		expect(neutralEnv.GIT_SSH_COMMAND).toBe("false");
		expect(neutralEnv.GIT_TERMINAL_PROMPT).toBe("0");
		expect(neutralEnv.SSH_AUTH_SOCK).toBe("");
		expect(neutralEnv.GIT_CONFIG_GLOBAL).toBe(join(credsDir, "deny-gitconfig"));
		expect((neutralEnv.PATH ?? "").startsWith(join(credsDir, "shim") + ":")).toBe(true);
		// scaffold exists on disk
		expect(existsSync(join(credsDir, "deny-gitconfig"))).toBe(true);
		expect(existsSync(join(credsDir, "shim", "git"))).toBe(true);
		expect(existsSync(join(credsDir, "shim", "gh"))).toBe(true);
		expect(readFileSync(join(credsDir, "deny-gitconfig"), "utf8")).toContain("[credential]");
	});

	test("write without creds: blocked with clear message, no fallback", async () => {
		const pi = new FakeExtensionAPI();
		await createDefault(pi, { credsDir });
		const event = bashEvent("git push origin main");
		const result = await pi.dispatchToolCall(event);
		expect(result?.block).toBe(true);
		expect(String(result?.reason)).toContain("bot credentials");
		expect(String(result?.reason)).toContain("no fallback");
	});

	test("write with a config.json missing a required key: blocked (fail-closed)", async () => {
		writeCreds({ token: undefined });
		const pi = new FakeExtensionAPI();
		await createDefault(pi, { credsDir });
		const event = bashEvent("git push origin main");
		const result = await pi.dispatchToolCall(event);
		expect(result?.block).toBe(true);
		expect(String(result?.reason)).toContain("no fallback");
	});

	test("non-bash tool calls are ignored", async () => {
		const pi = new FakeExtensionAPI();
		await createDefault(pi, { credsDir });
		const event = { type: "tool_call", toolCallId: "x", toolName: "read", input: { path: "/tmp/f" } };
		const result = await pi.dispatchToolCall(event as never);
		expect(result).toBeUndefined();
	});

	test("unrelated commands are ignored entirely", async () => {
		const pi = new FakeExtensionAPI();
		await createDefault(pi, { credsDir });
		const event = bashEvent("ls -la");
		const result = await pi.dispatchToolCall(event);
		expect(result).toBeUndefined();
		expect(event.input.env).toBeUndefined();
	});

	test("mixed line (benign write-adjacent, e.g. git status && foo push) triggers env overlay when creds present", async () => {
		writeCreds();
		const pi = new FakeExtensionAPI();
		await createDefault(pi, { credsDir, spawn: fakeGpgSpawn() });
		const event = bashEvent("git status && sgi push");
		await pi.dispatchToolCall(event);
		const env = event.input.env as Record<string, string>;
		expect(env.GIT_AUTHOR_NAME).toBe("MyProject Agent");
	});

	test("write blocked when bot gpg key setup fails (fail-closed, no unsigned fallback)", async () => {
		writeCreds();
		const pi = new FakeExtensionAPI();
		// Every gpg call fails → no key found, generation fails → block.
		const failingSpawn: SpawnFn = async () => ({ exitCode: 1, stdout: "", stderr: "" });
		await createDefault(pi, { credsDir, spawn: failingSpawn });
		const event = bashEvent("git push origin main");
		const result = await pi.dispatchToolCall(event);
		expect(result?.block).toBe(true);
		expect(String(result?.reason)).toContain("signing key setup failed");
		expect(String(result?.reason)).toContain("no fallback");
	});
});
