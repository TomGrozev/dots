/**
 * POSIX-sh git/gh shim that fronts blocked writes with guidance and redeems
 * per-call credential grants.
 *
 * Two jobs, in order:
 *
 *  1. Redeem a grant. When the bash `tool_call` hook classified this call and a
 *     bot config exists, it rewrote the command to `export GBI_TICKET=<t>;
 *     <command>`; every shell also carries the grant server's socket path as
 *     `GBI_GRANT_SOCK` (see lib/neutralize.ts + lib/grant-server.ts). With both
 *     set, the shim runs the checked-in grant client (lib/grant-client.ts) as a
 *     plain bun instance — `BUN_BE_BUN=1 "$RUNTIME" "$CLIENT"`, where RUNTIME is
 *     `process.execPath` — and, on success, execs the real binary with the
 *     granted env merged in: token, identity, signing config, and the real PATH
 *     so children resolve the real git/gh. The token travels only over the
 *     socket and through this shell's in-process variables: never argv, never
 *     disk, never stdout.
 *     The client gets the ticket and socket on its own command line and a PATH
 *     with the shim dir stripped; after a successful redeem the shim unsets both
 *     before exec, so no descendant can redeem again even if the runtime were
 *     wrong and re-entered this shim.
 *  2. Otherwise behave as before. A read-only subcommand passes through to the
 *     real binary with the neutralized env (public reads work); anything else is
 *     blocked with guidance text.
 *
 * IMPORTANT: this is a UX layer and the grant-redemption point, NOT the security
 * boundary. Security comes from the omp process environment being born
 * credential-neutral (see lib/neutralize.ts): GitHub-reaching tokens, SSH agent,
 * and git credential helpers are stripped at load, so every child process is
 * already unable to authenticate a write regardless of what command name it
 * invokes. A refused/unknown/expired ticket therefore fails closed. The coarse
 * read-only allowlist needs no precision — a "write" that slips through its
 * classification still fails closed on credentials. The shim's job is to replace
 * an opaque auth failure with an actionable block message.
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

export interface ShimRealBinaries {
	git: string;
	gh: string;
	/**
	 * Absolute path to the runtime that runs the grant client. The hook passes
	 * `process.execPath`; the shim invokes it with `BUN_BE_BUN=1` so a compiled
	 * omp binary runs the client as plain bun instead of booting a nested omp.
	 */
	runtime: string;
}

export interface ShimInstall {
	/** Absolute path to the directory holding the generated git/gh wrappers. */
	shimDir: string;
	/** Absolute path to the checked-in grant-client script the shim runs. */
	grantClientPath: string;
}

/** Single-quote a string for POSIX sh. */
function shQuote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

/** Absolute path to the checked-in grant client next to this module. The shim
 * references it in place — it is never copied into the shim dir or generated. */
export const GRANT_CLIENT_PATH = join(import.meta.dir, "grant-client.ts");

function buildScript(realBinary: string, shimDir: string, allowlist: string[], runtime: string): string {
	const pattern = allowlist.join("|");
	return `#!/bin/sh
# Installed by omp git-bot-identity. UX/guidance + grant redemption only —
# security is enforced by the stripped process environment (see
# lib/neutralize.ts), so this coarse allowlist's imprecision is harmless: a
# misclassified write still fails closed on credentials.
SHIMDIR=${shQuote(shimDir)}
REALBIN=${shQuote(realBinary)}
RUNTIME=${shQuote(runtime)}
CLIENT=${shQuote(GRANT_CLIENT_PATH)}
# A child must never resolve git/gh back to this shim: strip the shim dir from
# PATH for the client (and, via the grant env, the real binary gets the real PATH).
SAFEPATH=""
REST="$PATH"
while [ -n "$REST" ]; do
  case "$REST" in
    *:*) entry="\${REST%%:*}"; REST="\${REST#*:}";;
    *) entry="$REST"; REST="";;
  esac
  [ "$entry" = "$SHIMDIR" ] && continue
  SAFEPATH="\${SAFEPATH:+\$SAFEPATH:}\$entry"
done
# Redeem this call's credential grant (if any) before falling back to the
# allowlist. BUN_BE_BUN=1 makes the runtime (omp's own binary) act as bun, so no
# separately installed bun and no nested omp boot are ever needed. The client
# sees the ticket and socket on its own command line only, and both are unset
# after a successful redeem so no descendant can redeem again. Env values stay
# inside this shell: no argv, no disk, no stdout.
# Re-entry guard, independent of BUN_BE_BUN: the client runs with GBI_IN_SHIM=1,
# so if anything under it ever reaches a shim again, that shim never redeems
# and never starts a runtime — a loop is impossible, not merely unlikely.
if [ -z "$GBI_IN_SHIM" ] && [ -n "$GBI_TICKET" ] && [ -n "$GBI_GRANT_SOCK" ] && [ -x "$RUNTIME" ] && [ -f "$CLIENT" ]; then
  if GRANT=$(GBI_IN_SHIM=1 BUN_BE_BUN=1 GBI_TICKET="$GBI_TICKET" GBI_GRANT_SOCK="$GBI_GRANT_SOCK" PATH="$SAFEPATH" "$RUNTIME" "$CLIENT" 2>/dev/null); then
    eval "$GRANT"
    unset GBI_TICKET GBI_GRANT_SOCK
    exec "$REALBIN" "$@"
  fi
fi
# Find the subcommand past leading global options (\`git -c k=v diff\`,
# \`git -C dir status\`, \`--no-pager\`): tools like r3 run reads this way.
SUB=""
SKIP=""
for a do
  if [ -n "$SKIP" ]; then SKIP=""; continue; fi
  case "$a" in
    -c|-C|--git-dir|--work-tree|--namespace|--super-prefix|--config-env) SKIP=1;;
    -*) ;;
    *) SUB="$a"; break;;
  esac
done
case "$SUB" in
  ${pattern}) exec "$REALBIN" "$@";;
esac
cat "$SHIMDIR/GUIDANCE.txt" >&2
exit 1
`;
}

/**
 * Install the git/gh shim under `${dir}/shim`. Generates:
 *   - GUIDANCE.txt  — the eval-kernel block message (quoting-hell-free)
 *   - git           — executable POSIX sh wrapper (grant → real binary;
 *                     read-only → real binary; else block)
 *   - gh            — same, for the gh CLI
 * The grant client is NOT generated here: the wrappers run the checked-in
 * lib/grant-client.ts by absolute path. Idempotent: rewrites each file on
 * every call.
 */
export function installShim(dir: string, real: ShimRealBinaries): ShimInstall {
	const shimDir = join(dir, "shim");
	mkdirSync(shimDir, { recursive: true, mode: 0o700 });
	writeFileSync(join(shimDir, "GUIDANCE.txt"), evalGuidance(), { mode: 0o600 });
	writeFileSync(join(shimDir, "git"), buildScript(real.git, shimDir, GIT_READ_ALLOWLIST, real.runtime), { mode: 0o755 });
	writeFileSync(join(shimDir, "gh"), buildScript(real.gh, shimDir, GH_READ_ALLOWLIST, real.runtime), { mode: 0o755 });
	return { shimDir, grantClientPath: GRANT_CLIENT_PATH };
}
