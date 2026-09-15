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
 *    classifies write-class AND a valid config.json exists, the hook overlays
 *    the agent account's credentials onto THAT ONE call, with a real PATH so
 *    the real git/gh (not the shim) runs. Reads, when configured, run as the
 *    agent account too (no signing). No config → the write is blocked with a
 *    guidance message; there is never a fallback to the human identity.
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
 *  Init mutates `process.env` once (block by default). The `pi.on("tool_call")`
 *  handler, guarded to bash, mutates `event.input.env` BEFORE the approval gate
 *  runs, so the preview reflects the call actually executed; blocking is via the
 *  same handler's return value. The extension's own git/gh reads (human identity
 *  lookup, gpg key setup) run through a pristine-env spawn captured before
 *  neutralization, so they are never self-blocked.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { ToolCallEvent, BashToolCallEvent, ToolCallEventResult } from "@oh-my-pi/pi-coding-agent";
import { classifyCommand } from "./lib/classify";
import { loadBotConfig, resolveHumanIdentity, type BotConfig, type SpawnFn, CONFIG_DIR } from "./lib/config";
import { ensureBotKey, importBotKey } from "./lib/gpg";
import { buildBotEnv, installCoauthorHook, type BotEnvConfig } from "./lib/env";
import { neutralBaseEnv, writeDenyConfig } from "./lib/neutralize";
import { installShim } from "./lib/shim";
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
export async function createDefault(pi: BotIdentityHookApi, options: CreateOptions = {}): Promise<{ neutralEnv: Record<string, string>; pristineSpawn: SpawnFn }> {
	const credsDir = options.credsDir ?? CONFIG_DIR;
	// The real PATH, captured before any neutralization — used both to resolve
	// the real git/gh for the shim and to restore transport on granted calls.
	const realPath = process.env.PATH ?? "";
	// A pristine-env spawn for the extension's OWN reads (human identity, gpg
	// key setup). Snapshotting here — before the default export neutralizes
	// process.env — keeps identity resolution reading the real git config.
	const pristineEnv = { ...process.env };
	const pristineSpawn: SpawnFn = async (cmd, env) => {
		const proc = Bun.spawn(cmd, { env: { ...pristineEnv, ...env }, stdout: "pipe", stderr: "pipe", stdin: "ignore" });
		const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
		return { exitCode: await proc.exited, stdout, stderr };
	};
	const spawn = options.spawn ?? pristineSpawn;

	const config: BotConfig | null = await loadBotConfig(credsDir, spawn);

	// Resolve the human's co-author identity (config value → git config) once
	// at load. It can throw when nothing provides a name AND email — a broken
	// identity setup surfaces as an extension load error (acceptable fail-closed
	// behavior). loadBotConfig's null (absent creds) still blocks writes below.
	let identity: { name: string; email: string } | null = null;
	if (config) {
		identity = await resolveHumanIdentity(config, spawn);
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
	const { shimDir } = installShim(credsDir, { git: realGit, gh: realGh });
	const neutralEnv = neutralBaseEnv({ shimDir, denyConfigPath, gnupgHome: neutralGnupg, realPath });

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
			event.input.env = { ...(event.input.env ?? {}), ...readEnv, PATH: realPath };
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
		// PATH restored so the real git/gh runs (not the guidance shim).
		event.input.env = { ...(event.input.env ?? {}), ...botEnv, PATH: realPath };
		return undefined;
	});

	return { neutralEnv, pristineSpawn };
}

/**
 * Minimal structural surface of ExtensionAPI this extension needs. Kept narrow
 * so tests can pass a lightweight double without faking the full ExtensionAPI.
 */
export interface BotIdentityHookApi {
	on(event: "tool_call", handler: (event: ToolCallEvent, ctx: unknown) => ToolCallEventResult | Promise<ToolCallEventResult | void> | void): void;
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
