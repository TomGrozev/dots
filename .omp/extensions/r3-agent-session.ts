// r3-agent-session: give every bash tool call a stable r3 agent identity.
//
// r3 rejects write commands (`create`, `publish`, `thread add`, `comment`)
// from an agent unless `R3_AGENT_SESSION` is set. Its `--human` flag must never
// be used by an agent. omp exports no such variable, so this extension derives
// one from the session ID and writes it into the omp process environment.
// Every bash child inherits it, the same seam the git-bot-identity extension
// uses for its environment.
//
// The value is `omp:<session id>`, stable for that session's whole life and
// distinct per top-level session. omp keeps one process across `/new`,
// `/resume`, fork and branch, and extensions stay bound, so a plain "already
// set" guard would pin the first session's ID forever. Instead the extension
// remembers the value it wrote (a process-global symbol, because the module may
// be re-imported) and replaces only that value on the next top-level session.
// Any other existing value is a user pin and wins.
//
// `session_start` covers process launch; `session_switch` and `session_branch`
// cover `/new`, `/resume`, fork and branch, which do not emit `session_start`
// (verified with an RPC `new_session`).
//
// Subagents (`ctx.agent.kind === "sub"`) never overwrite the value, so their
// bash calls share the main session's identity and their r3 comments belong to
// the same ticket. A subagent process with no main session still gets its own
// ID rather than none.
//
// The agent pod cannot reach r3, so the variable is inert there.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent"

const SET_VALUE_KEY = Symbol.for("omp.r3-agent-session.value")

function rememberedValue(): string | undefined {
	const value: unknown = Reflect.get(globalThis, SET_VALUE_KEY)
	return typeof value === "string" ? value : undefined
}

function rememberValue(value: string): void {
	Reflect.set(globalThis, SET_VALUE_KEY, value)
}

function syncIdentity(ctx: ExtensionContext): void {
	const sessionId = ctx.sessionManager.getSessionId()
	if (!sessionId) return

	const next = `omp:${sessionId}`
	const current = process.env.R3_AGENT_SESSION

	if (ctx.agent.kind !== "main") {
		// Keep the main session's value; only a standalone child needs one.
		if (!current) process.env.R3_AGENT_SESSION = next
		return
	}

	// A non-empty value this extension did not write is the user's pin.
	if (current && current !== rememberedValue()) return

	process.env.R3_AGENT_SESSION = next
	rememberValue(next)
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => syncIdentity(ctx))
	pi.on("session_switch", (_event, ctx) => syncIdentity(ctx))
	pi.on("session_branch", (_event, ctx) => syncIdentity(ctx))
}
