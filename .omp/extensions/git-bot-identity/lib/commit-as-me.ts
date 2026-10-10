/**
 * `commit_as_me` — the human-identity commit path.
 *
 * The extension's other path (the `git`/`gh` shim) makes the AGENT account the
 * author/committer and the human a `Co-authored-by` trailer. This tool is the
 * inverse, used for `ready-for-human` (hitl) tickets and ad-hoc work: the HUMAN
 * is author and committer, and the BOT is the trailer. The agent stages files
 * and writes the message, then this tool shows the human a confirmation dialog
 * (the gate — the agent cannot answer it). On approval it runs the REAL git
 * with the human's untouched environment, so the human's own git identity and
 * GPG signing (e.g. a YubiKey needing PIN + touch) apply. It passes no signing
 * flags and never disables signing.
 *
 * ── Third option: commit as the bot instead ─────────────────────────────────
 * If the human changes their mind at the dialog they can pick "Commit as the
 * bot". That commits the same staged changes through the extension's NORMAL bot
 * write path: bot author and committer, the bot's own signing key, and the
 * bot-scoped `prepare-commit-msg` hook that records the human as
 * `Co-authored-by`. The write-class env is resolved IN PROCESS by the grant
 * server's own resolver (`deps.resolveBotWriteEnv`) — never by shelling through
 * the shim and never by a second credential path. The message is stripped of
 * the bot self-trailer this tool would otherwise append for the human path.
 * With no bot config the bot row is not offered; a configured bot whose
 * resolution fails on selection fails closed.
 *
 * ── Why the pristine env, not the neutralized one ───────────────────────────
 * At load the extension neutralizes the omp process env (deny gitconfig, no
 * credentials, shim on PATH). None of that must leak into a human commit, so
 * every git call here runs with the PRISTINE pre-neutralization snapshot
 * (`deps.humanEnv`): the real PATH (no shim), the human's git config, and the
 * human's GPG_TTY/agent. No bot `GIT_AUTHOR_*`/`GIT_COMMITTER_*`/`GNUPGHOME`/
 * `GIT_CONFIG_*` overrides are added.
 *
 * ── Terminal passthrough ────────────────────────────────────────────────────
 * The commit runs with `stdin: "inherit"` so the child shares omp's controlling
 * terminal; gpg-agent's pinentry opens `/dev/tty` itself, so a smart-card PIN +
 * touch prompt still works even though stdout/stderr are captured.
 */
import { randomUUID } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentToolResult, ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import type { GrantDecision } from "./grant-server";

/** The bot identity used for the `Co-authored-by` trailer. */
export interface CommitAsMeBot {
	name: string;
	email: string;
}

export interface CommitAsMeDeps {
	/** Bot identity for the trailer; null when unconfigured → commit without it. */
	bot: CommitAsMeBot | null;
	/** The human's pristine (pre-neutralization) environment: real PATH, the
	 * human's own git config/signing, no bot overrides and no shim. */
	humanEnv: Record<string, string>;
	/**
	 * The grant server's own write-class resolver, invoked IN PROCESS: the same
	 * function the shim reaches over the socket. Lets the human switch to the
	 * bot at the dialog without shelling through the shim or duplicating any
	 * credential/signing logic.
	 */
	resolveBotWriteEnv: () => Promise<GrantDecision>;
}

export interface CommitAsMeDetails {
	hash: string;
	subject: string;
	/** Which identity authored and committed: the human, or the bot (chosen at the gate). */
	identity: "human" | "bot";
}

/** Structural slice of `ExtensionAPI` this install needs (narrow for tests). */
export interface CommitAsMeHookApi {
	registerTool: ExtensionAPI["registerTool"];
	zod: ExtensionAPI["zod"];
}

/**
 * Append the bot's `Co-authored-by` trailer unless it is already present, or
 * the bot is unconfigured (then commit with the message as given). The message
 * is returned newline-terminated.
 */
export function withBotTrailer(message: string, bot: CommitAsMeBot | null): string {
	const body = message.replace(/\s+$/, "");
	if (!bot) return `${body}\n`;
	const trailer = `Co-authored-by: ${bot.name} <${bot.email}>`;
	const hasTrailer = body.split("\n").some(line => line.trim().toLowerCase() === trailer.toLowerCase());
	return hasTrailer ? `${body}\n` : `${body}\n\n${trailer}\n`;
}

/**
 * Strip the bot's `Co-authored-by` trailer from the message, for the bot-commit
 * path: the bot is the author there, so crediting itself as co-author is wrong,
 * and leaving the line would also make the bot's `prepare-commit-msg` hook skip
 * (it adds the human trailer only when the message has no `Co-authored-by`).
 * Returned newline-terminated.
 */
export function withoutBotTrailer(message: string, bot: CommitAsMeBot | null): string {
	const body = message.replace(/\s+$/, "");
	if (!bot) return `${body}\n`;
	const trailer = `Co-authored-by: ${bot.name} <${bot.email}>`;
	const kept = body
		.split("\n")
		.filter(line => line.trim().toLowerCase() !== trailer.toLowerCase())
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.replace(/\n+$/, "");
	return `${kept}\n`;
}

interface GitRun {
	code: number;
	stdout: string;
	stderr: string;
}

/**
 * Run the real `git` (resolved via `env.PATH`, which carries no shim) in `repo`.
 * `interactive` inherits stdin so a smart-card pinentry keeps its terminal.
 */
async function runGit(
	repo: string,
	args: string[],
	env: Record<string, string>,
	interactive = false,
): Promise<GitRun> {
	const proc = Bun.spawn(["git", ...args], {
		cwd: repo,
		env,
		stdin: interactive ? "inherit" : "ignore",
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
	return { code: await proc.exited, stdout, stderr };
}

/** Write the final message to a 0600 temp file git can read with `-F`. */
function writeMessageFile(message: string): string {
	const file = join(tmpdir(), `commit-as-me-${randomUUID()}.txt`);
	writeFileSync(file, message, { mode: 0o600 });
	return file;
}

/**
 * Read the human's configured git identity from the pristine env, so the gate
 * can name exactly whose name/signature the commit will carry.
 */
async function readHumanIdentity(repo: string, env: Record<string, string>): Promise<{ name: string; email: string }> {
	const name = (await runGit(repo, ["config", "user.name"], env)).stdout.trim();
	const email = (await runGit(repo, ["config", "user.email"], env)).stdout.trim();
	return { name: name || "(git user.name unset)", email: email || "(git user.email unset)" };
}

/** Read the just-created commit's short hash/subject, tagged with the identity used. */
async function readHead(repo: string, env: Record<string, string>, identity: "human" | "bot"): Promise<CommitAsMeDetails> {
	const show = await runGit(repo, ["log", "-1", "--format=%h%n%s"], env);
	const [hash = "", subject = ""] = show.stdout.trimEnd().split("\n");
	return { hash, subject, identity };
}

/**
 * Core flow: verify UI, verify something is staged, build both candidate
 * messages, gate on the human's explicit approval via a select, then commit as
 * the human — or, if the human changes their mind and picks the bot row,
 * through the normal bot write path (bot author/committer, bot signing key, the
 * bot hook's human trailer). Throws on every failure (the harness surfaces it
 * as a tool error) — never commits without approval.
 */
export async function runCommitAsMe(
	params: { message: string; cwd?: string | undefined },
	ctx: ExtensionContext,
	deps: CommitAsMeDeps,
): Promise<CommitAsMeDetails> {
	// Only a human in the TUI can approve; headless/print/RPC and subagent
	// contexts have no dialog surface.
	if (!ctx.hasUI || ctx.mode !== "tui") {
		throw new Error(
			"commit_as_me needs an interactive terminal, but this session has no UI (headless or subagent). Run `git commit` yourself after staging.",
		);
	}

	const repo = params.cwd ?? ctx.cwd;
	const env = deps.humanEnv;

	// `git diff --cached --quiet`: exit 0 = nothing staged, 1 = staged changes,
	// anything else = git failed (e.g. not a repository).
	const staged = await runGit(repo, ["diff", "--cached", "--quiet"], env);
	if (staged.code === 0) {
		throw new Error(`commit_as_me: nothing staged in ${repo}; stage files first (git add).`);
	}
	if (staged.code !== 1) {
		throw new Error(`commit_as_me: git diff --cached failed: ${staged.stderr.trim() || staged.stdout.trim()}`);
	}

	const stat = (await runGit(repo, ["diff", "--cached", "--stat"], env)).stdout.trimEnd();
	// Human path: the bot is the trailer. Bot path: the human becomes the
	// trailer (added by the bot commit hook), so the bot must not credit itself
	// — strip any bot `Co-authored-by` line from the message.
	const humanMessage = withBotTrailer(params.message, deps.bot);
	const botMessage = withoutBotTrailer(params.message, deps.bot);

	const human = await readHumanIdentity(repo, env);
	const humanLabel = `${human.name} <${human.email}>`;
	const approveLabel = `Commit as ${humanLabel}`;
	const cancelLabel = "Cancel — do not commit";
	// Offer the bot row only when a bot identity is configured: without one the
	// resolver can only refuse, so the honest select omits it. (A configured bot
	// whose creds/signing fail later still fails closed on selection.)
	const botLabel = deps.bot ? `Commit as the bot ${deps.bot.name} <${deps.bot.email}>` : null;

	// Gate with a SELECT, never a yes/no confirm: the cursor starts on Cancel, so
	// a stray Enter (or Escape/undefined) declines. Committing requires moving to
	// and deliberately choosing an approve row, which names the identity and
	// their signing key.
	ctx.ui.notify(
		`commit_as_me: approving commits AS YOU — ${humanLabel} — signed with YOUR GPG key (e.g. YubiKey PIN + touch).`,
		"warning",
	);
	const options: { label: string; description: string }[] = [
		{
			label: cancelLabel,
			description: "Nothing is committed. The agent hands you the exact git command to run yourself.",
		},
		{
			label: approveLabel,
			description: `Author + committer: ${humanLabel}\nSigned with YOUR GPG key — e.g. a YubiKey (PIN + touch)\n\nStaged changes:\n${stat}\n\nCommit message:\n${humanMessage}`,
		},
	];
	if (botLabel && deps.bot) {
		options.push({
			label: botLabel,
			description: `Author + committer: ${deps.bot.name} <${deps.bot.email}>\nSigned with the BOT's passphrase-less GPG key\nCo-authored-by: you (${humanLabel}) — added by the bot commit hook\n\nStaged changes:\n${stat}\n\nCommit message:\n${botMessage}`,
		});
	}
	const choice = await ctx.ui.select(
		"⚠  COMMIT AS YOURSELF — you are the author & signer",
		options,
		{ initialIndex: 0, selectionMarker: "radio" },
	);

	const approveAsHuman = choice === approveLabel;
	const approveAsBot = botLabel !== null && choice === botLabel;
	if (!approveAsHuman && !approveAsBot) {
		const messageFile = writeMessageFile(humanMessage);
		throw new Error(`User declined commit_as_me; give them the command to run: git commit -F ${messageFile}`);
	}

	if (approveAsBot && deps.bot) {
		// Reuse the grant server's own write-class resolver IN PROCESS (the same
		// one the shim asks over the socket): bot author/committer, bot signing
		// key, and the bot-scoped prepare-commit-msg hook that adds the human
		// trailer. Never the shim, never a second credential path.
		const granted = await deps.resolveBotWriteEnv();
		if (!granted.ok) {
			throw new Error(`commit_as_me: cannot commit as the bot — ${granted.reason}`);
		}
		const botFile = writeMessageFile(botMessage);
		// Non-interactive: the bot key is passphrase-less, so no pinentry; a
		// signing failure must fail closed, not prompt.
		const commit = await runGit(repo, ["commit", "-F", botFile], { ...env, ...granted.env });
		rmSync(botFile, { force: true });
		if (commit.code !== 0) {
			throw new Error(commit.stderr.trim() || commit.stdout.trim() || `commit_as_me: git commit exited ${commit.code}`);
		}
		return await readHead(repo, env, "bot");
	}

	// Real git, human env, interactive stdin for pinentry; no signing flags and
	// nothing that disables the human's own commit.gpgsign.
	const messageFile = writeMessageFile(humanMessage);
	const commit = await runGit(repo, ["commit", "-F", messageFile], env, true);
	if (commit.code !== 0) {
		throw new Error(commit.stderr.trim() || commit.stdout.trim() || `commit_as_me: git commit exited ${commit.code}`);
	}
	rmSync(messageFile, { force: true });
	return await readHead(repo, env, "human");
}

/**
 * Register the `commit_as_me` tool. Call at extension load, alongside the other
 * registrations. The confirm dialog is the gate: the agent cannot answer it.
 */
export function installCommitAsMe(pi: CommitAsMeHookApi, deps: CommitAsMeDeps): void {
	const z = pi.zod;
	const schema = z.object({
		message: z.string().describe("Full commit message in conventional-commit format."),
		cwd: z.string().optional().describe("Repository directory; defaults to the session cwd."),
	});

	pi.registerTool({
		name: "commit_as_me",
		label: "Commit as me",
		description:
			"Commit the staged changes as the HUMAN user (author and committer, signed with the human's own GPG key), with the agent bot as the Co-authored-by trailer — or, if the human changes their mind at the dialog, as the BOT instead (bot author/committer, bot signing key, human Co-authored-by). Use this for ready-for-human (hitl) tickets and ad-hoc work: stage the files and write the conventional-commit message first. It shows the human a confirmation dialog and only commits once they deliberately pick an identity; on decline it returns a `git commit -F <file>` command to hand back to them. Requires an interactive terminal (not available to subagents).",
		parameters: schema,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx): Promise<AgentToolResult<CommitAsMeDetails>> {
			const details = await runCommitAsMe(params, ctx, deps);
			const actor = details.identity === "human" ? "the human" : "the bot";
			return { content: [{ type: "text", text: `${details.hash} ${details.subject} (committed as ${actor})` }], details };
		},
	});
}
