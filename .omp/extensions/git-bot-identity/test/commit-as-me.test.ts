/**
 * `commit_as_me` boundary tests. These run the REAL tool against REAL temp git
 * repositories (no git stub): the whole point is that the approved commit is
 * authored/committed by the HUMAN identity, signed/config'd by the human's own
 * environment, with the BOT only as a `Co-authored-by` trailer.
 *
 * The human env passed to the tool isolates git from the developer's real global
 * config (HOME / GIT_CONFIG_GLOBAL / GIT_CONFIG_SYSTEM redirected), and the test
 * repo disables signing in its OWN local config — the tool must honour that
 * local config rather than passing any signing flags of its own.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { installCommitAsMe, type CommitAsMeDetails, type CommitAsMeHookApi } from "../lib/commit-as-me";
import { buildBotEnv, installCoauthorHook, type BotEnvConfig } from "../lib/env";
import type { GrantDecision } from "../lib/grant-server";
import { FakeExtensionAPI, makeFakeUi } from "./fake-extension-api";

const BOT = { name: "MyProject Agent", email: "12345678+myproject-agent@users.noreply.github.com" };
const TRAILER = `Co-authored-by: ${BOT.name} <${BOT.email}>`;

const HUMAN_NAME = "Human Dev";
const HUMAN_EMAIL = "human@example.com";
/** The exact label the human must pick to approve; Cancel is the default. */
const APPROVE = `Commit as ${HUMAN_NAME} <${HUMAN_EMAIL}>`;
/** The exact label the human picks to switch to the bot at the dialog. */
const BOT_CHOICE = `Commit as the bot ${BOT.name} <${BOT.email}>`;

let root: string;
let repo: string;
let home: string;
let humanEnv: Record<string, string>;

/** Run git in the temp repo under the isolated human env. */
function git(args: string[]): { code: number; out: string; err: string } {
	const proc = Bun.spawnSync(["git", "-C", repo, ...args], {
		env: humanEnv,
		stdout: "pipe",
		stderr: "pipe",
	});
	return { code: proc.exitCode, out: proc.stdout.toString(), err: proc.stderr.toString() };
}

/** Commit fields from HEAD, NUL-separated. */
function headFields(): { authorName: string; authorEmail: string; committerName: string; committerEmail: string; subject: string; body: string } {
	const { out } = git(["log", "-1", "--format=%an%x00%ae%x00%cn%x00%ce%x00%s%x00%B"]);
	const [authorName, authorEmail, committerName, committerEmail, subject, body] = out.split("\0");
	return { authorName: authorName!, authorEmail: authorEmail!, committerName: committerName!, committerEmail: committerEmail!, subject: subject ?? "", body: body ?? "" };
}

function commitCount(): number {
	const { out } = git(["rev-list", "--count", "HEAD"]);
	return out.trim() === "" ? 0 : Number(out.trim());
}

function stage(file: string, content: string): void {
	writeFileSync(join(repo, file), content);
	expect(git(["add", file]).code).toBe(0);
}

/**
 * A realistic bot write-class env (bot author/committer + the bot-scoped hook
 * that adds the human trailer), built with the production builders so the test
 * exercises the same env shape the grant resolver hands the shim. No signing
 * key: like the real path with a signing-less bot, the repo's local
 * `commit.gpgsign=false` leaves the commit unsigned.
 */
function makeBotWriteEnv(): Record<string, string> {
	const base: BotEnvConfig = {
		name: BOT.name,
		email: BOT.email,
		token: "github_pat_test_token",
		humanName: HUMAN_NAME,
		humanNoreply: HUMAN_EMAIL,
	};
	installCoauthorHook(base);
	return { ...buildBotEnv(base), PATH: humanEnv.PATH! };
}

/** Refusal by default — human-path tests never trigger the bot resolver. */
const REFUSE_BOT: () => Promise<GrantDecision> = async () => ({
	ok: false,
	reason: "git-bot-identity: write blocked — the agent has no usable GitHub credentials.",
});

/** Build the registered tool from the fake api (real schema, real execute). */
function makeTool(
	bot: typeof BOT | null,
	resolveBotWriteEnv: () => Promise<GrantDecision> = REFUSE_BOT,
): { api: FakeExtensionAPI; tool: { execute: (...args: unknown[]) => Promise<{ details?: unknown }> } } {
	const api = new FakeExtensionAPI();
	installCommitAsMe(api as unknown as CommitAsMeHookApi, { getBot: async () => bot, humanEnv, resolveBotWriteEnv });
	const tool = api.tools["commit_as_me"];
	if (!tool) throw new Error("commit_as_me was not registered");
	return { api, tool: tool as unknown as { execute: (...args: unknown[]) => Promise<{ details?: unknown }> } };
}

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "gbi-commit-as-me-"));
	repo = join(root, "repo");
	home = join(root, "home");
	mkdirSync(home, { recursive: true });
	// The tool runs git via PATH; strip the extension's guidance shim (present on
	// the omp-inherited PATH) so the REAL git runs, exactly as the pristine
	// pre-neutralization PATH does in production.
	const realPath =
		(process.env.PATH ?? "/usr/bin:/bin")
			.split(":")
			.filter(entry => entry !== "" && !entry.includes("git-bot-identity/shim"))
			.join(":") || "/usr/bin:/bin";
	humanEnv = {
		...process.env,
		HOME: home,
		XDG_CONFIG_HOME: join(home, ".config"),
		GIT_CONFIG_GLOBAL: "/dev/null",
		GIT_CONFIG_SYSTEM: "/dev/null",
		GIT_CONFIG_NOSYSTEM: "1",
		PATH: realPath,
	};
	// Remove any bot identity that may have leaked from another test file.
	delete humanEnv.GIT_AUTHOR_NAME;
	delete humanEnv.GIT_AUTHOR_EMAIL;
	delete humanEnv.GIT_COMMITTER_NAME;
	delete humanEnv.GIT_COMMITTER_EMAIL;
	delete humanEnv.GNUPGHOME;
	delete humanEnv.GIT_CONFIG_COUNT;
	delete humanEnv.GIT_CONFIG_KEY_0;
	delete humanEnv.GIT_CONFIG_KEY_1;
	delete humanEnv.GIT_CONFIG_KEY_2;
	delete humanEnv.GIT_CONFIG_VALUE_0;
	delete humanEnv.GIT_CONFIG_VALUE_1;
	delete humanEnv.GIT_CONFIG_VALUE_2;

	expect(Bun.spawnSync(["git", "init", "-q", repo], { env: humanEnv }).exitCode).toBe(0);
	expect(git(["config", "user.name", HUMAN_NAME]).code).toBe(0);
	expect(git(["config", "user.email", HUMAN_EMAIL]).code).toBe(0);
	expect(git(["config", "commit.gpgsign", "false"]).code).toBe(0);
	// Redirect the bot scaffold (gitconfig + co-author hook) away from the real
	// ~/.config path; makeBotWriteEnv reads this at execute time.
	process.env.GIT_BOT_CONFIG_DIR = join(root, "botconfig");
});

afterEach(() => {
	delete process.env.GIT_BOT_CONFIG_DIR;
	rmSync(root, { recursive: true, force: true });
});

describe("commit_as_me", () => {
	test("approved: commits as the human identity with the bot trailer appended", async () => {
		stage("a.txt", "hello\n");
		const { tool } = makeTool(BOT);
		const ui = makeFakeUi({ selects: [APPROVE] });
		const ctx = ui.ctx({ cwd: repo }) as ExtensionContext;

		const result = await tool.execute("call-1", { message: "feat: add a file" }, undefined, undefined, ctx);
		const details = result.details as CommitAsMeDetails;
		expect(details.identity).toBe("human");
		expect(details.subject).toBe("feat: add a file");
		expect(details.hash).toMatch(/^[0-9a-f]{7,}$/);

		const head = headFields();
		expect(head.authorName).toBe(HUMAN_NAME);
		expect(head.authorEmail).toBe(HUMAN_EMAIL);
		expect(head.committerName).toBe(HUMAN_NAME);
		expect(head.committerEmail).toBe(HUMAN_EMAIL);
		expect(head.subject).toBe("feat: add a file");
		expect(head.body).toContain(TRAILER);
		expect(head.body.split(TRAILER).length - 1).toBe(1);

		// The gate is a select that names the human identity; Cancel is the
		// default cursor position, so a stray Enter can never approve.
		expect(ui.selectCalls.length).toBe(1);
		const call = ui.selectCalls[0]!;
		expect(call.title).toContain("COMMIT AS YOURSELF");
		expect(call.dialogOptions?.initialIndex).toBe(0);
		const labels = call.options.map(o => (typeof o === "string" ? o : o.label));
		expect(labels[0]).toContain("Cancel");
		expect(labels[1]).toBe(APPROVE);
		// The approve row states who authors/signs AND shows the staged stat and
		// the final (trailered) message.
		const approve = call.options[1] as { description: string };
		expect(approve.description).toContain(HUMAN_NAME);
		expect(approve.description).toContain(HUMAN_EMAIL);
		expect(approve.description).toContain("GPG");
		expect(approve.description).toContain("a.txt");
		expect(approve.description).toContain(TRAILER);
		expect(approve.description).toContain("feat: add a file");
		// A warning toast also names the human identity.
		expect(ui.notifications.some(n => n.type === "warning" && n.message.includes(HUMAN_NAME))).toBe(true);
	});

	test("message that already carries the bot trailer: not duplicated", async () => {
		stage("a.txt", "hello\n");
		const { tool } = makeTool(BOT);
		const ui = makeFakeUi({ selects: [APPROVE] });
		const ctx = ui.ctx({ cwd: repo }) as ExtensionContext;

		await tool.execute("call-1", { message: `fix: thing\n\n${TRAILER}` }, undefined, undefined, ctx);

		const head = headFields();
		expect(head.body).toContain(TRAILER);
		expect(head.body.split(TRAILER).length - 1).toBe(1);
	});

	test("no bot config: commits with no trailer at all, and the bot row is omitted", async () => {
		stage("a.txt", "hello\n");
		const { tool } = makeTool(null);
		const ui = makeFakeUi({ selects: [APPROVE] });
		const ctx = ui.ctx({ cwd: repo }) as ExtensionContext;

		const result = await tool.execute("call-1", { message: "chore: untrailered" }, undefined, undefined, ctx);

		const head = headFields();
		expect(head.body).not.toContain("Co-authored-by:");
		expect(head.authorName).toBe(HUMAN_NAME);
		expect((result.details as CommitAsMeDetails).identity).toBe("human");
		// Without a configured bot the select offers only Cancel + the human row
		// (an offered bot row could only refuse — the honest select omits it).
		const labels = ui.selectCalls[0]!.options.map(o => (typeof o === "string" ? o : o.label));
		expect(labels).toEqual(["Cancel — do not commit", APPROVE]);
	});

	test("bot choice: commits as the bot, no bot self-trailer, human trailer added by the bot hook", async () => {
		stage("a.txt", "hello\n");
		const { tool } = makeTool(BOT, async () => ({ ok: true, env: makeBotWriteEnv() }));
		const ui = makeFakeUi({ selects: [BOT_CHOICE] });
		const ctx = ui.ctx({ cwd: repo }) as ExtensionContext;

		// The agent's message even carries the bot trailer (as the human path
		// would append); the bot path must strip it rather than credit itself.
		const result = await tool.execute("call-1", { message: `feat: via bot\n\n${TRAILER}` }, undefined, undefined, ctx);

		expect((result.details as CommitAsMeDetails).identity).toBe("bot");
		const head = headFields();
		expect(head.authorName).toBe(BOT.name);
		expect(head.authorEmail).toBe(BOT.email);
		expect(head.committerName).toBe(BOT.name);
		expect(head.committerEmail).toBe(BOT.email);
		expect(head.body).not.toContain(TRAILER);
		expect(head.body).toContain(`Co-authored-by: ${HUMAN_NAME} <${HUMAN_EMAIL}>`);

		// The gate offers Cancel, the human, and the bot — in that order.
		const labels = ui.selectCalls[0]!.options.map(o => (typeof o === "string" ? o : o.label));
		expect(labels).toEqual(["Cancel — do not commit", APPROVE, BOT_CHOICE]);
		expect(ui.selectCalls[0]!.dialogOptions?.initialIndex).toBe(0);
	});

	test("bot choice with missing creds: fails closed, nothing committed", async () => {
		stage("a.txt", "hello\n");
		const { tool } = makeTool(BOT); // default resolver refuses
		const ui = makeFakeUi({ selects: [BOT_CHOICE] });
		const ctx = ui.ctx({ cwd: repo }) as ExtensionContext;

		await expect(tool.execute("call-1", { message: "feat: nope" }, undefined, undefined, ctx)).rejects.toThrow(
			/cannot commit as the bot/,
		);
		expect(commitCount()).toBe(0);
	});

	test("nothing staged: errors and does not commit", async () => {
		const { tool } = makeTool(BOT);
		const ui = makeFakeUi();
		const ctx = ui.ctx({ cwd: repo }) as ExtensionContext;

		await expect(tool.execute("call-1", { message: "feat: nope" }, undefined, undefined, ctx)).rejects.toThrow(/nothing staged/);
		expect(commitCount()).toBe(0);
		expect(ui.selectCalls.length).toBe(0);
	});

	test("cancel choice: errors with the git commit -F command and a temp file holding the message", async () => {
		stage("a.txt", "hello\n");
		const { tool } = makeTool(BOT);
		const ui = makeFakeUi({ selects: ["Cancel — do not commit"] });
		const ctx = ui.ctx({ cwd: repo }) as ExtensionContext;

		let error: Error | undefined;
		try {
			await tool.execute("call-1", { message: "feat: declined" }, undefined, undefined, ctx);
		} catch (err) {
			error = err as Error;
		}
		expect(error).toBeDefined();
		expect(error!.message).toContain("User declined commit_as_me");
		expect(error!.message).toContain("git commit -F ");

		const path = /git commit -F (\S+)/.exec(error!.message)?.[1];
		expect(path).toBeDefined();
		expect(existsSync(path!)).toBe(true);
		const written = readFileSync(path!, "utf8");
		expect(written).toContain("feat: declined");
		expect(written).toContain(TRAILER);
		rmSync(path!, { force: true });

		// No commit was created.
		expect(commitCount()).toBe(0);
	});

	test("escape/undefined from the select: declines without committing", async () => {
		stage("a.txt", "hello\n");
		const { tool } = makeTool(BOT);
		const ui = makeFakeUi({ selects: [undefined] });
		const ctx = ui.ctx({ cwd: repo }) as ExtensionContext;

		await expect(tool.execute("call-1", { message: "feat: escaped" }, undefined, undefined, ctx)).rejects.toThrow(
			/User declined commit_as_me/,
		);
		expect(commitCount()).toBe(0);
	});

	test("default cursor sits on Cancel: an accidental Enter cannot approve", async () => {
		stage("a.txt", "hello\n");
		const { tool } = makeTool(BOT);
		// Simulate a bare Enter: the selector returns its default (Cancel) row.
		const ui = makeFakeUi({ selects: ["Cancel — do not commit"] });
		const ctx = ui.ctx({ cwd: repo }) as ExtensionContext;

		await expect(tool.execute("call-1", { message: "feat: oops" }, undefined, undefined, ctx)).rejects.toThrow(
			/User declined commit_as_me/,
		);
		expect(ui.selectCalls[0]!.dialogOptions?.initialIndex).toBe(0);
		const labels = ui.selectCalls[0]!.options.map(o => (typeof o === "string" ? o : o.label));
		expect(labels.indexOf("Cancel — do not commit")).toBe(0);
		expect(commitCount()).toBe(0);
	});

	test("no UI available (headless/subagent): errors without prompting or committing", async () => {
		stage("a.txt", "hello\n");
		const { tool } = makeTool(BOT);
		const ui = makeFakeUi();
		const ctx = ui.ctx({ cwd: repo, hasUI: false, mode: "print" }) as ExtensionContext;

		await expect(tool.execute("call-1", { message: "feat: no ui" }, undefined, undefined, ctx)).rejects.toThrow(/no UI/);
		expect(commitCount()).toBe(0);
		expect(ui.selectCalls.length).toBe(0);
	});
});
