/**
 * Human/agent-facing guidance strings for the block-by-default credential model.
 *
 * These messages are pure text — they carry NO security weight. Security comes
 * from stripping GitHub-reaching credentials out of the omp process environment
 * at load (see lib/neutralize.ts), not from telling anyone what to do. These
 * strings exist so a blocked write fails with a reason that actually moves the
 * operator forward instead of a bare "permission denied".
 *
 * There are two audiences: the grant server's refusal reason, printed by the
 * shim when a write-class git/gh call cannot be granted; and the shim's own
 * GUIDANCE.txt, printed when no reason is available (e.g. the grant socket is
 * unreachable).
 */

const BLOCK_HEADER = `git-bot-identity: write blocked — the agent has no usable GitHub credentials.`;

/**
 * The refusal reason shown when a write-class git/gh call is attempted but the
 * agent account is not configured (or its credentials are unusable). `cause` is
 * the concrete reason the write could not proceed (e.g. missing config file,
 * failed signing-key setup).
 */
export function blockGuidance(cause: string): string {
	return `${BLOCK_HEADER}
Cause: ${cause}
What works: read-only git/gh runs normally. To make an authenticated write, configure the
  agent account at ~/.config/git-bot-identity/config.json (name, email, token — a CLASSIC PAT
  with the 'repo' scope; a fine-grained token can't write to a repo owned by another personal
  account, even as a collaborator); the extension grants those creds to write-class git/gh calls.
What does NOT work: there is no fallback to your human identity.
If this action should run as you (the human), run it yourself in your interactive shell.`;
}

/**
 * The shim's stderr message for a write-class git/gh call with no usable grant —
 * emitted by the git/gh shim scripts (lib/shim.ts) so operators get guidance
 * without the quoting hell of embedding this in a shell script directly.
 */
export function evalGuidance(): string {
	return `git-bot-identity: git/gh write blocked — the agent has no usable GitHub credentials.
Configure the agent account at ~/.config/git-bot-identity/config.json (name, email, token) to
let the extension grant write-class git/gh invocations. There is no fallback to your human
identity: if this action should be run as you, run it in your own shell. A blocked write means
stop — do not route around this.`;
}
