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
 *  the latest bind's resolver answers its requests. The extension's own git/gh
 *  reads (human identity lookup, gpg key setup) run through a pristine-env
 *  spawn, so they are never self-blocked. A bind whose identity resolution
 *  throws still returns the overlay and leaves every request refused (distinct
 *  warning) — it never escapes as a load error, which would leave the process
 *  env unguarded.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { loadBotConfig, resolveHumanIdentity, type BotConfig, type SpawnFn, CONFIG_DIR } from "./lib/config";
import { ensureBotKey, importBotKey } from "./lib/gpg";
import { buildBotEnv, installCoauthorHook, type BotEnvConfig } from "./lib/env";
import { neutralBaseEnv, writeDenyConfig } from "./lib/neutralize";
import { installShim } from "./lib/shim";
import { getGrantServer, type GrantResolver } from "./lib/grant-server";
import { blockGuidance } from "./lib/guidance";
import { installSetup } from "./lib/setup";

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
	const pristineEnv = pristineEnvSnapshot();
	// The real PATH, captured before any neutralization — used both to resolve
	// the real git/gh for the shim and to restore transport on granted calls.
	const realPath = pristineEnv.PATH ?? "";
	// A pristine-env spawn for the extension's OWN reads (human identity, gpg
	// key setup), so they are never self-blocked by the neutral overlay.
	const pristineSpawn: SpawnFn = async (cmd, env) => {
		const proc = Bun.spawn(cmd, { env: { ...pristineEnv, ...env }, stdout: "pipe", stderr: "pipe", stdin: "ignore" });
		const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
		return { exitCode: await proc.exited, stdout, stderr };
	};
	const spawn = options.spawn ?? pristineSpawn;

	const config: BotConfig | null = await loadBotConfig(credsDir, spawn);

	// Resolve the human's co-author identity (config value → git config) once
	// at load. A broken identity setup must NOT escape as a load error: the
	// default export installs the neutral overlay only after this returns, so
	// throwing here would leave the process env unguarded (fail-open). Instead,
	// leave `identity` null — which keeps every request refused below — and warn
	// distinctly on stderr.
	let identity: { name: string; email: string } | null = null;
	if (config) {
		try {
			identity = await resolveHumanIdentity(config, spawn);
		} catch (err) {
			console.warn(
				`[git-bot-identity] human identity unresolved — all git/gh writes stay blocked: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	// Scaffold the neutral environment (strip by default), unconditionally — the
	// eval kernel must be credential-neutral whether or not the bot is
	// configured. The guidance shim resolves the real git/gh via the pristine
	// PATH; the deny config strips any inherited credential helper.
	const denyConfigPath = join(credsDir, "deny-gitconfig");
	const neutralGnupg = join(credsDir, "neutral-gnupg");
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
	 */
	const resolver: GrantResolver = async mode => {
		if (!config || !identity) return { ok: false, reason: blockGuidance("bot credentials absent") };
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
		let signingKey: string;
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
		const envConfig: BotEnvConfig = { ...base, signingKey };
		installCoauthorHook(envConfig);
		return { ok: true, env: { ...buildBotEnv(envConfig), PATH: realPath } };
	};

	// One server per process per creds dir, shared across binds. This bind's
	// resolver becomes the live one.
	const grant = getGrantServer(credsDir, resolver);
	const { shimDir } = installShim(credsDir, { git: realGit, gh: realGh, runtime: process.execPath });
	const neutralEnv = neutralBaseEnv({ shimDir, denyConfigPath, gnupgHome: neutralGnupg, realPath, grantSock: grant.socketPath });

	return { neutralEnv, pristineSpawn };
}

export default async function (pi: ExtensionAPI) {
	const { neutralEnv, pristineSpawn } = await createDefault();
	// Register the interactive setup wizard + on-launch prompt BEFORE the env is
	// neutralized: the wizard must run through the pristine (`pristineSpawn`)
	// spawn captured above so its gh/gpg subprocesses are never self-blocked.
	installSetup(pi, { credsDir: CONFIG_DIR, spawn: pristineSpawn });
	// Strip by default: neutralize the omp process env so every child born after
	// this — the bash subprocess, the persistent eval kernel, subagent shells —
	// inherits stripped credentials. The shim re-requests creds from the grant
	// server for the invocations it classifies as writes. Done here (not in
	// createDefault) so unit tests stay free of global env mutation.
	Object.assign(process.env, neutralEnv);
	delete process.env.SSH_AUTH_SOCK;
}
