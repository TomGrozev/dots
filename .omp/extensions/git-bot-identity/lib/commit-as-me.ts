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
 * GPG signing (e.g. a YubiKey needing PIN + touch) apply. It forces signing
 * with `-S`: a `commit.gpgsign=false` in ANY config scope — repo-local
 * included — must never leave a commit-as-me commit unsigned. Only an explicit
 * command-line `--no-gpg-sign` countermands `-S`, and this tool never passes
 * one.
 *
 * ── The dialog offers four choices (two when no bot is configured) ──────────
 * The gate prefers `ctx.ui.formDialog` (one HTML `<form>`, where the agent
 * cannot answer the radio group) and falls back to `ctx.ui.select` on hosts
 * without it. Both surfaces offer Cancel (the default), "the human with the
 * bot Co-authored-by", "the human without a trailer", and, only when a bot is
 * configured, "the bot".
 *
 * The two human choices differ only in the trailer: the with-trailer choice
 * appends `Co-authored-by: <bot name> <bot email>`, while the without-trailer
 * choice commits the message with any bot trailer already in it stripped.
 *
 * ── The bot choice: commit as the bot instead ───────────────────────────────
 * That commits the same staged changes through the extension's NORMAL bot
 * write path: bot author and committer, the bot's own signing key, and the
 * bot-scoped `prepare-commit-msg` hook that records the human as
 * `Co-authored-by`. The write-class env is resolved IN PROCESS by the grant
 * server's own resolver (`deps.resolveBotWriteEnv`), never by shelling through
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
interface CommitAsMeBot {
	name: string;
	email: string;
}

interface CommitAsMeDeps {
	/** Bot identity for the trailer, read on demand so a config edit is visible
	 * without a rebind; null when unconfigured → commit without it. */
	getBot: () => Promise<CommitAsMeBot | null>;
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
	/** Whether the approved commit carries the bot's `Co-authored-by` trailer. */
	withBotTrailer: boolean;
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
function withBotTrailer(message: string, bot: CommitAsMeBot | null): string {
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
function withoutBotTrailer(message: string, bot: CommitAsMeBot | null): string {
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
 * Write the message to a temp file, run `git commit -F`'s caller-supplied run
 * against it, and always delete the file — including when the run throws or the
 * commit exits non-zero, so a failed commit never leaks a `commit-as-me-*.txt`.
 */
async function withMessageFile<T>(message: string, run: (file: string) => Promise<T>): Promise<T> {
	const file = writeMessageFile(message);
	try {
		return await run(file);
	} finally {
		rmSync(file, { force: true });
	}
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
async function readHead(
	repo: string,
	env: Record<string, string>,
	identity: "human" | "bot",
	withBotTrailer: boolean,
): Promise<CommitAsMeDetails> {
	const show = await runGit(repo, ["log", "-1", "--format=%h%n%s"], env);
	const [hash = "", subject = ""] = show.stdout.trimEnd().split("\n");
	return { hash, subject, identity, withBotTrailer };
}

/** Escape an interpolated value for HTML text; the form parser decodes the entities. */
function escapeHtml(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * The preferred gate: one HTML `<form>` whose radio group the human submits.
 * Cancel is checked by default, so a bare Submit (or Esc, which resolves
 * `undefined`) declines. The message `<pre>` holds the escaped message
 * verbatim: no reflow, no indentation, no added newlines.
 */
function buildCommitForm(
	humanLabel: string,
	bot: CommitAsMeBot | null,
	stat: string,
	message: string,
): string {
	const trailer = bot ? `Co-authored-by: ${bot.name} <${bot.email}>` : null;
	// The with-trailer row only means something with a bot to credit, so it is
	// omitted (as on the select) when no bot is configured.
	const withTrailerRow = trailer
		? `<label><input type="radio" name="commit_as" value="human-trailer"> Commit as me — with the bot Co-authored-by</label>\n`
		: "";
	const botRow = bot
		? `<label><input type="radio" name="commit_as" value="bot"> Commit as the bot — ${escapeHtml(`${bot.name} <${bot.email}>`)} signs, and you are Co-authored-by</label>\n`
		: "";
	const messageNote = trailer
		? `Commit message (the with-trailer choice appends ${escapeHtml(trailer)}):`
		: "Commit message:";
	return `<form method="dialog">
<p>⚠ Approving commits AS YOU — ${escapeHtml(humanLabel)} — as author and committer, signed with YOUR GPG key (e.g. a YubiKey PIN + touch).</p>
<fieldset>
<legend>Commit the staged changes as…</legend>
<label><input type="radio" name="commit_as" value="cancel" checked> Cancel — do not commit</label>
${withTrailerRow}<label><input type="radio" name="commit_as" value="human"> Commit as me — without a trailer</label>
${botRow}</fieldset>
<p>Staged changes:</p>
<pre>${escapeHtml(stat)}</pre>
<p>${messageNote}</p>
<pre>${escapeHtml(message)}</pre>
</form>`;
}

/**
 * Core flow: verify UI, verify something is staged, build both candidate
 * messages, gate on the human's explicit approval via a form dialog (or a
 * select on hosts without one), then commit as the human (with or without the
 * bot trailer) or, if the human changes their mind and picks the bot row,
 * through the normal bot write path (bot author/committer, bot signing key, the
 * bot hook's human trailer). Throws on every failure (the harness surfaces it
 * as a tool error) and never commits without approval.
 */
async function runCommitAsMe(
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
	// Read the bot identity on demand (config may have changed since install).
	const bot = await deps.getBot();
	// `base` is the message with any bot trailer stripped; the with-trailer
	// choice re-appends it, while the without-trailer and bot choices commit
	// `base` (the bot path has its own hook crediting the human).
	const base = withoutBotTrailer(params.message, bot);
	const humanWithTrailer = withBotTrailer(base, bot);

	const human = await readHumanIdentity(repo, env);
	const humanLabel = `${human.name} <${human.email}>`;
	const cancelLabel = "Cancel — do not commit";
	const withTrailerLabel = `Commit as ${humanLabel} — with the bot Co-authored-by`;
	const withoutTrailerLabel = `Commit as ${humanLabel} — without a trailer`;
	// Offer the bot row only when a bot identity is configured: without one the
	// resolver can only refuse, so the honest gate omits it. (A configured bot
	// whose creds/signing fail later still fails closed on selection.)
	const botLabel = bot ? `Commit as the bot ${bot.name} <${bot.email}>` : null;

	ctx.ui.notify(
		`commit_as_me: approving commits AS YOU — ${humanLabel} — signed with YOUR GPG key (e.g. YubiKey PIN + touch).`,
		"warning",
	);

	// Prefer the HTML form surface; only its exact approve values commit. A
	// select fallback keeps the same rows on hosts without `formDialog`.
	let choice: string | undefined;
	if (typeof ctx.ui.formDialog === "function") {
		const result = await ctx.ui.formDialog(buildCommitForm(humanLabel, bot, stat, base));
		// Radio values arrive as a string; Esc/cancel resolves undefined and the
		// form's free-text "Other" row submits an arbitrary string. Both decline.
		const value = result?.data.commit_as;
		choice = typeof value === "string" ? value : undefined;
	} else {
		const options: { label: string; description: string }[] = [
			{
				label: cancelLabel,
				description: "Nothing is committed. The agent hands you the exact git command to run yourself.",
			},
		];
		if (bot) {
			options.push({
				label: withTrailerLabel,
				description: `Author + committer: ${humanLabel}\nSigned with YOUR GPG key — e.g. a YubiKey (PIN + touch)\nBot Co-authored-by: ${bot.name} <${bot.email}>\n\nStaged changes:\n${stat}\n\nCommit message:\n${humanWithTrailer}`,
			});
		}
		options.push({
			label: withoutTrailerLabel,
			description: `Author + committer: ${humanLabel}\nSigned with YOUR GPG key — e.g. a YubiKey (PIN + touch)\nNo Co-authored-by trailer\n\nStaged changes:\n${stat}\n\nCommit message:\n${base}`,
		});
		if (bot && botLabel) {
			options.push({
				label: botLabel,
				description: `Author + committer: ${bot.name} <${bot.email}>\nSigned with the BOT's passphrase-less GPG key\nCo-authored-by: you (${humanLabel}) — added by the bot commit hook\n\nStaged changes:\n${stat}\n\nCommit message:\n${base}`,
			});
		}
		// The cursor starts on Cancel, so a stray Enter (or Escape/undefined)
		// declines. Committing requires deliberately choosing an approve row.
		const selected = await ctx.ui.select(
			"⚠  COMMIT AS YOURSELF — you are the author & signer",
			options,
			{ initialIndex: 0, selectionMarker: "radio" },
		);
		choice =
			selected === withTrailerLabel
				? "human-trailer"
				: selected === withoutTrailerLabel
					? "human"
					: selected === botLabel
						? "bot"
						: undefined;
	}

	const asHumanWithTrailer = choice === "human-trailer";
	const asHumanWithoutTrailer = choice === "human";
	const asBot = bot !== null && choice === "bot";
	if (!asHumanWithTrailer && !asHumanWithoutTrailer && !asBot) {
		const messageFile = writeMessageFile(humanWithTrailer);
		throw new Error(`User declined commit_as_me; give them the command to run: git commit -F ${messageFile}`);
	}

	if (asBot && bot) {
		// Reuse the grant server's own write-class resolver IN PROCESS (the same
		// one the shim asks over the socket): bot author/committer, bot signing
		// key, and the bot-scoped prepare-commit-msg hook that adds the human
		// trailer. Never the shim, never a second credential path.
		const granted = await deps.resolveBotWriteEnv();
		if (!granted.ok) {
			throw new Error(`commit_as_me: cannot commit as the bot — ${granted.reason}`);
		}
		// Non-interactive: the bot key is passphrase-less, so no pinentry; a
		// signing failure must fail closed, not prompt.
		const commit = await withMessageFile(base, file => runGit(repo, ["commit", "-F", file], { ...env, ...granted.env }));
		if (commit.code !== 0) {
			throw new Error(commit.stderr.trim() || commit.stdout.trim() || `commit_as_me: git commit exited ${commit.code}`);
		}
		return await readHead(repo, env, "bot", false);
	}

	// Real git, human env, interactive stdin for pinentry. `-S` forces a
	// signature, overriding `commit.gpgsign=false` in any config scope (a
	// repo-local false must not silently produce an unsigned commit); only an
	// explicit `--no-gpg-sign` would countermand it, and none is passed. The
	// signing key and pinentry come from the human's own config/keyring.
	const message = asHumanWithTrailer ? humanWithTrailer : base;
	const commit = await withMessageFile(message, file => runGit(repo, ["commit", "-S", "-F", file], env, true));
	if (commit.code !== 0) {
		throw new Error(commit.stderr.trim() || commit.stdout.trim() || `commit_as_me: git commit exited ${commit.code}`);
	}
	return await readHead(repo, env, "human", asHumanWithTrailer);
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
			"Commit the staged changes as the HUMAN user (author and committer, signed with the human's own GPG key). The confirmation dialog offers the human with the agent bot as the Co-authored-by trailer, the human without a trailer, and when a bot is configured, the BOT instead (bot author/committer, bot signing key, human Co-authored-by). Use this for ready-for-human (hitl) tickets and ad-hoc work: stage the files and write the conventional-commit message first. It shows the human a confirmation dialog and only commits once they deliberately pick an identity; on decline it returns a `git commit -F <file>` command to hand back to them. Requires an interactive terminal (not available to subagents).",
		parameters: schema,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx): Promise<AgentToolResult<CommitAsMeDetails>> {
			const details = await runCommitAsMe(params, ctx, deps);
			const actor =
				details.identity === "bot"
					? "the bot"
					: details.withBotTrailer
						? "the human, with the bot trailer"
						: "the human, without a trailer";
			return { content: [{ type: "text", text: `${details.hash} ${details.subject} (committed as ${actor})` }], details };
		},
	});
}
