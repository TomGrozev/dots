/**
 * git-bot-identity — omp extension making agent git/gh writes act as a GitHub
 * dedicated GitHub account (e.g. `myproject-agent`); the human stays a
 * Co-authored-by trailer.
 *
 * ── Contract (issue #1, decisions settled) ──────────────────────────────────
 *  • Identity:  a dedicated, real GitHub user account owns the commits; the
 *    agent account's own GPG key makes them Verified. Commits are authored by
 *    the account's configured name/email.
 *  • Enforcement: fail-closed. Write-class calls with missing/unmintable
 *    credentials are BLOCKED (tool_call result `block: true`); there is never
 *    a fallback to the human identity. Read-only calls pass through even with
 *    no credentials at all.
 *  • Attribution: every agent commit carries `Co-authored-by: <human>` via a
 *    bot-scoped prepare-commit-msg hook (see lib/env.ts).
 *  • Transport: bot-scoped GIT_CONFIG_GLOBAL with insteadOf SSH→HTTPS-with-
 *    token, so existing SSH remotes push over HTTPS with the agent account's
 *    PAT — the human's SSH setup is never consulted.
	 *  • Signing: bot commits are GPG-signed with the bot's own passphrase-less
	 *    key (see lib/gpg.ts + lib/env.ts); a failed signature fails the write
	 *    rather than falling back to an unsigned commit or the human key.
 *  • Isolation: whatever env we inject lives only on THIS tool call's env
 *    overlay; the human's interactive shell is untouched.
 *  • Subagents: extension files are loaded per-session by omp (the root
 *    session's extension set is inherited by nested sessions), so subagent
 *    git writes go through the same hook. GATING=child-safe: the handler has
 *    no session-identity checks by design.
 *
 * ── Seam ────────────────────────────────────────────────────────────────────
 *  `pi.on("tool_call")` guarded to bash; mutates `event.input.env` BEFORE the
 *  approval gate runs, so the approval preview reflects the call actually
 *  executed. Mirrors rtk.ts's mutation precedent; blocking via the same
 *  handler's return value.
 */
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { ToolCallEvent, BashToolCallEvent, ToolCallEventResult } from "@oh-my-pi/pi-coding-agent";
import { classifyCommand } from "./lib/classify";
import { loadBotConfig, resolveHumanIdentity, type BotConfig, type SpawnFn, CONFIG_DIR } from "./lib/config";
import { ensureBotKey, importBotKey } from "./lib/gpg";
import { buildBotEnv, installCoauthorHook, type BotEnvConfig } from "./lib/env";

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

/** The human-facing block reason when credentials are absent. */
function credentialBlockReason(detail: string): string {
	return [
		"git-bot-identity: write blocked — no fallback to your human identity.",
		`Cause: ${detail}`,
		"Fix: configure the agent GitHub account:",
		"  ~/.config/git-bot-identity/config.json with name, email, and token",
		"  (a PAT with contents:write). Read-only calls pass through.",
		"  or run this write from your interactive shell if it should act as you.",
	].join("\n");
}

export default async function (pi: ExtensionAPI) {
	await createDefault(pi, {});
}

/**
 * Extension factory with injection points for tests: `credsDir` redirects
 * config discovery, so no production path is touched from tests.
 * `spawn` overrides the git-config reader (Bun.spawn by default) so tests
 * never shell out.
 */
/** Minimal structural surface of ExtensionAPI this extension needs. Kept
 * narrow so tests can pass a lightweight double without faking the full
 * ExtensionAPI. */
export interface BotIdentityHookApi {
	on(event: "tool_call", handler: (event: ToolCallEvent, ctx: unknown) => ToolCallEventResult | Promise<ToolCallEventResult | void> | void): void;
}

export async function createDefault(pi: BotIdentityHookApi, options: CreateOptions = {}): Promise<void> {
	const credsDir = options.credsDir ?? CONFIG_DIR;
	const config: BotConfig | null = await loadBotConfig(credsDir, options.spawn);

	// Resolve the human's co-author identity (config value → git config) once
	// at load. It can throw when nothing provides a name AND email — a broken
	// identity setup surfaces as an extension load error, which is acceptable
	// fail-closed behavior. loadBotConfig's null (absent creds) still blocks
	// writes below without falling back.
	let identity: { name: string; email: string } | null = null;
	if (config) {
		identity = await resolveHumanIdentity(config);
	}

	pi.on("tool_call", async event => {
		if (!isBashToolCallEvent(event)) return;
		const command = event.input.command;
		if (typeof command !== "string" || command.trim() === "") return;

		const cls = classifyCommand(command);
		if (cls === "none") return;

		if (cls === "read-only") return; // pass through with or without creds

		// Write class from here on: fail closed without credentials.
		if (!config || !identity) {
			return {
				block: true,
				reason: credentialBlockReason("bot credentials absent"),
			};
		}
		const token = config.token;

		// Resolve the bot's signing key, in precedence order. The human keyring
		// is never consulted.
		//   1. `signingKeyFile` — import one mounted secret key into the bot
		//      keyring (multi-host: same key everywhere, one pubkey on GitHub).
		//   2. `signingKey` — an id already present in the bot keyring.
		//   3. neither — generate the bot's own key on first use (single-host).
		let signingKey: string;
		try {
			if (config.signingKeyFile !== undefined) {
				const { keyId } = await importBotKey(credsDir, config.signingKeyFile, options.spawn);
				signingKey = config.signingKey ?? keyId;
			} else if (config.signingKey !== undefined) {
				signingKey = config.signingKey;
			} else {
				const { keyId } = await ensureBotKey(credsDir, config.email, options.spawn);
				signingKey = keyId;
			}
		} catch (err) {
			return {
				block: true,
				reason: credentialBlockReason(`signing key setup failed: ${err instanceof Error ? err.message : String(err)}`),
			};
		}

		// Env overlay for this call only. installCoauthorHook rewrites the
		// prepare-commit-msg hook each time (cheap, keeps trailer text live).
		// BotEnvConfig is a subshape of BotConfig.
		const envConfig: BotEnvConfig = {
			name: config.name,
			email: config.email,
			token,
			humanName: identity.name,
			humanNoreply: identity.email,
			signingKey,
		};
		const botEnv = buildBotEnv(envConfig);
		installCoauthorHook(envConfig);
		event.input.env = { ...(event.input.env ?? {}), ...botEnv };
		return undefined;
	});
}
