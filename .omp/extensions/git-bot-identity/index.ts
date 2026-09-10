/**
 * git-bot-identity — omp extension making agent git/gh writes act as a GitHub
 * App bot; the human stays a Co-authored-by trailer.
 *
 * ── Contract (issue #1, decisions settled) ──────────────────────────────────
 *  • Identity:  GitHub App installed on the personal account; commits authored
 *    by `<slug>[bot]`, PRs opened by the bot for the human to merge.
 *  • Enforcement: fail-closed. Write-class calls with missing/unmintable
 *    credentials are BLOCKED (tool_call result `block: true`); there is never
 *    a fallback to the human identity. Read-only calls pass through even with
 *    no credentials at all.
 *  • Attribution: every agent commit carries `Co-authored-by: <human>` via a
 *    bot-scoped prepare-commit-msg hook (see lib/env.ts).
 *  • Transport: bot-scoped GIT_CONFIG_GLOBAL with insteadOf SSH→HTTPS-with-
 *    token, so existing SSH remotes push over HTTPS with the installation
 *    token — the human's SSH/GPG setup is never consulted.
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
import { loadBotConfig, type BotConfig, CONFIG_DIR } from "./lib/config";
import { signAppJwt, mintInstallationToken, TokenCache } from "./lib/auth";
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
}

/** The human-facing block reason when credentials are absent or unmintable. */
function credentialBlockReason(detail: string): string {
	return [
		"git-bot-identity: write blocked — no fallback to your human identity.",
		`Cause: ${detail}`,
		"Fix: install GitHub App bot credentials under ~/.config/git-bot-identity/",
		"  (config.json with appId, installationId, botSlug, humanName, humanNoreply + app.pem, chmod 600),",
		"  or run this write from your interactive shell if it should act as you.",
	].join("\n");
}

export default async function (pi: ExtensionAPI) {
	await createDefault(pi, {});
}

/**
 * Extension factory with injection points for tests: `credsDir` redirects
 * config discovery, so no production path is touched from tests.
 */
/** Minimal structural surface of ExtensionAPI this extension needs. Kept
 * narrow so tests can pass a lightweight double without faking the full
 * ExtensionAPI. */
export interface BotIdentityHookApi {
	on(event: "tool_call", handler: (event: ToolCallEvent, ctx: unknown) => ToolCallEventResult | Promise<ToolCallEventResult | void> | void): void;
}

export async function createDefault(pi: BotIdentityHookApi, options: CreateOptions = {}): Promise<void> {
	const credsDir = options.credsDir ?? CONFIG_DIR;
	const config: BotConfig | null = loadBotConfig(credsDir);

	// Token cache lives at extension scope: one cache per omp process, re-mint
	// near expiry, one in-flight mint at a time. A mint failure inside get()
	// propagates → block. Nothing is cached and nothing falls back.
	let tokenCache: TokenCache | null = null;
	if (config) {
		tokenCache = new TokenCache(async () => {
			const jwt = signAppJwt(config.privateKeyPem, config.appId);
			return mintInstallationToken({ jwt, installationId: config.installationId });
		});
	}

	pi.on("tool_call", async event => {
		if (!isBashToolCallEvent(event)) return;
		const command = event.input.command;
		if (typeof command !== "string" || command.trim() === "") return;

		const cls = classifyCommand(command);
		if (cls === "none") return;

		if (cls === "read-only") return; // pass through with or without creds

		// Write class from here on: fail closed without credentials.
		if (!config || !tokenCache) {
			return {
				block: true,
				reason: credentialBlockReason("bot credentials absent"),
			};
		}
		let token: string;
		try {
			token = await tokenCache.get();
		} catch (err) {
			return {
				block: true,
				reason: credentialBlockReason(`installation token mint failed: ${err instanceof Error ? err.message : String(err)}`),
			};
		}

		// Env overlay for this call only. installCoauthorHook rewrites the
		// prepare-commit-msg hook each time (cheap, keeps trailer text live).
		// BotEnvConfig is a subshape of BotConfig plus the fresh token.
		const envConfig: BotEnvConfig = {
			botSlug: config.botSlug,
			humanName: config.humanName,
			humanNoreply: config.humanNoreply,
			token,
		};
		const botEnv = buildBotEnv(envConfig);
		installCoauthorHook(envConfig);
		event.input.env = { ...(event.input.env ?? {}), ...botEnv };
		return undefined;
	});
}
