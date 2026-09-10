import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildBotEnv } from "../.omp/extensions/git-bot-identity/lib/env";

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

const CONFIG = {
	botSlug: "tomgrozev-dots[bot]",
	humanName: "TomGrozev",
	humanNoreply: "1491414+TomGrozev@users.noreply.github.com",
	token: "ghs_testtoken",
};

describe("buildBotEnv", () => {
	test("sets author/committer to the bot with human co-author trailer", () => {
		const env = buildBotEnv(CONFIG);
		expect(env.GIT_AUTHOR_NAME).toBe("tomgrozev-dots[bot]");
		expect(env.GIT_AUTHOR_EMAIL).toBe("tomgrozev-dots[bot]@users.noreply.github.com");
		expect(env.GIT_COMMITTER_NAME).toBe("tomgrozev-dots[bot]");
		expect(env.GIT_COMMITTER_EMAIL).toBe("tomgrozev-dots[bot]@users.noreply.github.com");
		expect(env.GIT_COMMITTER_DATE).toBeUndefined();
	});

	test("co-author trailer is delivered via prepare-commit-msg hook, not env", () => {
		const env = buildBotEnv(CONFIG);
		expect(env.GIT_BOT_COAUTHOR).toBe("Co-authored-by: TomGrozev <1491414+TomGrozev@users.noreply.github.com>");
		expect(env.GIT_CONFIG_VALUE_3).toContain("hooks");
	});

	test("grep of the env shows routing to bot-scoped git config and hooks path", () => {
		const env = buildBotEnv(CONFIG);
		expect(env.GIT_CONFIG_GLOBAL).toMatch(/gitconfig$/);
		expect(env.GIT_CONFIG_COUNT).toBe("4");
		expect(env.GIT_CONFIG_KEY_0).toBe("url.https://x-access-token:ghs_testtoken@github.com/.insteadOf");
		expect(env.GIT_CONFIG_VALUE_0).toBe("git@github.com:");
		expect(env.GIT_CONFIG_KEY_1).toBe("user.name");
		expect(env.GIT_CONFIG_KEY_2).toBe("commit.gpgsign");
		expect(env.GIT_CONFIG_VALUE_2).toBe("false");
		expect(env.GIT_CONFIG_KEY_3).toBe("core.hooksPath");
	});

	test("GH_TOKEN carried for gh; GIT_TERMINAL_PROMPT disabled", () => {
		const env = buildBotEnv(CONFIG);
		expect(env.GH_TOKEN).toBe("ghs_testtoken");
		expect(env.GIT_TERMINAL_PROMPT).toBe("0");
	});
});
