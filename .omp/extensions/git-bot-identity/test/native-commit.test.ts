import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vcsGitDiscover } from "@oh-my-pi/pi-natives";
import { buildBotCommitEnv, installCoauthorHook, type BotEnvConfig } from "../lib/env";
import { applyNativeEnv, failClosedNativeEnv } from "../lib/native-commit";

const CONFIG: BotEnvConfig = {
	name: "MyProject Agent",
	email: "12345678+myproject-agent@users.noreply.github.com",
	humanName: "TomGrozev",
	humanNoreply: "1491414+TomGrozev@users.noreply.github.com",
	token: "unused-in-native-path",
};

let botDirBackup: string | undefined;
let botDirTemp: string;
let repoDir: string;

async function git(args: string[], cwd: string): Promise<string> {
	const proc = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
	const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
	if ((await proc.exited) !== 0) throw new Error(`git ${args.join(" ")}: ${stderr}`);
	return stdout;
}

async function stage(repo: string, name: string): Promise<void> {
	writeFileSync(join(repo, name), `${name}\n`);
	await git(["add", name], repo);
}

beforeEach(async () => {
	botDirBackup = process.env.GIT_BOT_CONFIG_DIR;
	botDirTemp = mkdtempSync(join(tmpdir(), "gbi-native-commit-"));
	process.env.GIT_BOT_CONFIG_DIR = botDirTemp;
	repoDir = mkdtempSync(join(tmpdir(), "gbi-native-repo-"));
	await git(["init", "-q"], repoDir);
	await git(["config", "user.name", "Human Local"], repoDir);
	await git(["config", "user.email", "human@local.test"], repoDir);
	await git(["config", "commit.gpgsign", "false"], repoDir);
});

afterEach(() => {
	if (botDirBackup === undefined) delete process.env.GIT_BOT_CONFIG_DIR;
	else process.env.GIT_BOT_CONFIG_DIR = botDirBackup;
	rmSync(botDirTemp, { recursive: true, force: true });
	rmSync(repoDir, { recursive: true, force: true });
});

describe("native commit environment", () => {
	test("bot env gives a native commit bot identity and the human trailer", async () => {
		installCoauthorHook(CONFIG);
		await git(["config", "commit.gpgsign", "true"], repoDir);
		await git(["config", "user.signingkey", "0000000000000000"], repoDir);
		const restore = applyNativeEnv(buildBotCommitEnv(CONFIG));
		try {
			await stage(repoDir, "one");
			const repo = vcsGitDiscover(repoDir);
			expect(repo).not.toBeNull();
			await repo?.commitCreate("native path", {});
			expect(await git(["log", "-1", "--format=%an <%ae>"], repoDir)).toBe(
				"MyProject Agent <12345678+myproject-agent@users.noreply.github.com>\n",
			);
			expect(await git(["log", "-1", "--format=%B"], repoDir)).toContain(
				"Co-authored-by: TomGrozev <1491414+TomGrozev@users.noreply.github.com>",
			);
			// The human repo says sign; the bot has no key here, so the native
			// path must force signing off rather than use the human key.
			expect(await git(["cat-file", "-p", "HEAD"], repoDir)).not.toContain("gpgsig");
		} finally {
			restore();
		}
	});

	test("unconfigured bot blocks a native commit and restores the human", async () => {
		const restore = applyNativeEnv(failClosedNativeEnv());
		try {
			await stage(repoDir, "one");
			const repo = vcsGitDiscover(repoDir);
			expect(repo).not.toBeNull();
			await expect(repo?.commitCreate("must fail", {})).rejects.toThrow(/must not contain/);
			expect(await git(["rev-list", "--all", "--count"], repoDir)).toBe("0\n");
		} finally {
			restore();
		}

		await stage(repoDir, "two");
		const repo = vcsGitDiscover(repoDir);
		await repo?.commitCreate("human after restore", {});
		expect(await git(["log", "-1", "--format=%an <%ae>"], repoDir)).toBe("Human Local <human@local.test>\n");
	});
});
