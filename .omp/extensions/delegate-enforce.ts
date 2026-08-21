// Delegate-Enforce — force the main agent to delegate investigation to subagents.
//
// The main agent has full read/grep/glob/web_search tools and a `task` tool to
// spawn specialists (scout for codebase research, librarian for external docs).
// Despite AGENTS.md prose telling it to delegate, it reflexively greps/searches
// itself (tool-affordance bias). This extension removes the investigation tools
// from the MAIN session so "I need to find out X" can only be satisfied by
// calling `task` and handing X to scout/librarian.
//
// SUBAGENTS ARE NOT AFFECTED: `setActiveTools` is session-scoped — it mutates
// only this AgentSession's tool set. Each subagent run is its own session whose
// tools are resolved from its own agent definition (e.g. scout -> read, grep,
// glob, web_search). Verify after installing: spawn a scout and confirm it can
// still grep.
//
// `read` is kept on purpose: it is dual-use (investigate AND verify/apply
// edits), and without grep/glob search the main agent can no longer discover
// files to read in unfamiliar territory — reading one known file stays possible,
// "go dig through the repo" does not.
//
// NOTE: we deliberately rely on tool-set removal ONLY (no `tool_call` deny
// guard). A guard could fire on subagent sessions if they share the extension
// runtime, which would cripple scout/librarian. Removal is session-scoped and
// therefore safe.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Investigation-only tools: the main agent must route these through subagents.
const INVESTIGATION_TOOLS = [
  "grep",
  "glob",
  "web_search",
  "gh_grep",
  "context7",
];

/** Session tool set with the investigation tools removed; all else preserved. */
function withoutInvestigationTools(active: string[]): string[] {
  const seen = new Set<string>();
  return active.filter((name) => {
    if (INVESTIGATION_TOOLS.includes(name)) return false;
    if (seen.has(name)) return false;
    seen.add(name);
    return true;
  });
}

export default async function (pi: ExtensionAPI) {
  // Re-apply on every session start (startup, resume, new, fork, reload) so the
  // strip survives any tool-registry rebuilds that follow a session transition.
  pi.on("session_start", () => {
    pi.setActiveTools(withoutInvestigationTools(pi.getActiveTools()));
  });
}
