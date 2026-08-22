// Designer-Enforce — route frontend/UI `task`-tool spawns to the `designer` agent.
//
// AGENTS.md says "Delegate to `designer` when the work touches UI/frontend —
// do not prototype or tweak frontend inline; hand it off with the surface and
// the constraint." In practice the model keeps picking (or defaulting to)
// `agent: "task"` for UI work anyway — prose alone doesn't stick (see
// delegate-enforce.ts for the identical failure mode with investigation
// tools). config.yml has no field for this: `task.agentModelOverrides` only
// steers *models* per agent, and `task.disabledAgents`/`spawns` gate *which*
// agents may run, not *which* agent a given spawn should use. There is no
// harness-level routing from task content to agent choice, so this closes
// the gap by mutating the `task` tool call in place before it executes: any
// batch item whose `agent` is omitted or "task" AND whose brief smells like
// frontend/UI work gets its `agent` rewritten to "designer".
//
// SAFE TO RUN IN EVERY SESSION (main + subagents), unlike a naive edit/write
// path guard. `tool_call` handlers fire across the whole shared extension
// runtime with no session/agent identity on the event (see
// ExtensionContext/ToolCallEventBase — no sessionId, no agent name), which is
// exactly why delegate-enforce.ts avoids a tool_call guard for edit/write: it
// can't tell "main session" from "scout subagent" and would cripple the
// subagent it can't distinguish itself from. This extension sidesteps that
// trap entirely: it only intercepts the *decision* of which specialist to
// spawn (the `task` tool call), never a specialist's own file writes. A
// `task`-agent subagent spawning a nested frontend task should be redirected
// to designer too — there is no "protect the subagent from itself" case to
// worry about here.
//
// Heuristic, not semantic: matches frontend file extensions and a curated
// set of unambiguous UI/design terms across the batch's shared `context` plus
// each item's `task`/`name`. False positives just mean designer (which has
// full write tools) picks up a task `task` could have handled equally well;
// false negatives leave today's status quo. Tune FRONTEND_SIGNALS if it
// over- or under-fires.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const FRONTEND_SIGNALS: RegExp[] = [
  // File types that are unambiguously frontend/UI.
  /\.tsx\b/i,
  /\.jsx\b/i,
  /\.vue\b/i,
  /\.svelte\b/i,
  /\.astro\b/i,
  /\.css\b/i,
  /\.scss\b/i,
  /\.sass\b/i,
  /\.less\b/i,
  // Unambiguous UI/design vocabulary.
  /\bfront-?end\b/i,
  /\bUI\/?UX\b/i,
  /\buser interface\b/i,
  /\bvisual design\b/i,
  /\bdesign system\b/i,
  /\bresponsive design\b/i,
  /\baccessibility\b/i,
  /\ba11y\b/i,
  /\btailwind\b/i,
  /\bstyled-components\b/i,
  /\bstorybook\b/i,
  /\bfigma\b/i,
  /\bstylesheet\b/i,
  /\blayout\b/i,
  /\bcolor palette\b/i,
  /\btypography\b/i,
];

/** Redirects a single batch item's agent to "designer" if warranted. Returns the item's label if changed, else undefined. */
function maybeRedirect(item: Record<string, unknown>, sharedContext: string): string | undefined {
  const agent = item.agent;
  if (agent !== undefined && agent !== "task") return undefined; // explicit non-default choice: leave it alone

  const brief = [sharedContext, item.task, item.name]
    .filter((v) => typeof v === "string")
    .join("\n");
  if (!FRONTEND_SIGNALS.some((re) => re.test(brief))) return undefined;

  item.agent = "designer";
  return typeof item.name === "string" ? item.name : "(unnamed)";
}

export default async function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    try {
      if (event.toolName !== "task") return undefined;

      const input = event.input as Record<string, unknown>;
      const sharedContext = typeof input.context === "string" ? input.context : "";
      const redirected: string[] = [];

      if (Array.isArray(input.tasks)) {
        for (const raw of input.tasks) {
          if (raw && typeof raw === "object") {
            const label = maybeRedirect(raw as Record<string, unknown>, sharedContext);
            if (label) redirected.push(label);
          }
        }
      } else {
        const label = maybeRedirect(input, sharedContext);
        if (label) redirected.push(label);
      }

      if (redirected.length > 0) {
        const msg = `[designer-enforce] routed to designer (frontend/UI brief): ${redirected.join(", ")}`;
        if (ctx.hasUI) {
          ctx.ui.notify(msg, "info");
        } else {
          console.warn(msg);
        }
      }
    } catch (err) {
      // Fail open: never block a spawn on an unexpected error here.
      console.warn("[designer-enforce] unexpected error in tool_call handler; passing through", err);
    }

    return undefined;
  });
}
