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
import { readFileSync } from "node:fs";
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

/** Real Bun.spawn wrapper (production default). */
async function defaultSpawn(cmd: string[], env?: Record<string, string>): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const proc = Bun.spawn(cmd, { env: { ...process.env, ...env }, stdout: "pipe", stderr: "pipe", stdin: "ignore" });
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

export interface BotConfig {
	/** Agent account display name; used for author/committer. */
	name: string;
	/** Agent account email (the GPG key UID email for Verified). */
	email: string;
	/** Personal Access Token for the agent account (contents:write / repo). */
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

/**
 * Load bot credentials from `dir` (readonly injection point; production calls
 * use CONFIG_DIR). Returns null when anything required is missing/malformed —
 * decided by the caller to fail closed. Optional fields (humanName,
 * humanNoreply, signingKey) are attached only when present.
 */
export async function loadBotConfig(dir: string = CONFIG_DIR, spawn: SpawnFn = defaultSpawn): Promise<BotConfig | null> {
	let raw: string;
	try {
		raw = readFileSync(join(dir, CONFIG_FILE), "utf8");
	} catch {
		return null;
	}
	let parsed: Record<string, unknown>;
	try {
		parsed = JSON.parse(raw) as Record<string, unknown>;
	} catch {
		return null;
	}
	for (const key of REQUIRED_KEYS) {
		const value = parsed[key];
		if (typeof value !== "string" || value.trim() === "") return null;
	}

	const config: BotConfig = {
		name: parsed["name"] as string,
		email: parsed["email"] as string,
		token: parsed["token"] as string,
	};
	const humanName = optionalString(parsed, "humanName");
	if (humanName !== undefined) config.humanName = humanName;
	const humanNoreply = optionalString(parsed, "humanNoreply");
	if (humanNoreply !== undefined) config.humanNoreply = humanNoreply;

	// Bot's own signing key override (its key id). This is NOT read from the
	// human's git config — the human keyring is never consulted for signing.
	const signingKey = optionalString(parsed, "signingKey");
	if (signingKey !== undefined) config.signingKey = signingKey;

	// Path to a secret key to import into the bot keyring — the multi-host path:
	// one key, mounted on every host, one public key registered on GitHub.
	const signingKeyFile = optionalString(parsed, "signingKeyFile");
	// Expand a tilde-prefixed signingKeyFile so every consumer gets a usable
	// absolute path (gpg is not a shell and never expands `~`).
	if (signingKeyFile !== undefined) config.signingKeyFile = expandTilde(signingKeyFile);

	return config;
}

/**
 * Resolve the human co-author identity. Precedence: an explicit config value
 * wins; otherwise the human's global git config (`user.name` / `user.email`).
 * Each of name and email is resolved independently and mixed freely. Throws
 * when neither source yields BOTH a name and an email — the caller surfaces
 * this as a load error (fail-closed: never invent an identity).
 */
export async function resolveHumanIdentity(
	config: { humanName?: string; humanNoreply?: string },
	spawn: SpawnFn = defaultSpawn,
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
