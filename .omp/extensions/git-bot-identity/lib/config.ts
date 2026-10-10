/**
 * Bot credential discovery. Reads the human-managed config at
 * ~/.config/git-bot-identity/config.json into a typed bundle,
 * and pulls the human's fallback co-author identity from their global git
 * config.
 *
 * Absent or malformed creds are NOT an error — they mean "fail closed on
 * writes" and are reported as `null` so the caller can block with a clear
 * message instead of inventing a fallback identity. name/email/token are
 * required and fail closed; humanName/humanNoreply are optional
 * (they fall back to the human's git config). The bot's signing key is NOT
 * read from the human's git config — it is the bot's own key (see
 * lib/gpg.ts), optionally overridden by a `signingKey` field in config.json.
 */
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const CONFIG_DIR = join(homedir(), ".config", "git-bot-identity");
export const CONFIG_FILE = "config.json";

/**
 * Injectable subprocess reader shape so tests never shell out. `cmd` is the
 * full argv (e.g. `["git","config","--global","--get","user.name"]`);
 * `env` is an optional env overlay (used by the gpg key lifecycle to point
 * GNUPGHOME at the bot home). Both `stdout` and `stderr` are captured (gpg
 * and git report errors on stderr, so diagnostics read them first).
 */
export type SpawnFn = (cmd: string[], env?: Record<string, string>) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

/**
 * The one real Bun.spawn wrapper (production default for every caller).
 * `env` overrides are layered over `base`: the process env for the bot's own
 * git/gpg calls, or the extension's pristine env where the neutral overlay must
 * not self-block it. stdin is ignored so no child can block on input.
 */
export async function spawnCollect(
	cmd: string[],
	env?: Record<string, string>,
	base: Record<string, string | undefined> = process.env,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const proc = Bun.spawn(cmd, { env: { ...base, ...env }, stdout: "pipe", stderr: "pipe", stdin: "ignore" });
	const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
	return { exitCode: await proc.exited, stdout, stderr };
}

/** Read one `git config --global --get` key; non-zero exit or empty = absent. */
async function gitGlobalGet(spawn: SpawnFn, key: string): Promise<string | undefined> {
	const { exitCode, stdout } = await spawn(["git", "config", "--global", "--get", key]);
	const value = stdout.trim();
	if (exitCode !== 0 || value === "") return undefined;
	return value;
}

interface BotConfig {
	/** Agent account display name; used for author/committer. */
	name: string;
	/** Agent account email (the GPG key UID email for Verified). */
	email: string;
	/** Personal Access Token for the agent account (classic PAT, `repo` scope). */
	token: string;
	/** Human display name for the co-author trailer (optional; falls back to git config). */
	humanName?: string;
	/** Human numeric-id noreply email used for Co-authored-by (optional; falls back to git config). */
	humanNoreply?: string;
	/** Bot's own GPG signing key id; optional override from config.json `signingKey`. */
	signingKey?: string;
	/** Path to an armored, passphrase-less secret key to import into the bot's
	 * isolated keyring; optional from config.json `signingKeyFile`. Provisions
	 * ONE key across hosts (mount the secret file) instead of generating a fresh
	 * key — and registering a fresh public key on GitHub — per host. */
	signingKeyFile?: string;
}

const REQUIRED_KEYS = ["name", "email", "token"] as const;

/** Read an optional string field; non-string or empty → undefined. */
function optionalString(parsed: Record<string, unknown>, key: string): string | undefined {
	const value = parsed[key];
	if (typeof value !== "string" || value.trim() === "") return undefined;
	return value;
}

/**
 * Expand a leading `~` (or a bare `~`) in a filesystem path against the
 * current user's home directory. gpg is not a shell and never expands `~`,
 * so a tilde-prefixed `signingKeyFile` must be resolved here before it is
 * passed to `--import`. Non-tilde paths pass through untouched; a leading
 * `$HOME` is deliberately NOT supported.
 */
export function expandTilde(path: string): string {
	if (path === "~" || path.startsWith("~/")) {
		return join(homedir(), path.slice(1));
	}
	return path;
}

/** Result of reading config.json: the parsed config, or why there is none. */
type ConfigRead =
	| { ok: true; config: BotConfig }
	| { ok: false; kind: "absent" }
	| { ok: false; kind: "invalid"; reason: string };

/**
 * Read and parse config.json in one shot. Unlike `loadBotConfig`, this keeps the
 * absent-vs-unusable distinction (and the parse error text), so the reload path
 * can refuse a stale grant with a reason that names the problem.
 */
function readBotConfig(dir: string = CONFIG_DIR): ConfigRead {
	let raw: string;
	try {
		raw = readFileSync(join(dir, CONFIG_FILE), "utf8");
	} catch {
		return { ok: false, kind: "absent" };
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		return { ok: false, kind: "invalid", reason: `not valid JSON: ${err instanceof Error ? err.message : String(err)}` };
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		return { ok: false, kind: "invalid", reason: "expected a JSON object" };
	}
	const record = parsed as Record<string, unknown>;
	for (const key of REQUIRED_KEYS) {
		const value = record[key];
		if (typeof value !== "string" || value.trim() === "") {
			return { ok: false, kind: "invalid", reason: `missing required field "${key}"` };
		}
	}

	const config: BotConfig = {
		name: record["name"] as string,
		email: record["email"] as string,
		token: record["token"] as string,
	};
	const humanName = optionalString(record, "humanName");
	if (humanName !== undefined) config.humanName = humanName;
	const humanNoreply = optionalString(record, "humanNoreply");
	if (humanNoreply !== undefined) config.humanNoreply = humanNoreply;

	// Bot's own signing key override (its key id). This is NOT read from the
	// human's git config — the human keyring is never consulted for signing.
	const signingKey = optionalString(record, "signingKey");
	if (signingKey !== undefined) config.signingKey = signingKey;

	// Path to a secret key to import into the bot keyring — the multi-host path:
	// one key, mounted on every host, one public key registered on GitHub.
	const signingKeyFile = optionalString(record, "signingKeyFile");
	// Expand a tilde-prefixed signingKeyFile so every consumer gets a usable
	// absolute path (gpg is not a shell and never expands `~`).
	if (signingKeyFile !== undefined) config.signingKeyFile = expandTilde(signingKeyFile);

	return { ok: true, config };
}

/**
 * Load bot credentials from `dir` (readonly injection point; production calls
 * use CONFIG_DIR). Returns null when anything required is missing/malformed —
 * decided by the caller to fail closed. Optional fields (humanName,
 * humanNoreply, signingKey) are attached only when present.
 *
 * Presence is all the setup wizard and launch nudge need, so absent and
 * unusable both collapse to null here; the reload path uses `readBotConfig`
 * directly to keep the distinction (and the parse reason).
 */
export function loadBotConfig(dir: string = CONFIG_DIR): BotConfig | null {
	const read = readBotConfig(dir);
	return read.ok ? read.config : null;
}

/**
 * A config.json change key: mtime + byte size. Both, because mtime can repeat
 * within a filesystem timestamp quantum and size alone misses a same-size edit.
 */
export interface ConfigStamp {
	mtimeMs: number;
	size: number;
}

/** True when two stamps describe the same file version (both absent = same). */
export function sameConfigStamp(a: ConfigStamp | null, b: ConfigStamp | null): boolean {
	if (a === null || b === null) return a === b;
	return a.mtimeMs === b.mtimeMs && a.size === b.size;
}

/** Cheap change key for config.json; null when the file is absent. */
function statBotConfig(dir: string = CONFIG_DIR): ConfigStamp | null {
	try {
		const st = statSync(join(dir, CONFIG_FILE));
		return { mtimeMs: st.mtimeMs, size: st.size };
	} catch {
		return null;
	}
}

/**
 * Resolve the human co-author identity. Precedence: an explicit config value
 * wins; otherwise the human's global git config (`user.name` / `user.email`).
 * Each of name and email is resolved independently and mixed freely. Throws
 * when neither source yields BOTH a name and an email — the caller turns this
 * into a warning and blocks all writes (fail-closed: never invent an identity).
 */
export async function resolveHumanIdentity(
	config: { humanName?: string; humanNoreply?: string },
	spawn: SpawnFn = spawnCollect,
): Promise<{ name: string; email: string }> {
	const name = config.humanName?.trim() || (await gitGlobalGet(spawn, "user.name"));
	const email = config.humanNoreply?.trim() || (await gitGlobalGet(spawn, "user.email"));
	if (name === undefined || email === undefined) {
		throw new Error(
			"human identity unresolved: set humanName/humanNoreply in ~/.config/git-bot-identity/config.json or git config --global user.name/user.email",
		);
	}
	return { name, email };
}

/**
 * The last-seen config.json plus everything derived from it. `config` is null
 * when the file is absent or unusable; `invalidReason` names the parse problem
 * when the file is present but unusable, so the caller refuses with that reason
 * instead of serving a grant from an older config.
 */
interface BotConfigSnapshot {
	stamp: ConfigStamp | null;
	config: BotConfig | null;
	identity: { name: string; email: string } | null;
	invalidReason: string | null;
	identityWarning: string | null;
}

interface BotConfigCache {
	/** Re-stat; re-read and re-resolve only when mtime/size changed. */
	refresh(): Promise<BotConfigSnapshot>;
}

const ABSENT_SNAPSHOT: BotConfigSnapshot = {
	stamp: null,
	config: null,
	identity: null,
	invalidReason: null,
	identityWarning: null,
};

/**
 * Config cache for the reload path: each grant request re-stats config.json and
 * re-reads it only when mtime/size changed, so a config written by
 * /git-bot-setup, a rotated token, or a hand edit takes effect on the next
 * git/gh call without restarting omp. Nothing changed ⇒ the stat is the only
 * filesystem access. A deleted config yields the absent snapshot; an
 * unparseable one yields `config: null` + `invalidReason` — both refuse, never
 * a stale grant. A change also re-resolves the human identity.
 */
export function createBotConfigCache(dir: string = CONFIG_DIR, spawn: SpawnFn = spawnCollect): BotConfigCache {
	let cached: BotConfigSnapshot | null = null;
	return {
		async refresh(): Promise<BotConfigSnapshot> {
			const stamp = statBotConfig(dir);
			if (cached !== null && sameConfigStamp(cached.stamp, stamp)) return cached;
			cached = await readSnapshot(dir, stamp, spawn);
			return cached;
		},
	};
}

async function readSnapshot(dir: string, stamp: ConfigStamp | null, spawn: SpawnFn): Promise<BotConfigSnapshot> {
	if (stamp === null) return ABSENT_SNAPSHOT;
	const read = readBotConfig(dir);
	if (!read.ok) {
		// The file vanished between the stat and the read: report it absent so the
		// next refresh re-stats and picks it up when it returns.
		if (read.kind === "absent") return ABSENT_SNAPSHOT;
		return { stamp, config: null, identity: null, invalidReason: read.reason, identityWarning: null };
	}
	try {
		const identity = await resolveHumanIdentity(read.config, spawn);
		return { stamp, config: read.config, identity, invalidReason: null, identityWarning: null };
	} catch (err) {
		return {
			stamp,
			config: read.config,
			identity: null,
			invalidReason: null,
			identityWarning: err instanceof Error ? err.message : String(err),
		};
	}
}
