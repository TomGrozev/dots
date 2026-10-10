/**
 * git-bot-identity — omp extension making agent git/gh writes act as a
 * dedicated GitHub account (e.g. `myproject-agent`); the human stays a
 * Co-authored-by trailer.
 *
 * ── Model: strip credentials by default, grant on the shim's own argv ───────
 * Security comes from REMOVING credentials, not from classifying commands —
 * which is the only thing that can cover the eval kernel, subagent shells, and
 * absolute-path invocations that a bash-command classifier never sees.
 *
 *  * Strip by default (init): at load, the omp process environment is
 *    neutralized so every child born afterwards — the bash tool's subprocess,
 *    the persistent eval kernel, task-subagent shells — inherits stripped
 *    GitHub credentials: SSH agent removed, gh token overridden with an invalid
 *    sentinel (which defeats the macOS keyring), git SSH/transport/prompt
 *    disabled, GIT_CONFIG_GLOBAL redirected to a credential-less deny config,
 *    GNUPGHOME pointed at a neutral home, and PATH prefixed with a guidance
 *    shim dir. Public reads still work; every write and private read fails
 *    closed. (Empirically verified.)
 *  * Grant at the shim: the git/gh shim on the neutralized PATH classifies its
 *    own argv — read-only subcommands ask for `read`, anything else for `write`
 *    — and requests the matching env from the in-process grant server
 *    (lib/grant-server.ts) over a 0600 unix socket whose path every shell
 *    inherits as `GBI_GRANT_SOCK`. The server computes the env per request
 *    through the resolver this module supplies: read → the bot's transport
 *    only; write → full bot credentials plus signing-key resolution (config.json
 *    signingKeyFile → signingKey → generated bot key). Any session process that
 *    reaches the socket can obtain bot creds — by design. Credentials never
 *    touch disk: they live only in memory and travel over the socket.
 *  * Refusal: no config/identity → the resolver answers `{ok:false, reason:
 *    blockGuidance("bot credentials absent")}` and the shim prints that reason
 *    and exits 1; a refused read still execs the real binary under the neutral
 *    env. A failed signing-key setup is refused the same way. There is never a
 *    fallback to the human identity.
 *  * Attribution: every granted write commit carries `Co-authored-by: <human>`
 *    via a bot-scoped prepare-commit-msg hook (see lib/env.ts).
 *  * Signing: granted write commits are GPG-signed with the bot's own
 *    passphrase-less key (see lib/gpg.ts + lib/env.ts); a failed key setup
 *    refuses the write.
 *
 * Not hermetic: code that fetches a secret by other means (the keychain via a
 * different tool, a hardcoded token, a raw HTTPS call to the API) is beyond any
 * in-extension boundary. The neutralization closes every credential-REUSE
 * vector; a code-fetches-its-own-secret vector needs launch-level isolation.
 *
 * ── Seam ────────────────────────────────────────────────────────────────────
 *  Init mutates `process.env` once (strip by default), and the pristine
 *  pre-neutralization env is snapshotted ONCE PER PROCESS (keyed by a
 *  `Symbol.for` registry entry, so it survives the module being re-evaluated on
 *  a later bind). Every bind therefore resolves the human identity and the real
 *  PATH from that pristine snapshot, never from an already-overlaid env. The
 *  grant server and its resolver are shared per process per creds dir through
 *  the same `Symbol.for` registry pattern, so re-binds reuse one socket while
 *  the latest bind's resolver answers its requests. Each process installs its
 *  git/gh shim under its own `<credsDir>/shim-<pid>/`, so one process's baked
 *  paths can never break another's; on exit/SIGINT/SIGTERM that dir and the
 *  socket are removed, and stale entries from dead pids are swept at startup.
 *  The extension's own git/gh
 *  reads (human identity lookup, gpg key setup) run through a pristine-env
 *  spawn, so they are never self-blocked. A bind whose identity resolution
 *  throws still returns the overlay and leaves every request refused (distinct
 *  warning) — it never escapes as a load error, which would leave the process
 *  env unguarded.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { createBotConfigCache, sameConfigStamp, CONFIG_DIR, type ConfigStamp, type SpawnFn } from "./lib/config";
import { ensureBotKey, importBotKey } from "./lib/gpg";
import { buildBotEnv, installCoauthorHook, type BotEnvConfig } from "./lib/env";
import { neutralBaseEnv, writeDenyConfig } from "./lib/neutralize";
import { installShim, installShimCleanup, isShimPathEntry, shimDirFor, sweepStaleShimState } from "./lib/shim";
import { getGrantServer, type GrantDecision, type GrantResolver } from "./lib/grant-server";
import { blockGuidance } from "./lib/guidance";
import { installSetup } from "./lib/setup";
import { installCommitAsMe } from "./lib/commit-as-me";

export interface CreateOptions {
	/** Credentials directory override (tests); defaults to ~/.config/git-bot-identity. */
	credsDir?: string;
	/** Subprocess override (tests); used for git config reads and gpg key setup. */
	spawn?: SpawnFn;
}

/**
 * Registry key for the process-wide pristine-env snapshot. A `Symbol.for` key
 * (not a module-local variable) so the snapshot survives this module being
 * re-evaluated: omp re-imports the extension on every bind (new session,
 * subagent), and a module-local cache would reset while `process.env` stayed
 * neutralized — making the second bind treat the overlay as pristine, so
 * identity resolution would read the credential-less deny gitconfig and fail.
 */
const PRISTINE_ENV_KEY = Symbol.for("omp.git-bot-identity.pristine-env");

/** The pre-neutralization `process.env`, snapshotted on first use in this process. */
function pristineEnvSnapshot(): Record<string, string> {
	const registry = globalThis as unknown as Record<symbol, Record<string, string> | undefined>;
	const existing = registry[PRISTINE_ENV_KEY];
	if (existing) return existing;
	// Copy: `process.env` is mutated in place by the default export.
	const snapshot = { ...process.env } as Record<string, string>;
	registry[PRISTINE_ENV_KEY] = snapshot;
	return snapshot;
}

/** Bind result: the deny overlay to apply to `process.env`, plus the
 * pristine-env spawn the extension's own reads must use. */
export interface BotIdentityBind {
	neutralEnv: Record<string, string>;
	pristineSpawn: SpawnFn;
	/** Pre-neutralization env snapshot (real PATH, human config/signing) — used
	 * by `commit_as_me` to run git as the human, untouched by bot overrides. */
	pristineEnv: Record<string, string>;
	/** The bot identity for `commit_as_me`'s trailer, refreshed from config.json
	 * on demand; null when unconfigured. A getter (not a load-time snapshot) so a
	 * config written or edited after bind is visible without a rebind. */
	getBot: () => Promise<{ name: string; email: string } | null>;
	/** In-process bot write-class env resolver — the grant server's own resolver,
	 * reused by `commit_as_me` when the human picks the bot at the dialog. */
	resolveBotWriteEnv: () => Promise<GrantDecision>;
}

/**
 * Extension factory with injection points for tests: `credsDir` redirects
 * config discovery and neutral-scaffold writes, so no production path is
 * touched from tests; `spawn` overrides the git-config/gpg reader (a
 * pristine-env Bun.spawn by default) so tests never shell out.
 *
 * Returns the neutral env overlay to apply to the omp process (strip by
 * default). `createDefault` deliberately does NOT mutate `process.env` itself —
 * the production default export does, keeping unit tests free of global env
 * mutation.
 */
export async function createDefault(options: CreateOptions = {}): Promise<BotIdentityBind> {
	const credsDir = options.credsDir ?? CONFIG_DIR;
	// Process-wide pristine snapshot, taken at first bind before the default
	// export neutralizes process.env — so later binds (subagents, new sessions)
	// still resolve identity and the real PATH from the un-overlaid env.
	// The shim dir is filtered out of PATH even here: an omp process launched
	// from an agent shell inherits the neutralized env as its "pristine"
	// snapshot. Resolving git through it would point the shared shim's REALBIN
	// at itself (writes re-enter the shim without a socket and block; reads loop
	// forever), and the extension's own git reads and commit_as_me would loop too.
	const shimDir = shimDirFor(credsDir);
	const snapshot = pristineEnvSnapshot();
	// The real PATH — used both to resolve the real git/gh for the shim and to
	// restore transport on granted calls. Both this process's `shim-<pid>` dir
	// and any other process's shim dir (and the legacy shared `shim`) are
	// filtered out.
	const realPath = (snapshot.PATH ?? "")
		.split(":")
		.filter(entry => !isShimPathEntry(credsDir, entry))
		.join(":");
	const denyConfigPath = join(credsDir, "deny-gitconfig");
	const neutralGnupg = join(credsDir, "neutral-gnupg");
	// The same inheritance carries the rest of the neutral overlay: with the
	// deny GIT_CONFIG_GLOBAL the human identity is unreadable (every write is
	// refused), and the sentinel tokens/GNUPGHOME would leak into commit_as_me.
	// Drop each overlay key only when it holds the overlay's own value, so a
	// value the human set themselves survives; the grant socket never belongs.
	const overlay = neutralBaseEnv({ shimDir, denyConfigPath, gnupgHome: neutralGnupg, realPath: "", grantSock: "" });
	const pristineEnv: Record<string, string> = { ...snapshot, PATH: realPath };
	for (const [key, value] of Object.entries(overlay)) {
		if (key !== "PATH" && pristineEnv[key] === value) delete pristineEnv[key];
	}
	delete pristineEnv.GBI_GRANT_SOCK;
	// A pristine-env spawn for the extension's OWN reads (human identity, gpg
	// key setup), so they are never self-blocked by the neutral overlay.
	const pristineSpawn: SpawnFn = async (cmd, env) => {
		const proc = Bun.spawn(cmd, { env: { ...pristineEnv, ...env }, stdout: "pipe", stderr: "pipe", stdin: "ignore" });
		const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
		return { exitCode: await proc.exited, stdout, stderr };
	};
	const spawn = options.spawn ?? pristineSpawn;

	// Live config cache: grant requests re-stat config.json and reload only when
	// it changed, so /git-bot-setup, a rotated token, or a hand edit takes effect
	// on the next git/gh call without restarting omp. Warm it once here so
	// commit_as_me and the initial refusal state reflect the config at bind — and
	// so a broken identity setup warns distinctly at load. A broken identity must
	// NOT escape as a load error: the default export installs the neutral overlay
	// only after this returns, so throwing here would leave the process env
	// unguarded (fail-open). `identity === null` keeps every request refused.
	const configCache = createBotConfigCache(credsDir, spawn);
	const initialConfig = await configCache.refresh();
	if (initialConfig.identityWarning !== null) {
		console.warn(
			`[git-bot-identity] human identity unresolved — all git/gh writes stay blocked: ${initialConfig.identityWarning}`,
		);
	}

	// Scaffold the neutral environment (strip by default), unconditionally — the
	// eval kernel must be credential-neutral whether or not the bot is
	// configured. The guidance shim resolves the real git/gh via the pristine
	// PATH; the deny config strips any inherited credential helper.
	writeDenyConfig(denyConfigPath);
	mkdirSync(neutralGnupg, { recursive: true, mode: 0o700 });
	const realGit = Bun.which("git", { PATH: realPath }) ?? "git";
	const realGh = Bun.which("gh", { PATH: realPath }) ?? "gh";

	/**
	 * The server computes a request's env on demand — there are no tickets. This
	 * resolver reproduces what the removed tool_call hook used to build: `read`
	 * grants the bot's transport only (no signing, no hook); `write` resolves the
	 * signing key in precedence order (config.json signingKeyFile → signingKey →
	 * generated bot key) and grants full bot credentials, plus the real PATH so
	 * the shim's exec of the real git/gh resolves the real binaries and children.
	 *
	 * Every request refreshes the config cache first: config.json is re-statted
	 * and reloaded only when it changed, so an edited config or a rotated token
	 * is picked up on the next call. The resolved signing key id is cached per
	 * config version, so an unchanged config never re-runs gpg import or
	 * list-secret-keys.
	 */
	let signingCache: { stamp: ConfigStamp; keyId: string } | null = null;
	const resolver: GrantResolver = async mode => {
		const snapshot = await configCache.refresh();
		const config = snapshot.config;
		const identity = snapshot.identity;
		if (config === null || identity === null) {
			// Distinguish "never configured" (absent) from a config that exists but
			// is unusable: the latter must name the parse problem, never serve a
			// stale grant.
			const cause =
				snapshot.invalidReason !== null
					? `config.json is invalid: ${snapshot.invalidReason}`
					: snapshot.identityWarning !== null
						? `human co-author identity unresolved: ${snapshot.identityWarning}`
						: "bot credentials absent";
			return { ok: false, reason: blockGuidance(cause) };
		}
		const base: BotEnvConfig = {
			name: config.name,
			email: config.email,
			token: config.token,
			humanName: identity.name,
			humanNoreply: identity.email,
		};
		if (mode === "read") {
			return { ok: true, env: { ...buildBotEnv(base), PATH: realPath } };
		}
		// Write class: full bot credentials + signing for this call. The human
		// keyring is never consulted.
		const stamp = snapshot.stamp;
		let signingKey =
			stamp !== null && signingCache !== null && sameConfigStamp(signingCache.stamp, stamp)
				? signingCache.keyId
				: undefined;
		if (signingKey === undefined) {
			try {
				if (config.signingKeyFile !== undefined) {
					const { keyId } = await importBotKey(credsDir, config.signingKeyFile, spawn);
					signingKey = config.signingKey ?? keyId;
				} else if (config.signingKey !== undefined) {
					signingKey = config.signingKey;
				} else {
					const { keyId } = await ensureBotKey(credsDir, config.email, spawn);
					signingKey = keyId;
				}
			} catch (err) {
				return {
					ok: false,
					reason: blockGuidance(`signing key setup failed: ${err instanceof Error ? err.message : String(err)}`),
				};
			}
			if (stamp !== null) signingCache = { stamp, keyId: signingKey };
		}
		const envConfig: BotEnvConfig = { ...base, signingKey };
		installCoauthorHook(envConfig);
		return { ok: true, env: { ...buildBotEnv(envConfig), PATH: realPath } };
	};

	// One server per process per creds dir, shared across binds. This bind's
	// resolver becomes the live one.
	const grant = getGrantServer(credsDir, resolver);
	// Sweep per-process state left by dead pids (sockets and `shim-<pid>` dirs)
	// plus the legacy shared `shim/`, BEFORE installing this process's shim — a
	// crashed predecessor's dir must never be mistaken for ours.
	sweepStaleShimState(credsDir);
	try {
		installShim(credsDir, { git: realGit, gh: realGh, runtime: process.execPath });
	} catch (err) {
		// A resolved real git/gh inside the creds dir would make a wrapper exec
		// itself; refuse to install it. Warn and carry on — the neutral env still
		// strips credentials, so writes fail closed even without the guidance shim.
		console.warn(`[git-bot-identity] shim not installed: ${err instanceof Error ? err.message : String(err)}`);
	}
	// Remove this process's shim dir and grant socket on exit/SIGINT/SIGTERM.
	installShimCleanup({ shimDir, socketPath: grant.socketPath });
	const neutralEnv = neutralBaseEnv({ shimDir, denyConfigPath, gnupgHome: neutralGnupg, realPath, grantSock: grant.socketPath });

	return {
		neutralEnv,
		pristineSpawn,
		pristineEnv,
		getBot: async () => {
			const snapshot = await configCache.refresh();
			return snapshot.config === null ? null : { name: snapshot.config.name, email: snapshot.config.email };
		},
		resolveBotWriteEnv: async () => resolver("write"),
	};
}

export default async function (pi: ExtensionAPI) {
	const { neutralEnv, pristineSpawn, pristineEnv, getBot, resolveBotWriteEnv } = await createDefault();
	// Register the interactive setup wizard + on-launch prompt BEFORE the env is
	// neutralized: the wizard must run through the pristine (`pristineSpawn`)
	// spawn captured above so its gh/gpg subprocesses are never self-blocked.
	installSetup(pi, { credsDir: CONFIG_DIR, spawn: pristineSpawn });
	// Register the human-identity commit tool. It runs git with `pristineEnv`
	// (real PATH, human config/signing), so it is unaffected by the neutral
	// overlay installed below.
	installCommitAsMe(pi, { getBot, humanEnv: pristineEnv, resolveBotWriteEnv });
	// Strip by default: neutralize the omp process env so every child born after
	// this — the bash subprocess, the persistent eval kernel, subagent shells —
	// inherits stripped credentials. The shim re-requests creds from the grant
	// server for the invocations it classifies as writes. Done here (not in
	// createDefault) so unit tests stay free of global env mutation.
	Object.assign(process.env, neutralEnv);
	delete process.env.SSH_AUTH_SOCK;
}
