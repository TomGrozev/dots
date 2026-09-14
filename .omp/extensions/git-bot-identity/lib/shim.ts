/**
 * POSIX-sh git/gh shim that fronts blocked writes with guidance.
 *
 * IMPORTANT: this is a UX layer, NOT the security boundary. Security comes from
 * the omp process environment being born credential-neutral (see
 * lib/neutralize.ts): GitHub-reaching tokens, SSH agent, and git credential
 * helpers are stripped at load, so every child process is already unable to
 * authenticate a write regardless of what command name it invokes. The shim's
 * coarse read-only allowlist therefore needs no precision — a "write" that slips
 * through its classification still fails closed on credentials. Its only job is
 * to replace an opaque auth failure with an actionable block message.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { evalGuidance } from "./guidance";

/** git subcommands treated as read-only (passed through to the real binary).
 * Coarse and deliberately not exhaustive — see the header comment. */
const GIT_READ_ALLOWLIST = [
	"status", "log", "diff", "show", "fetch", "ls-remote", "ls-files",
	"rev-parse", "branch", "describe", "cat-file", "blame", "remote", "config",
	"tag", "shortlog", "for-each-ref", "symbolic-ref", "version", "help",
	"rev-list", "show-ref", "whatchanged", "grep", "reflog",
];

/** gh subcommands treated as read-only (passed through to the real binary). */
const GH_READ_ALLOWLIST = [
	"auth", "version", "help", "completion", "config", "status", "browse",
	"api", "search", "label", "cache", "extension", "codespace",
];

export interface ShimInstall {
	/** Absolute path to the directory holding the generated git/gh wrappers. */
	shimDir: string;
}

function buildScript(realBinary: string, shimDir: string, allowlist: string[]): string {
	const pattern = allowlist.join("|");
	return `#!/bin/sh
# Installed by omp git-bot-identity. UX/guidance only — security is enforced by
# the stripped process environment (see lib/neutralize.ts), so this coarse
# allowlist's imprecision is harmless: a misclassified write still fails closed
# on credentials.
SHIMDIR="${shimDir}"
case "$1" in
  ${pattern}) exec "${realBinary}" "$@";;
esac
cat "$SHIMDIR/GUIDANCE.txt" >&2
exit 1
`;
}

/**
 * Install the git/gh shim under `${dir}/shim`. Generates:
 *   - GUIDANCE.txt  — the eval-kernel block message (so scripts avoid quoting hell)
 *   - git           — executable POSIX sh wrapper (read-only → real binary, else block)
 *   - gh            — same, for the gh CLI
 * Idempotent: rewrites each file on every call.
 */
export function installShim(dir: string, real: { git: string; gh: string }): ShimInstall {
	const shimDir = join(dir, "shim");
	mkdirSync(shimDir, { recursive: true, mode: 0o700 });
	writeFileSync(join(shimDir, "GUIDANCE.txt"), evalGuidance(), { mode: 0o600 });
	writeFileSync(join(shimDir, "git"), buildScript(real.git, shimDir, GIT_READ_ALLOWLIST), { mode: 0o755 });
	writeFileSync(join(shimDir, "gh"), buildScript(real.gh, shimDir, GH_READ_ALLOWLIST), { mode: 0o755 });
	return { shimDir };
}
