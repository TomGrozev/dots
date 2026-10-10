/**
 * POSIX-sh git/gh shim: it classifies its own argv and either runs the real
 * binary under the neutral env, or redeems the matching credential grant from
 * the in-process grant server.
 *
 * On every invocation it finds the subcommand (and, for gh namespaces, the verb)
 * past leading options (`git -c k=v diff`, `gh -R o/r pr view`), then assigns one
 * of THREE classes:
 *
 *  - read (`git status`, `gh pr view`): asks the grant server for the bot's
 *    transport env. A refused read still execs the real binary under the neutral
 *    env — public reads keep working.
 *  - write (`git push`, `git commit`, `gh pr create`): asks the grant server for
 *    full bot credentials + signing. A refused write prints the reason and
 *    exits 1.
 *  - local (`git add`, `git rebase`): never contacts a remote, so it needs no
 *    credentials — it execs the real binary under the neutral env with NO grant
 *    request (no socket round-trip). See GIT_LOCAL_ALLOWLIST.
 *
 * The shim runs the checked-in grant client (lib/grant-client.ts) as a plain bun
 * instance, `BUN_BE_BUN=1 "$RUNTIME" "$CLIENT"`, where RUNTIME is
 * `process.execPath`. On success it evals the client's exported env, unsets the
 * socket, and execs the real binary with that env (incl. the real PATH).
 *
 * The token travels only over the socket and through this shell's in-process
 * variables: never argv, never disk, never stdout.
 *
 * Sub-invocations (hooks, `rebase --exec`, merge drivers, aliases) inherit the
 * env the shim exec'd with — the neutral env for a local/refused call, the
 * granted env for a granted one — and any nested git/gh re-enters this shim and
 * is classified again. A nested write therefore still asks for a grant; it is
 * never silently inherited. Aliases (`git st`) are NOT resolved here, so they
 * fall through to the `write` default and fail closed.
 *
 * IMPORTANT: this is a UX layer and the grant request point, NOT the security
 * boundary. Security comes from the omp process environment being born
 * credential-neutral (see lib/neutralize.ts): GitHub-reaching tokens, SSH agent,
 * and git credential helpers are stripped at load, so every child process is
 * already unable to authenticate a write regardless of what command name it
 * invokes. The coarse split needs no precision — a "write" that a read-only
 * classification slips through still fails closed on credentials. The shim's job
 * is to replace an opaque auth failure with an actionable block message, and to
 * hand the granted creds to the call.
 *
 * Each process installs its wrappers under its own `${credsDir}/shim-<pid>/`
 * dir, so one process's baked paths (runtime, grant client, resolved real
 * binaries) can never collide with another's. The dir and the process's grant
 * socket are removed on exit/SIGINT/SIGTERM; stale entries from dead pids are
 * swept at startup.
 */

import { mkdirSync, readdirSync, rmSync, writeFileSync, type Dirent } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { evalGuidance } from "./guidance";

/** git subcommands treated as read-only (passed through to the real binary).
 * Coarse and deliberately not exhaustive — see the header comment. */
export const GIT_READ_ALLOWLIST = [
	"status", "log", "diff", "show", "fetch", "ls-remote", "ls-files",
	"rev-parse", "branch", "describe", "cat-file", "blame", "remote", "config",
	"tag", "shortlog", "for-each-ref", "symbolic-ref", "version", "help",
	"rev-list", "show-ref", "whatchanged", "grep", "reflog",
];

/** git subcommands run under the neutral env with NO grant request: they never
 * contact a remote and never author a commit, so they need no credentials.
 * Commit-creating commands (`commit`, `commit-tree`, `merge`, `rebase`,
 * `cherry-pick`, `revert`, `am`, `notes`, `stash`) are deliberately absent:
 * under the neutral env they have no author identity and no signing key, so
 * they must take the write grant to produce signed bot commits. `tag` is read,
 * not local — it is mostly a listing, and its annotated/signed *creation* forms
 * are reclassified as write (see gitClassify). */
export const GIT_LOCAL_ALLOWLIST = [
	"add", "restore", "switch", "checkout", "reset", "mv", "rm", "init",
	"clean", "worktree", "apply", "update-index", "read-tree", "write-tree",
	"gc", "prune", "maintenance", "sparse-checkout", "bisect",
];

/** gh top-level subcommands treated as read-only. `api` is absent: it is read
 * only for a GET with no body/field flags (see ghClassify). `codespace` and
 * `label` are not blanket reads either — `labels` has write verbs too. */
export const GH_READ_ALLOWLIST = [
	"auth", "version", "help", "completion", "config", "status", "browse",
	"search", "cache", "extension",
];

/** gh namespaces whose read-only verbs are allowlisted (`gh pr view`, `gh repo
 * list`). Any other verb in these namespaces, and every other namespace, is a
 * write. */
export const GH_READ_NAMESPACES = ["pr", "issue", "run", "release", "repo", "workflow", "label"];

/** Read-only gh verbs inside a GH_READ_NAMESPACES namespace. */
export const GH_READ_VERBS = ["view", "list", "status", "diff", "checks"];

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

/** Join words into a POSIX-sh `case` pattern alternation. */
function casePattern(words: readonly string[]): string {
	return words.join("|");
}

/** Shell that assigns MODE=read|local|write from SUB/SUB2/argv. Embedded
 * verbatim into the generated wrapper; all inputs are our own constants. */
function gitClassify(): string {
	return `MODE=write
case "$SUB" in
  "") MODE=read;;
  ${casePattern(GIT_READ_ALLOWLIST)}) MODE=read;;
  ${casePattern(GIT_LOCAL_ALLOWLIST)}) MODE=local;;
esac
# An annotated/signed tag needs the bot identity + signing key, so it is a
# write even though a plain \`git tag\` listing is a read.
if [ "$SUB" = tag ]; then
  for a do
    case "$a" in
      -a|-s|-e|-m*|-F*|-u*|--annotate|--sign|--edit|--local-user*|--message*|--file*) MODE=write;;
    esac
  done
fi`;
}

/** gh classification: `api` is read only for a GET without body/field flags;
 * read verbs are allowlisted per namespace; everything else fails closed. */
function ghClassify(): string {
	return `MODE=write
case "$SUB" in
  "") MODE=read;;
  ${casePattern(GH_READ_ALLOWLIST)}) MODE=read;;
  api)
    MODE=read
    PREV=""
    for a do
      if [ -n "$PREV" ]; then
        case "$a" in GET|get) ;; *) MODE=write;; esac
        PREV=""
        continue
      fi
      case "$a" in
        -X|--method) PREV=1;;
        -X*) MODE=write;;
        --method=*) case "$a" in --method=GET|--method=get) ;; *) MODE=write;; esac;;
        -f|-F|--field|--raw-field|--input|-f*|-F*|--field=*|--raw-field=*|--input=*) MODE=write;;
      esac
    done
    ;;
  ${casePattern(GH_READ_NAMESPACES)})
    case "$SUB2" in
      ${casePattern(GH_READ_VERBS)}) MODE=read;;
      *) MODE=write;;
    esac
    ;;
  *) MODE=write;;
esac`;
}

function buildScript(realBinary: string, shimDir: string, runtime: string, classify: string): string {
	return `#!/bin/sh
# Installed by omp git-bot-identity. UX/guidance + grant request only —
# security is enforced by the stripped process environment (see
# lib/neutralize.ts), so this coarse read/write/local split's imprecision is
# harmless: a misclassified write still fails closed on credentials.
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
# Find the subcommand (SUB) and, for gh namespaces, the verb (SUB2) past leading
# options. Options that take a separate value are skipped so a value is never
# mistaken for a subcommand (\`git -C status push\`, \`gh -R o/r pr view\`).
SUB=""; SUB2=""; SKIP=""
for a do
  if [ -n "$SKIP" ]; then SKIP=""; continue; fi
  case "$a" in
    -c|-C|--git-dir|--work-tree|--namespace|--super-prefix|--config-env|-R|--repo|--hostname) SKIP=1;;
    -*) ;;
    *) if [ -z "$SUB" ]; then SUB="$a"; elif [ -z "$SUB2" ]; then SUB2="$a"; break; fi;;
  esac
done
${classify}
# Re-entry guard, independent of BUN_BE_BUN: anything reached from inside the
# client's runtime never redeems and never starts a runtime again. Reads and
# local commands are safe to run; a nested write fails closed.
if [ -n "$GBI_IN_SHIM" ]; then
  case "$MODE" in
    read|local) exec "$REALBIN" "$@";;
  esac
  cat "$SHIMDIR/GUIDANCE.txt" >&2
  exit 1
fi
# Local class: never contacts a remote, so no grant request.
if [ "$MODE" = local ]; then
  exec "$REALBIN" "$@"
fi
# No usable grant channel: say which check failed, so the operator can fix it.
NOREASON=""
if [ -z "$GBI_GRANT_SOCK" ]; then
  NOREASON='git-bot-identity: grant server unreachable (GBI_GRANT_SOCK is unset)'
elif [ ! -x "$RUNTIME" ]; then
  NOREASON="git-bot-identity: grant server unreachable (grant runtime is not executable at $RUNTIME)"
elif [ ! -f "$CLIENT" ]; then
  NOREASON="git-bot-identity: grant server unreachable (grant client missing at $CLIENT)"
fi
if [ -n "$NOREASON" ]; then
  if [ "$MODE" = read ]; then exec "$REALBIN" "$@"; fi
  printf '%s\\n' "$NOREASON" >&2
  exit 1
fi
# Ask the in-process grant server. The client gets the socket + mode in its own
# env and a PATH with the shim dir stripped; on success its stdout is the env to
# eval. Its stderr carries a refusal reason (or the unreachable message),
# captured for a write block.
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
# mktemp unavailable: a read still runs under the neutral env; a write fails
# closed with guidance.
if [ "$MODE" = read ]; then
  exec "$REALBIN" "$@"
fi
cat "$SHIMDIR/GUIDANCE.txt" >&2
exit 1
`;
}

/** This process's shim dir under `credsDir`. Per-pid so two processes never
 * share (and thus never corrupt) each other's baked paths. */
export function shimDirFor(dir: string, pid: number = process.pid): string {
	return join(dir, `shim-${pid}`);
}

/** True when `p` is `dir` itself or lies inside it. */
function isInside(dir: string, p: string): boolean {
	if (!isAbsolute(p)) return false;
	const rel = relative(dir, p);
	return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/** Refuse to point a wrapper's REALBIN at anything under the creds dir: that is
 * where the shims themselves live, so the wrapper would exec itself (a read
 * would loop; a write would re-enter with no socket). */
function assertRealBinaryOutsideCredsDir(dir: string, name: string, p: string): void {
	if (isInside(dir, p)) {
		throw new Error(
			`git-bot-identity: refusing to install the ${name} shim — the resolved real ${name} (${p}) is inside the credentials dir (${dir}); the wrapper would exec itself.`,
		);
	}
}

/**
 * Install the git/gh shim under `${dir}/shim-<pid>`. Generates:
 *   - GUIDANCE.txt  — the write-block message (quoting-hell-free)
 *   - git           — executable POSIX sh wrapper (grant → real binary;
 *                     read → real binary when refused; local → real binary
 *                     without a grant; else block)
 *   - gh            — same, for the gh CLI
 * The grant client is NOT generated here: the wrappers run the checked-in
 * lib/grant-client.ts by absolute path. Idempotent: rewrites each file on
 * every call. Throws if the resolved real git/gh is inside `dir`.
 */
export function installShim(dir: string, real: ShimRealBinaries, pid: number = process.pid): ShimInstall {
	assertRealBinaryOutsideCredsDir(dir, "git", real.git);
	assertRealBinaryOutsideCredsDir(dir, "gh", real.gh);
	const shimDir = shimDirFor(dir, pid);
	mkdirSync(shimDir, { recursive: true, mode: 0o700 });
	writeFileSync(join(shimDir, "GUIDANCE.txt"), evalGuidance(), { mode: 0o600 });
	writeFileSync(join(shimDir, "git"), buildScript(real.git, shimDir, real.runtime, gitClassify()), { mode: 0o755 });
	writeFileSync(join(shimDir, "gh"), buildScript(real.gh, shimDir, real.runtime, ghClassify()), { mode: 0o755 });
	return { shimDir, grantClientPath: GRANT_CLIENT_PATH };
}

/** Matches a per-process shim dir or grant socket name under the creds dir. */
const SHIM_STATE_RE = /^(?:grant-(\d+)\.sock|shim-(\d+))$/;

/** A PATH entry that is a shim dir (per-process `shim-<pid>` or the legacy
 * shared `shim`) under `credsDir`. Used to keep a shim dir out of the real
 * PATH — resolving git/gh through it would point a wrapper's REALBIN at
 * itself. */
export function isShimPathEntry(credsDir: string, entry: string): boolean {
	if (entry === "") return false;
	const rel = relative(credsDir, entry);
	if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return false;
	return /^shim(-\d+)?$/.test(rel);
}

/** Whether a pid is still running. EPERM means alive (another user's pid);
 * ESRCH means dead. */
export function defaultPidIsAlive(pid: number): boolean {
	if (pid <= 0) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (err) {
		return (err as NodeJS.ErrnoException).code !== "ESRCH";
	}
}

/**
 * Remove stale per-process state under `credsDir`: `grant-<pid>.sock` and
 * `shim-<pid>/` entries whose pid is dead, plus the legacy shared `shim/` dir
 * from before per-process dirs. Live pids' entries are left alone. The legacy
 * dir goes only once no other process holds a live grant socket: a process
 * still running the pre-per-process code has `shim/` on its PATH, and removing
 * it would silently route that session's git past the shim.
 */
export function sweepStaleShimState(dir: string, isAlive: (pid: number) => boolean = defaultPidIsAlive): void {
	let entries: Dirent[];
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	let otherLiveSocket = false;
	for (const entry of entries) {
		const match = SHIM_STATE_RE.exec(entry.name);
		if (!match) continue;
		const pid = Number(match[1] ?? match[2]);
		if (!isAlive(pid)) {
			rmSync(join(dir, entry.name), { recursive: true, force: true });
		} else if (pid !== process.pid && entry.name.startsWith("grant-")) {
			otherLiveSocket = true;
		}
	}
	if (!otherLiveSocket) rmSync(join(dir, "shim"), { recursive: true, force: true });
}

/** Remove this process's shim dir and its grant socket. */
export function removeShimState(shimDir: string, socketPath: string): void {
	rmSync(shimDir, { recursive: true, force: true });
	rmSync(socketPath, { force: true });
}

export interface ShimCleanup {
	shimDir: string;
	socketPath: string;
}

/**
 * Registry key for the process-wide cleanup registration. A `Symbol.for` key so
 * the several binds in one process (new session, subagent) register exactly one
 * set of handlers, mirroring the grant server and pristine-env registries.
 */
const CLEANUP_KEY = Symbol.for("omp.git-bot-identity.shim-cleanup");

/**
 * Register cleanup of this process's shim dir and grant socket on process exit,
 * SIGINT and SIGTERM. The signal handlers re-raise with the default disposition
 * so the process still dies by the signal; they are not swallowed. Registered
 * once per process.
 */
export function installShimCleanup(cleanup: ShimCleanup): void {
	const registry = globalThis as unknown as Record<symbol, boolean | undefined>;
	if (registry[CLEANUP_KEY]) return;
	registry[CLEANUP_KEY] = true;
	process.on("exit", () => removeShimState(cleanup.shimDir, cleanup.socketPath));
	for (const signal of ["SIGINT", "SIGTERM"] as const) {
		const handler = () => {
			removeShimState(cleanup.shimDir, cleanup.socketPath);
			// Drop our handler, then re-raise: with no listener the default
			// disposition runs, so the process terminates by the signal.
			process.off(signal, handler);
			process.kill(process.pid, signal);
		};
		process.on(signal, handler);
	}
}
