/**
 * Credential neutralization: the block-by-default spine of the extension.
 *
 * Security here comes from REMOVING credentials, not from classifying
 * commands. Instead of only injecting bot creds on write-class bash calls,
 * we strip every GitHub-reaching credential from the omp process environment
 * at load, so every child — bash, the eval kernel, subagent shells — is born
 * credential-neutral. Credentials are RE-GRANTED only on a classified,
 * configured write.
 *
 * Removing, rather than classifying, is what covers the two holes a
 * classify-only model cannot: the eval kernel and absolute-path invocations
 * (`/usr/bin/git push`) each bypass any command-dispatch shim, but neither
 * can conjure a credential that the environment never carried. The shell
 * shim (lib/shim.ts) is pure UX — it explains a blocked write with guidance
 * text — not a security boundary; the stripped environment is the real gate.
 *
 * Fail-closed guarantees, empirically verified:
 *  - a bogus GH_TOKEN forces `gh` to 401 over any secret keyring;
 *  - SSH_AUTH_SOCK unset/empty + GIT_SSH_COMMAND=false + a neutral
 *    GIT_CONFIG_GLOBAL + GIT_TERMINAL_PROMPT=0 make git writes, SSH, and
 *    private-HTTPS fail closed, while anonymous public HTTPS reads still work.
 *
 * Pure/leaf module: the ONLY side effect is the file write inside
 * `writeDenyConfig`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Value written into the token vars so a leaked env can never be mistaken
 * for a real credential — any consumer that treats it as a token gets a fail. */
export const NO_CREDS_SENTINEL = "git-bot-identity-no-creds";

/**
 * Git config text that disables credential retrieval: a `[credential]`
 * section with an empty `helper =`, which resets any inherited credential
 * helper. No identity, no insteadOf. Trailing newline.
 */
export function denyConfigContent(): string {
	return `[credential]\n\thelper =\n`;
}

/** Paths the neutral overlay is built around. */
export interface NeutralPaths {
	/** Directory holding the UX shim; prepended to PATH. */
	shimDir: string;
	/** Path to the deny config file wired in as GIT_CONFIG_GLOBAL. */
	denyConfigPath: string;
	/** Empty GnuPG home handed to git so it never reaches the real keyring. */
	gnupgHome: string;
	/** Original PATH value the shim dir is prepended onto. */
	realPath: string;
}

/**
 * Compose the deny overlay applied to every child the extension spawns. Every
 * value is a string; the caller deletes SSH_AUTH_SOCK from process.env as
 * well (the overlay's empty value disables the agent for bash-overlay use).
 */
export function neutralBaseEnv(p: NeutralPaths): Record<string, string> {
	return {
		PATH: `${p.shimDir}:${p.realPath}`,
		GIT_CONFIG_GLOBAL: p.denyConfigPath,
		GIT_SSH_COMMAND: "false",
		GIT_TERMINAL_PROMPT: "0",
		GH_TOKEN: NO_CREDS_SENTINEL,
		GITHUB_TOKEN: NO_CREDS_SENTINEL,
		GH_ENTERPRISE_TOKEN: NO_CREDS_SENTINEL,
		GNUPGHOME: p.gnupgHome,
		SSH_AUTH_SOCK: "",
	};
}

/**
 * Write the deny config file. Creates the parent dir (0o700) if needed and
 * writes the config (0o600). Idempotent: safe to call repeatedly.
 */
export function writeDenyConfig(path: string): void {
	mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
	writeFileSync(path, denyConfigContent(), { mode: 0o600 });
}
