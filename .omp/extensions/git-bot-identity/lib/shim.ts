/**
 * POSIX-sh git/gh shim: it classifies its own argv and either runs the real
 * binary under the neutral env, or redeems the matching credential grant from
 * the in-process grant server.
 *
 * On every invocation it finds the subcommand (and, for gh namespaces, the verb)
 * past leading options (`git -c k=v diff`, `gh -R o/r pr view`), then assigns one
 * of FOUR classes:
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
 *  - refuse (`gh auth token`, `gh auth switch`): a `gh auth` verb other than
 *    `status` (see GH_AUTH_READ_VERBS). It would read, switch or install a
 *    GitHub credential, which the agent must never do. Prints the block message
 *    and exits 1 with no grant request and no exec of the real binary: there is
 *    no credential for the agent to obtain through it.
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

import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync, type Dirent } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { connect } from "node:net";
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
 * `label` are not blanket reads either, since `labels` has write verbs too.
 * `auth` is absent: only `gh auth status` is a read (GH_AUTH_READ_VERBS); every
 * other `gh auth` verb is refused by ghClassify. */
export const GH_READ_ALLOWLIST = [
	"version", "help", "completion", "config", "status", "browse",
	"search", "cache", "extension",
];

/** The only `gh auth` verb treated as read: it shows the active account without
 * handing out a token. A bare `gh auth`, `--show-token`, and every other verb
 * (token, switch, login, refresh, logout, setup-git, git-credential) are
 * refused (see ghClassify). */
export const GH_AUTH_READ_VERBS = ["status"];

/** Message printed for a refused `gh auth` call. Plain text: the block is a UX
 * prompt to stop, not the security boundary (see the header comment). */
export const GH_AUTH_BLOCK_MESSAGE = `git-bot-identity: gh auth blocked: agents must not read, switch or install GitHub credentials.
Allowed: gh auth status (which account is active). Refused: token, switch, login, refresh,
logout, setup-git, git-credential, a bare gh auth, and gh auth status --show-token.
On a 403 or missing access, stop and report it to the user instead of looking for a credential.`;

/** gh namespaces whose read-only verbs are allowlisted (`gh pr view`, `gh repo
 * list`). Any other verb in these namespaces, and every other namespace, is a
 * write. */
export const GH_READ_NAMESPACES = ["pr", "issue", "run", "release", "repo", "workflow", "label"];

/** Read-only gh verbs inside a GH_READ_NAMESPACES namespace. */
export const GH_READ_VERBS = ["view", "list", "status", "diff", "checks"];

interface ShimRealBinaries {
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

interface ShimInstall {
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
 * read verbs are allowlisted per namespace; `gh auth` is refused except
 * `status`; everything else fails closed. */
function ghClassify(): string {
	return `MODE=write
case "$SUB" in
  "") MODE=read;;
  ${casePattern(GH_READ_ALLOWLIST)}) MODE=read;;
  auth)
    case "$SUB2" in
      ${casePattern(GH_AUTH_READ_VERBS)}) MODE=read;;
      *) MODE=refuse;;
    esac
    # \`gh auth status --show-token\` prints the credential itself.
    if [ "$MODE" = read ]; then
      for a do
        case "$a" in --show-token|--show-token=*) MODE=refuse;; esac
      done
    fi
    ;;
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
# Installed by omp git-bot-identity. UX/guidance + grant request only;
# security is enforced by the stripped process environment (see
# lib/neutralize.ts), so this coarse read/write/local/refuse split's imprecision
# is harmless: a misclassified write still fails closed on credentials.
SHIMDIR=${shQuote(shimDir)}
REALBIN=${shQuote(realBinary)}
RUNTIME=${shQuote(runtime)}
CLIENT=${shQuote(GRANT_CLIENT_PATH)}
AUTHBLOCK=${shQuote(GH_AUTH_BLOCK_MESSAGE)}
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
# Refused class: no grant request and no exec. This is a gh credential verb, so
# there is nothing the shim could legitimately hand it.
if [ "$MODE" = refuse ]; then
  printf '%s\\n' "$AUTHBLOCK" >&2
  exit 1
fi
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
 *   - gh            — same, for the gh CLI; `gh auth` other than `status`
 *                     (or a `--show-token` status) blocks before any grant
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

/**
 * Outcome of probing a grant socket: `live` (a connect succeeded), `dead` (the
 * connect was refused or the path vanished), or `unknown` (timeout or any other
 * error). `unknown` is treated as live: another process's working grant server
 * must never be swept because a probe raced or stalled.
 */
export type GrantSocketProbe = "live" | "dead" | "unknown";

/** Probe one grant socket. Async because it connects to it. */
export type ProbeGrantSocket = (socketPath: string) => Promise<GrantSocketProbe>;

/** Longest a single probe waits for a connect before it is `unknown`. */
const PROBE_TIMEOUT_MS = 250;

/** A `dead` socket must be this old before the sweep removes it, so a socket
 * that is bound but not yet listening is never mistaken for a stale one. */
export const SWEEP_GRACE_MS = 5000;

/**
 * Liveness is decided by the socket, never by the pid: `process.kill(pid, 0)`
 * only sees the caller's PID namespace, so a sandboxed omp (`--unshare-pid`)
 * would judge every host omp dead and delete its live grant socket. Connect
 * instead; a refused/unlinked socket is the only proof a pid is gone.
 */
export function defaultProbeGrantSocket(socketPath: string): Promise<GrantSocketProbe> {
	const { promise, resolve } = Promise.withResolvers<GrantSocketProbe>();
	const socket = connect({ path: socketPath });
	let settled = false;
	const settle = (result: GrantSocketProbe) => {
		if (settled) return;
		settled = true;
		socket.destroy();
		resolve(result);
	};
	socket.setTimeout(PROBE_TIMEOUT_MS);
	socket.once("connect", () => settle("live"));
	socket.once("timeout", () => settle("unknown"));
	socket.once("error", err => {
		const code = (err as NodeJS.ErrnoException).code;
		settle(code === "ECONNREFUSED" || code === "ENOENT" || code === "ENOTSOCK" ? "dead" : "unknown");
	});
	return promise;
}

/**
 * Remove stale per-process state under `credsDir`: `grant-<pid>.sock` and
 * `shim-<pid>/` entries whose socket no longer accepts a connection, plus the
 * legacy shared `shim/` dir from before per-process dirs. This process's own
 * entries are never removed. A socket that fails to connect is removed only
 * once its mtime is older than `graceMs`, so a starting process's bind is not
 * swept; a `shim-<pid>/` dir follows its own mtime on the same rule.
 *
 * The legacy dir goes only once no other process holds a live grant socket: a
 * process still running the pre-per-process code has `shim/` on its PATH, and
 * removing it would silently route that session's git past the shim.
 */
export async function sweepStaleShimState(
	dir: string,
	probe: ProbeGrantSocket = defaultProbeGrantSocket,
	now: () => number = Date.now,
	graceMs: number = SWEEP_GRACE_MS,
): Promise<void> {
	let entries: Dirent[];
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	const at = now();
	const probes = new Map<string, GrantSocketProbe>();
	const probeOnce = async (socketPath: string): Promise<GrantSocketProbe> => {
		const cached = probes.get(socketPath);
		if (cached !== undefined) return cached;
		const result = await probe(socketPath);
		probes.set(socketPath, result);
		return result;
	};
	// A path that vanished mid-sweep is not old *enough* to prove anything;
	// removing it is already a no-op, so err on keeping.
	const olderThanGrace = (p: string): boolean => {
		try {
			return at - statSync(p).mtimeMs > graceMs;
		} catch {
			return false;
		}
	};
	let otherLiveSocket = false;
	for (const entry of entries) {
		const match = SHIM_STATE_RE.exec(entry.name);
		if (!match) continue;
		const pid = Number(match[1] ?? match[2]);
		if (pid === process.pid) continue;
		const path = join(dir, entry.name);
		if (match[1] !== undefined) {
			const result = await probeOnce(path);
			if (result === "live") otherLiveSocket = true;
			else if (result === "dead" && olderThanGrace(path)) rmSync(path, { force: true });
			continue;
		}
		// shim-<pid>/: live when its matching grant socket probes live.
		let result: GrantSocketProbe;
		try {
			statSync(join(dir, `grant-${pid}.sock`));
			result = await probeOnce(join(dir, `grant-${pid}.sock`));
		} catch {
			result = "dead";
		}
		if (result === "dead" && olderThanGrace(path)) rmSync(path, { recursive: true, force: true });
	}
	if (!otherLiveSocket) rmSync(join(dir, "shim"), { recursive: true, force: true });
}

/** Remove this process's shim dir and its grant socket. */
export function removeShimState(shimDir: string, socketPath: string): void {
	rmSync(shimDir, { recursive: true, force: true });
	rmSync(socketPath, { force: true });
}

interface ShimCleanup {
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
