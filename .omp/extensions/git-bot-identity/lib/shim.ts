/**
 * POSIX-sh git/gh shim: it classifies its own argv and redeems the matching
 * credential grant from the in-process grant server.
 *
 * On every invocation it finds the subcommand past leading global options
 * (`git -c k=v diff`, `git -C dir status`, `--no-pager`), then:
 *
 *  - If `GBI_IN_SHIM` is set (this shim is being reached from inside the grant
 *    client's runtime), it never redeems and never starts a runtime: a
 *    read-only subcommand passes through to the real binary, anything else is
 *    blocked. This makes a recursion loop impossible, not merely unlikely.
 *  - Otherwise it picks `read` for a read-only subcommand or `write` for
 *    anything else and asks the grant server — over the socket every shell
 *    carries as `GBI_GRANT_SOCK` — by running the checked-in grant client
 *    (lib/grant-client.ts) as a plain bun instance, `BUN_BE_BUN=1 "$RUNTIME"
 *    "$CLIENT"`, where RUNTIME is `process.execPath`. On success it evals the
 *    client's exported env, unsets the socket, and execs the real binary with
 *    that env (incl. the real PATH). On a refused read it still execs the real
 *    binary under the neutral env (public reads keep working); on a refused
 *    write it prints the client's reason (or GUIDANCE.txt) and exits 1.
 *
 * The token travels only over the socket and through this shell's in-process
 * variables: never argv, never disk, never stdout.
 *
 * IMPORTANT: this is a UX layer and the grant request point, NOT the security
 * boundary. Security comes from the omp process environment being born
 * credential-neutral (see lib/neutralize.ts): GitHub-reaching tokens, SSH agent,
 * and git credential helpers are stripped at load, so every child process is
 * already unable to authenticate a write regardless of what command name it
 * invokes. The coarse read/write split needs no precision — a "write" that a
 * read-only classification slips through still fails closed on credentials. The
 * shim's job is to replace an opaque auth failure with an actionable block
 * message, and to hand the granted creds to the call.
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
	 * Absolute path to the runtime that runs the grant client. The extension
	 * passes `process.execPath`; the shim invokes it with `BUN_BE_BUN=1` so a
	 * compiled omp binary runs the client as plain bun instead of booting a
	 * nested omp.
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
# Installed by omp git-bot-identity. UX/guidance + grant request only —
# security is enforced by the stripped process environment (see
# lib/neutralize.ts), so this coarse read/write split's imprecision is harmless:
# a misclassified write still fails closed on credentials.
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
# Re-entry guard, independent of BUN_BE_BUN: the client runs with GBI_IN_SHIM=1,
# so if anything under it ever reaches a shim again, that shim never redeems and
# never starts a runtime — a loop is impossible, not merely unlikely.
if [ -n "$GBI_IN_SHIM" ]; then
  case "$SUB" in
    ${pattern}) exec "$REALBIN" "$@";;
  esac
  cat "$SHIMDIR/GUIDANCE.txt" >&2
  exit 1
fi
# Classify from our own argv: a read-only subcommand asks for the transport-only
# grant, anything else for full bot credentials + signing.
MODE=write
case "$SUB" in
  ${pattern}) MODE=read;;
esac
# Ask the in-process grant server. The client gets the socket + mode in its own
# env and a PATH with the shim dir stripped; on success its stdout is the env to
# eval. Its stderr carries a refusal reason, captured for a write block.
if [ -n "$GBI_GRANT_SOCK" ] && [ -x "$RUNTIME" ] && [ -f "$CLIENT" ]; then
  ERRFILE=$(mktemp "\${TMPDIR:-/tmp}/gbi-grant-err.XXXXXX" 2>/dev/null)
  if [ -n "$ERRFILE" ]; then
    if GRANT=$(GBI_IN_SHIM=1 BUN_BE_BUN=1 GBI_GRANT_MODE="$MODE" GBI_GRANT_SOCK="$GBI_GRANT_SOCK" PATH="$SAFEPATH" "$RUNTIME" "$CLIENT" 2>"$ERRFILE"); then
      rm -f "$ERRFILE"
      eval "$GRANT"
      unset GBI_GRANT_SOCK
      exec "$REALBIN" "$@"
    fi
    # A refused read still runs: public reads must keep working.
    if [ "$MODE" = read ]; then
      rm -f "$ERRFILE"
      exec "$REALBIN" "$@"
    fi
    if [ -s "$ERRFILE" ]; then
      cat "$ERRFILE" >&2
    else
      cat "$SHIMDIR/GUIDANCE.txt" >&2
    fi
    rm -f "$ERRFILE"
    exit 1
  fi
fi
# No usable grant channel (socket absent/unreachable, or no runtime/client): a
# read still runs under the neutral env; a write fails closed with guidance.
if [ "$MODE" = read ]; then
  exec "$REALBIN" "$@"
fi
cat "$SHIMDIR/GUIDANCE.txt" >&2
exit 1
`;
}

/**
 * Install the git/gh shim under `${dir}/shim`. Generates:
 *   - GUIDANCE.txt  — the write-block message (quoting-hell-free)
 *   - git           — executable POSIX sh wrapper (grant → real binary;
 *                     read → real binary when refused; else block)
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
