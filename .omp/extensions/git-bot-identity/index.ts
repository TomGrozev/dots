/**
 * git-bot-identity — omp extension making agent git/gh writes act as a
 * dedicated GitHub account (e.g. `myproject-agent`); the human stays a
 * Co-authored-by trailer.
 *
 * ── Model: block by default, grant on classified write ──────────────────────
 * Security comes from REMOVING credentials, not from classifying commands —
 * which is the only thing that can cover the eval kernel, subagent shells, and
 * absolute-path invocations that a bash-command classifier never sees.
 *
 *  * Block by default (init): at load, the omp process environment is
 *    neutralized so every child born afterwards — the bash tool's subprocess,
 *    the persistent eval kernel, task-subagent shells — inherits stripped
 *    GitHub credentials: SSH agent removed, gh token overridden with an invalid
 *    sentinel (which defeats the macOS keyring), git SSH/transport/prompt
 *    disabled, GIT_CONFIG_GLOBAL redirected to a credential-less deny config,
 *    GNUPGHOME pointed at a neutral home, and PATH prefixed with a guidance
 *    shim dir. Public reads still work; every write and private read fails
 *    closed. (Empirically verified.)
 *  * Grant on write (bash tool_call hook): when — and only when — a command
 *    classifies write-class AND a valid config.json exists, the hook hands the
 *    agent account's credentials to THAT ONE call. It cannot use
 *    `event.input.env` (this omp version only forwards `env` in service mode),
 *    so it stores the per-call env in the in-process grant server (lib/
 *    grant-server.ts) under a random ticket and rewrites the command in place
 *    to `export GBI_TICKET=<t>; <command>`; the git/gh shim redeems the ticket
 *    over a 0600 unix socket whose path every shell inherits as `GBI_GRANT_SOCK`
 *    and execs the real git/gh with the granted env (incl. the real PATH) —
 *    credentials never touch disk. The ticket is revoked on the matching
 *    `tool_result` (TTL as backstop). Reads, when configured, are granted the
 *    same way (transport only, no signing). No config → the write is blocked
 *    with a guidance message; there is never a fallback to the human identity.
 *  * Guidance: a POSIX-sh git/gh shim on the neutralized PATH prints an explicit
 *    "blocked — use the bash tool, or stop" message when the eval kernel (which
 *    cannot be hooked) or a subshell attempts a write. The shim is UX only;
 *    the stripped environment is the boundary.
 *  * Attribution: every granted commit carries `Co-authored-by: <human>` via a
 *    bot-scoped prepare-commit-msg hook (see lib/env.ts).
 *  * Signing: granted commits are GPG-signed with the bot's own passphrase-less
 *    key (see lib/gpg.ts + lib/env.ts); a failed key setup blocks the write.
 *
 * Not hermetic: code that fetches a secret by other means (the keychain via a
 * different tool, a hardcoded token, a raw HTTPS call to the API) is beyond any
 * in-extension boundary. The neutralization closes every credential-REUSE
 * vector; a code-fetches-its-own-secret vector needs launch-level isolation.
 *
 * ── Seam ────────────────────────────────────────────────────────────────────
 *  Init mutates `process.env` once (block by default), and the pristine
 *  pre-neutralization env is snapshotted ONCE PER PROCESS (keyed by a
 *  `Symbol.for` registry entry, so it survives the module being re-evaluated on
 *  a later bind). Every bind therefore resolves the human identity and the real
 *  PATH from that pristine snapshot, never from an already-overlaid env. The
 *  `pi.on("tool_call")` handler, guarded to bash, mutates `event.input.command`
 *  in place BEFORE the approval gate runs (so the preview reflects what
 *  executes, and sibling handlers that rewrite the command in place are not
 *  clobbered); blocking is via the same handler's return value. Credential
 *  handoff is in-memory: the handler stores the call's env in the grant server
 *  and prefixes the command with a ticket; the `tool_result` handler revokes
 *  that ticket. The grant server and its ticket map are shared per process per
 *  creds dir through the same `Symbol.for` registry pattern, so re-binds reuse
 *  one socket. The extension's own git/gh reads (human identity lookup, gpg key
 *  setup) run through a pristine-env spawn, so they are never self-blocked. A
 *  bind whose identity resolution throws still returns the overlay + guard hook
 *  (writes blocked, distinct warning) — it never escapes as a load error, which
 *  would leave the process env unguarded.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { ToolCallEvent, BashToolCallEvent, ToolCallEventResult, ToolResultEvent } from "@oh-my-pi/pi-coding-agent";
import { classifyCommand } from "./lib/classify";
import { loadBotConfig, resolveHumanIdentity, type BotConfig, type SpawnFn, CONFIG_DIR } from "./lib/config";
import { ensureBotKey, importBotKey } from "./lib/gpg";
import { buildBotEnv, installCoauthorHook, type BotEnvConfig } from "./lib/env";
import { neutralBaseEnv, writeDenyConfig } from "./lib/neutralize";
import { installShim } from "./lib/shim";
import { GRANT_SOCK_ENV, TICKET_ENV, getGrantServer } from "./lib/grant-server";
import { blockGuidance } from "./lib/guidance";
import { installSetup } from "./lib/setup";

/**
 * Local equivalent of the SDK's `isToolCallEventType("bash", event)` guard.
 * Inlined because the SDK's distributed barrel marks that binding type-only
 * under tsc's verbatimModuleSyntax (TS1485), while the runtime export is a
 * real function. Same narrowing: bash calls are the only members whose
 * `toolName` is the literal "bash"; custom tools carry `string`.
 */
function isBashToolCallEvent(event: ToolCallEvent): event is BashToolCallEvent {
	return event.toolName === "bash";
}

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
 * Returns the neutral env overlay to apply to the omp process (block by
 * default). `createDefault` deliberately does NOT mutate `process.env` itself —
 * the production default export does, keeping unit tests free of global env
 * mutation.
 */
export async function createDefault(pi: BotIdentityHookApi, options: CreateOptions = {}): Promise<BotIdentityBind> {
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
	// default export installs the neutral overlay and guard hook only after
	// this returns, so throwing here would leave the process env unguarded
	// (fail-open). Instead, leave `identity` null — which keeps every write
	// blocked below — and warn distinctly on stderr.
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

	// Scaffold the neutral environment (block by default), unconditionally — the
	// eval kernel must be credential-neutral whether or not the bot is
	// configured. The guidance shim resolves the real git/gh via the pristine
	// PATH; the deny config strips any inherited credential helper.
	const denyConfigPath = join(credsDir, "deny-gitconfig");
	const neutralGnupg = join(credsDir, "neutral-gnupg");
	writeDenyConfig(denyConfigPath);
	mkdirSync(neutralGnupg, { recursive: true, mode: 0o700 });
	const realGit = Bun.which("git", { PATH: realPath }) ?? "git";
	const realGh = Bun.which("gh", { PATH: realPath }) ?? "gh";
	// In-process credential handoff. `event.input.env` never reaches the bash
	// subprocess on this omp version, so the hook stores the per-call env here
	// under a ticket and prefixes the command with `export GBI_TICKET=<t>;`; the
	// shim redeems it over this socket (see lib/grant-server.ts + lib/shim.ts).
	// One server per process per creds dir, shared across binds.
	const grant = getGrantServer(credsDir);
	const { shimDir } = installShim(credsDir, { git: realGit, gh: realGh, runtime: process.execPath });
	const neutralEnv = neutralBaseEnv({ shimDir, denyConfigPath, gnupgHome: neutralGnupg, realPath, grantSock: grant.socketPath });

	// toolCallId → live ticket, so the matching tool_result revokes the grant the
	// moment the call finishes. Expiry is the server's job (flat one-hour cap).
	const openTickets = new Map<string, string>();

	/** Hand `env` to the call's shell under a fresh ticket: prefix the command
	 * (mutating in place — sibling handlers rewrite `event.input.command` too)
	 * and remember the ticket for revocation on `tool_result`. */
	function handOffTicket(event: BashToolCallEvent, env: Record<string, string>): void {
		const ticket = grant.grant({ ...env, PATH: realPath });
		event.input.command = `export ${TICKET_ENV}=${ticket}; ${event.input.command}`;
		openTickets.set(event.toolCallId, ticket);
	}

	pi.on("tool_call", async event => {
		if (!isBashToolCallEvent(event)) return;
		const command = event.input.command;
		if (typeof command !== "string" || command.trim() === "") return;

		const cls = classifyCommand(command);
		if (cls === "none") return; // non-git/gh: runs with the neutralized base env

		// Unconfigured: reads run credential-neutral (public reads work); writes
		// fail closed. Never a fallback to the human identity.
		if (!config || !identity) {
			if (cls === "read-only") return;
			return { block: true, reason: blockGuidance("bot credentials absent") };
		}

		// Read-only + configured: grant the bot's transport (run as the agent
		// account) with a real PATH so the real git/gh runs. No signing, no hook.
		if (cls === "read-only") {
			const readEnv = buildBotEnv({
				name: config.name,
				email: config.email,
				token: config.token,
				humanName: identity.name,
				humanNoreply: identity.email,
			});
			handOffTicket(event, readEnv);
			return undefined;
		}

		// Write class: grant full bot credentials + signing for this one call.
		// Resolve the signing key in precedence order (config.json signingKeyFile
		// → signingKey → generated bot key); the human keyring is never consulted.
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
				block: true,
				reason: blockGuidance(`signing key setup failed: ${err instanceof Error ? err.message : String(err)}`),
			};
		}

		const envConfig: BotEnvConfig = {
			name: config.name,
			email: config.email,
			token: config.token,
			humanName: identity.name,
			humanNoreply: identity.email,
			signingKey,
		};
		const botEnv = buildBotEnv(envConfig);
		installCoauthorHook(envConfig);
		handOffTicket(event, botEnv);
		return undefined;
	});

	// Revoke the call's grant as soon as it finishes. If the call never reaches
	// tool_result (denied approval, abort), the server's one-hour expiry reclaims it.
	pi.on("tool_result", event => {
		const ticket = openTickets.get(event.toolCallId);
		if (ticket === undefined) return;
		openTickets.delete(event.toolCallId);
		grant.revoke(ticket);
	});

	return { neutralEnv, pristineSpawn };
}

/**
 * Minimal structural surface of ExtensionAPI this extension needs. Kept narrow
 * so tests can pass a lightweight double without faking the full ExtensionAPI.
 */
export interface BotIdentityHookApi {
	on(event: "tool_call", handler: (event: ToolCallEvent, ctx: unknown) => ToolCallEventResult | Promise<ToolCallEventResult | void> | void): void;
	on(event: "tool_result", handler: (event: ToolResultEvent, ctx: unknown) => void): void;
}

export default async function (pi: ExtensionAPI) {
	const { neutralEnv, pristineSpawn } = await createDefault(pi, {});
	// Register the interactive setup wizard + on-launch prompt BEFORE the env is
	// neutralized: the wizard must run through the pristine (`pristineSpawn`)
	// spawn captured above so its gh/gpg subprocesses are never self-blocked.
	installSetup(pi, { credsDir: CONFIG_DIR, spawn: pristineSpawn });
	// Block by default: neutralize the omp process env so every child born after
	// this — the bash subprocess, the persistent eval kernel, subagent shells —
	// inherits stripped credentials. The tool_call hook re-grants creds per
	// classified write only. Done here (not in createDefault) so unit tests stay
	// free of global env mutation.
	Object.assign(process.env, neutralEnv);
	delete process.env.SSH_AUTH_SOCK;
}
