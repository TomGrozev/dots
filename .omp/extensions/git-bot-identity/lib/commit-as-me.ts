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
}

export interface CommitAsMeDetails {
	hash: string;
	subject: string;
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

/**
 * Core flow: verify UI, verify something is staged, build the final message,
 * gate on the human's explicit approval via a select, then commit as the human.
 * Throws on every failure (the harness surfaces it as a tool error) — never
 * commits without approval.
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
	const finalMessage = withBotTrailer(params.message, deps.bot);
	const messageFile = writeMessageFile(finalMessage);

	const human = await readHumanIdentity(repo, env);
	const humanLabel = `${human.name} <${human.email}>`;
	const approveLabel = `Commit as ${humanLabel}`;
	const cancelLabel = "Cancel — do not commit";

	// Gate with a SELECT, never a yes/no confirm: the cursor starts on Cancel, so
	// a stray Enter (or Escape/undefined) declines. Committing requires moving to
	// and deliberately choosing the approve row, which names the human identity
	// and their signing key.
	ctx.ui.notify(
		`commit_as_me: approving commits AS YOU — ${humanLabel} — signed with YOUR GPG key (e.g. YubiKey PIN + touch).`,
		"warning",
	);
	const choice = await ctx.ui.select(
		"⚠  COMMIT AS YOURSELF — you are the author & signer",
		[
			{
				label: cancelLabel,
				description: "Nothing is committed. The agent hands you the exact git command to run yourself.",
			},
			{
				label: approveLabel,
				description: `Author + committer: ${humanLabel}\nSigned with YOUR GPG key — e.g. a YubiKey (PIN + touch)\n\nStaged changes:\n${stat}\n\nCommit message:\n${finalMessage}`,
			},
		],
		{ initialIndex: 0, selectionMarker: "radio" },
	);
	if (choice !== approveLabel) {
		throw new Error(
			`User declined commit_as_me; give them the command to run: git commit -F ${messageFile}`,
		);
	}

	// Real git, human env, interactive stdin for pinentry; no signing flags and
	// nothing that disables the human's own commit.gpgsign.
	const commit = await runGit(repo, ["commit", "-F", messageFile], env, true);
	if (commit.code !== 0) {
		throw new Error(commit.stderr.trim() || commit.stdout.trim() || `commit_as_me: git commit exited ${commit.code}`);
	}
	rmSync(messageFile, { force: true });

	const show = await runGit(repo, ["log", "-1", "--format=%h%n%s"], env);
	const [hash = "", subject = ""] = show.stdout.trimEnd().split("\n");
	return { hash, subject };
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
			"Commit the staged changes as the HUMAN user (author and committer, signed with the human's own GPG key), with the agent bot as the Co-authored-by trailer. Use this for ready-for-human (hitl) tickets and ad-hoc work: stage the files and write the conventional-commit message first. It shows the human a confirmation dialog and only commits on approval; on decline it returns a `git commit -F <file>` command to hand back to them. Requires an interactive terminal (not available to subagents).",
		parameters: schema,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx): Promise<AgentToolResult<CommitAsMeDetails>> {
			const details = await runCommitAsMe(params, ctx, deps);
			return { content: [{ type: "text", text: `${details.hash} ${details.subject}` }], details };
		},
	});
}
