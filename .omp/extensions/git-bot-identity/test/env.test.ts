import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildBotEnv, installCoauthorHook, botConfigDir, type BotEnvConfig } from "../lib/env";

let botDirBackup: string | undefined;
let botDirTemp: string;

beforeEach(() => {
	botDirBackup = process.env.GIT_BOT_CONFIG_DIR;
	botDirTemp = mkdtempSync(join(tmpdir(), "gbi-env-"));
	process.env.GIT_BOT_CONFIG_DIR = botDirTemp;
});

afterEach(() => {
	if (botDirBackup === undefined) delete process.env.GIT_BOT_CONFIG_DIR;
	else process.env.GIT_BOT_CONFIG_DIR = botDirBackup;
	rmSync(botDirTemp, { recursive: true, force: true });
});

const CONFIG: BotEnvConfig = {
	name: "MyProject Agent",
	email: "12345678+myproject-agent@users.noreply.github.com",
	humanName: "TomGrozev",
	humanNoreply: "1491414+TomGrozev@users.noreply.github.com",
	token: "github_pat_testtoken",
};

describe("buildBotEnv", () => {
	test("sets author/committer to the agent account with human co-author trailer", () => {
		const env = buildBotEnv(CONFIG);
		expect(env.GIT_AUTHOR_NAME).toBe("MyProject Agent");
		expect(env.GIT_AUTHOR_EMAIL).toBe("12345678+myproject-agent@users.noreply.github.com");
		expect(env.GIT_COMMITTER_NAME).toBe("MyProject Agent");
		expect(env.GIT_COMMITTER_EMAIL).toBe("12345678+myproject-agent@users.noreply.github.com");
		expect(env.GIT_COMMITTER_DATE).toBeUndefined();
	});

	test("co-author trailer is delivered via prepare-commit-msg hook, not env", () => {
		const env = buildBotEnv(CONFIG);
		expect(env.GIT_BOT_COAUTHOR).toBe("Co-authored-by: TomGrozev <1491414+TomGrozev@users.noreply.github.com>");
		expect(env.GIT_CONFIG_VALUE_2).toContain("hooks");
	});

	test("grep of the env shows routing to bot-scoped git config and hooks path", () => {
		const env = buildBotEnv(CONFIG);
		expect(env.GIT_CONFIG_GLOBAL).toMatch(/gitconfig$/);
		expect(env.GIT_CONFIG_COUNT).toBe("3");
		expect(env.GIT_CONFIG_KEY_0).toBe("url.https://x-access-token:github_pat_testtoken@github.com/.insteadOf");
		expect(env.GIT_CONFIG_VALUE_0).toBe("git@github.com:");
		expect(env.GIT_CONFIG_KEY_1).toBe("user.name");
		expect(env.GIT_CONFIG_KEY_2).toBe("core.hooksPath");
	});

	test("without signingKey: no gpgsign and no signingkey anywhere", () => {
		const env = buildBotEnv(CONFIG);
		// No gpgsign/signingkey in the env values…
		expect(Object.values(env).join("\n")).not.toMatch(/gpgsign|signingkey/i);
		// …nor in the generated global config.
		const gitconfig = readFileSync(join(botConfigDir(), "gitconfig"), "utf8");
		expect(gitconfig).not.toMatch(/gpgsign|signingkey/i);
	});

	test("with signingKey: generated config signs commits with the bot's key", () => {
		const env = buildBotEnv({ ...CONFIG, signingKey: "ABCDEF1234567890" });
		const gitconfig = readFileSync(join(botConfigDir(), "gitconfig"), "utf8");
		expect(gitconfig).toContain("signingkey = ABCDEF1234567890");
		expect(gitconfig).toContain("[commit]");
		expect(gitconfig).toContain("gpgsign = true");
		// Guardrail: signing is only ever enabled, never disabled.
		expect(Object.values(env).join("\n")).not.toContain("gpgsign = false");
		expect(gitconfig).not.toContain("gpgsign = false");
		// Command-line scope stays at 3 (hooks only); signing lives in global config.
		expect(env.GIT_CONFIG_COUNT).toBe("3");
	});

	test("no [gpg] program section is emitted; bot signs via GNUPGHOME", () => {
		const env = buildBotEnv({ ...CONFIG, signingKey: "ABCDEF1234567890" });
		const gitconfig = readFileSync(join(botConfigDir(), "gitconfig"), "utf8");
		expect(gitconfig).not.toContain("[gpg]");
		expect(env.GNUPGHOME).toBe(join(botConfigDir(), "gnupg"));
	});

	test("GNUPGHOME points at the bot gnupg dir and is always present", () => {
		const env = buildBotEnv(CONFIG);
		expect(env.GNUPGHOME).toBe(join(botConfigDir(), "gnupg"));
	});

	test("GPG_TTY is never passed through, even when set in the outer process", () => {
		const prev = process.env.GPG_TTY;
		try {
			process.env.GPG_TTY = "/dev/ttys001";
			const env = buildBotEnv(CONFIG);
			expect(env.GPG_TTY).toBeUndefined();
		} finally {
			if (prev === undefined) delete process.env.GPG_TTY;
			else process.env.GPG_TTY = prev;
		}
	});

	test("GH_TOKEN carries the PAT; GIT_TERMINAL_PROMPT disabled", () => {
		const env = buildBotEnv(CONFIG);
		expect(env.GH_TOKEN).toBe("github_pat_testtoken");
		expect(env.GIT_TERMINAL_PROMPT).toBe("0");
	});
});

describe("installCoauthorHook", () => {
	test("skips squash merges and amend/reword (source=commit), not squash-less typos", () => {
		installCoauthorHook(CONFIG);
		const script = readFileSync(join(botConfigDir(), "hooks", "prepare-commit-msg"), "utf8");
		expect(script).toContain("merge|squash|commit) exit 0 ;;");
		expect(script).not.toContain("squeeze");
	});

	test("appends the co-author trailer to fresh commits", () => {
		installCoauthorHook(CONFIG);
		const script = readFileSync(join(botConfigDir(), "hooks", "prepare-commit-msg"), "utf8");
		expect(script).toContain("Co-authored-by: TomGrozev <1491414+TomGrozev@users.noreply.github.com>");
		expect(script).toContain("grep -qi \"^Co-authored-by:\"");
	});
});
