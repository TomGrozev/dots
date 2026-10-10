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

/** The ordered command-line-scope config pairs buildBotEnv emits. */
function configPairs(env: Record<string, string>): Array<[string, string]> {
	const count = Number(env.GIT_CONFIG_COUNT);
	return Array.from({ length: count }, (_, i) => [
		env[`GIT_CONFIG_KEY_${i}`] as string,
		env[`GIT_CONFIG_VALUE_${i}`] as string,
	]);
}

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
		const hooksPath = configPairs(env).find(([key]) => key === "core.hooksPath");
		expect(hooksPath?.[1]).toContain("hooks");
	});

	test("routing to bot-scoped git config and hooks path rides the command-line scope", () => {
		const env = buildBotEnv(CONFIG);
		expect(env.GIT_CONFIG_GLOBAL?.endsWith("deny-gitconfig")).toBe(true);
		const pairs = configPairs(env);
		expect(pairs).toContainEqual(["user.name", CONFIG.name]);
		expect(pairs).toContainEqual(["user.email", CONFIG.email]);
		expect(pairs).toContainEqual([
			"url.https://x-access-token:github_pat_testtoken@github.com/.insteadOf",
			"git@github.com:",
		]);
		expect(pairs).toContainEqual([
			"url.https://x-access-token:github_pat_testtoken@github.com/.insteadOf",
			"ssh://git@github.com/",
		]);
		expect(pairs.map(([key]) => key)).toContain("core.hooksPath");
		expect(env.GIT_CONFIG_COUNT).toBe(String(pairs.length));
	});

	test("without signingKey: no gpgsign and no signingkey anywhere", () => {
		const env = buildBotEnv(CONFIG);
		const keys = configPairs(env).map(([key]) => key);
		expect(keys).not.toContain("user.signingkey");
		expect(keys).not.toContain("commit.gpgsign");
		expect(Object.values(env).join("\n")).not.toMatch(/gpgsign|signingkey/i);
	});

	test("with signingKey: command-line config signs commits with the bot's key", () => {
		const env = buildBotEnv({ ...CONFIG, signingKey: "ABCDEF1234567890" });
		const pairs = configPairs(env);
		expect(pairs).toContainEqual(["user.signingkey", "ABCDEF1234567890"]);
		expect(pairs).toContainEqual(["commit.gpgsign", "true"]);
		// Guardrail: signing is only ever enabled, never disabled.
		expect(Object.values(env).join("\n")).not.toContain("gpgsign = false");
	});

	test("no gpg program is emitted; bot signs via GNUPGHOME", () => {
		const env = buildBotEnv({ ...CONFIG, signingKey: "ABCDEF1234567890" });
		expect(configPairs(env).map(([key]) => key)).not.toContain("gpg.program");
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
