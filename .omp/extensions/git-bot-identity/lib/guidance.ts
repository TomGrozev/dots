/**
 * Human/agent-facing guidance strings for the block-by-default credential model.
 *
 * These messages are pure text — they carry NO security weight. Security comes
 * from stripping GitHub-reaching credentials out of the omp process environment
 * at load (see lib/neutralize.ts), not from telling anyone what to do. These
 * strings exist so a blocked write fails with a reason that actually moves the
 * operator forward instead of a bare "permission denied".
 *
 * There are two audiences: the bash hook, whose classified-write path can still
 * grant the agent account's credentials and wants the operator to configure
 * them; and the shim, which runs inside eval-kernel / non-bash subprocesses
 * where credentials are stripped by design and nothing can be granted.
 */

const BLOCK_HEADER = `git-bot-identity: write blocked — the agent has no GitHub credentials of its own here.`;

/**
 * The bash-hook block reason, shown when a classified write is attempted but
 * the agent account is not configured (or its credentials are absent).
 * `cause` is the concrete reason the write could not proceed (e.g. missing
 * config file, missing token).
 */
export function blockGuidance(cause: string): string {
	return `${BLOCK_HEADER}
Cause: ${cause}
What works: read-only git/gh runs normally. To make an authenticated write, configure the
  agent account at ~/.config/git-bot-identity/config.json (name, email, token — a PAT with
  contents:write); the extension grants those creds ONLY to this one classified write.
What does NOT work: there is no fallback to your human identity, and writes cannot be forced
  through the eval tool or a subshell — those run with credentials stripped by design.
If this action should run as you (the human), run it yourself in your interactive shell.`;
}

/**
 * The shim's stderr message for a blocked git/gh write inside the eval kernel
 * or a non-bash subprocess. Emitted by the git/gh shim scripts (lib/shim.ts)
 * so operators get guidance without the quoting hell of embedding this in a
 * shell script directly.
 */
export function evalGuidance(): string {
	return `git-bot-identity: git/gh writes are disabled inside the eval kernel and non-bash subprocesses.
Credentials are stripped here by design, so this cannot be pushed or authenticated from eval.
Do authenticated git/gh work through the bash tool, where the identity policy applies and can
grant the agent account's credentials to a classified write. If it must act as you, run it in
your own shell. A blocked write means stop — do not route around this.`;
}
