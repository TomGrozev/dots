---
name: to-tickets
description: Break a plan, spec, or the current conversation into a set of tracer-bullet tickets, each declaring its blocking edges, published to the configured tracker (edges as text in one file per ticket locally, or native blocking links on a real tracker).
disable-model-invocation: true
---

# To Tickets

Break a plan, spec, or conversation into a set of **tickets**: tracer-bullet vertical slices, each declaring the tickets that **block** it.

The issue tracker and triage label vocabulary should have been provided to you. If not, tell the user to run `/setup-matt-pocock-skills`.

## Process

### 1. Gather context

Work from whatever is already in the conversation context. If the user passes a reference (a spec path, an issue number or URL) as an argument, fetch it and read its full body and comments.

### 2. Explore the codebase (optional)

If you have not already explored the codebase, do so to understand the current state of the code. Ticket titles and descriptions should use the domain terms from the project's glossary (`GLOSSARY.md`), and respect ADRs in the area you're touching.

Look for opportunities to prefactor the code to make the implementation easier. "Make the change easy, then make the easy change."

### 3. Draft vertical slices

Break the work into **tracer bullet** tickets.

<vertical-slice-rules>

- Each slice cuts a narrow but COMPLETE path through every layer (schema, API, UI, tests): vertical, NOT a horizontal slice of one layer
- A completed slice is demoable or verifiable on its own
- Each slice is sized to fit in a single fresh context window
- Each slice is also sized for a human reviewer, about 300 changed non-test lines, so the user can review it in one sitting; wide-refactor migrate batches are exempt as mechanical.
- Any prefactoring should be done first

</vertical-slice-rules>

Give each ticket its **blocking edges**: the other tickets that must complete before it can start. A ticket with no blockers can start immediately. For each ticket, set its mode and `Human` entries by § Human tasks and mode.

**Wide refactors are the exception to vertical slicing.** A **wide refactor** is one mechanical change (rename a column, retype a shared symbol) whose **blast radius** fans across the whole codebase, so a single edit breaks thousands of call sites at once and no vertical slice can land green. Don't force it into a tracer bullet; sequence it as **expand–contract**. First expand: add the new form beside the old so nothing breaks. Then migrate the call sites over in batches sized by blast radius (per package, per directory), each batch its own ticket blocked by the expand, keeping CI green batch to batch because the old form still exists. Finally contract: delete the old form once no caller remains, in a ticket blocked by every migrate batch. When even the batches can't stay green alone, keep the sequence but let them share an integration branch that all block a final integrate-and-verify ticket; green is promised only there.

### 4. Quiz the user

Present the proposed breakdown as a numbered list. For each ticket, show:

- **Title**: short descriptive name
- **Blocked by**: which other tickets (if any) must complete first
- **What it delivers**: the end-to-end behaviour this ticket makes work
- **Mode**: hitl | afk (set by § Human tasks and mode)
- **Human**: each entry `**Human:** <trigger>: <question>`, or "None" (set by § Human tasks and mode)

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Are the blocking edges correct: does each ticket only depend on tickets that genuinely gate it?
- Should any tickets be merged or split further?

Show the hitl tickets as one compact table, so a tired user can scan the reasons without reading prose:

| Ticket | Trigger | The human answers |
|---|---|---|
| 03: Conversation pinning | `structure` | Is ConversationPin the right place, and should it be new? |

The quiz settles `decision` triggers when it can: ask the question, show the named options (A, B, ...), each option with one reasoning line (when and why a person would pick it, its main gain and its main cost, taken from the spec, the ADRs, and the code, never invented). Put the answer into the spec, and drop the trigger from the ticket. Iterate until the user approves the breakdown.

### 5. Publish the tickets to the configured tracker

Publish the approved tickets. **How** depends on the tracker `/setup-matt-pocock-skills` configured; the tickets are the same either way, only the shape of the blocking edges changes:

- **Local files** → write one file per ticket under `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` in dependency order (blockers first). Each file's "Blocked by" lists the numbers/titles it depends on. Use the per-ticket file template below: one ticket per file, never a single combined file.
- **A real issue tracker (GitHub, Linear, …)** → publish one issue per ticket in dependency order (blockers first) so each ticket's blocking edges can reference real identifiers. Use the platform's native blocking / sub-issue relationship where it has one; otherwise set each ticket's "Blocked by" to the blocking issues. Apply the triage label by mode unless instructed otherwise: `ready-for-human` for hitl, `ready-for-agent` for afk.

Work the **frontier**: any ticket whose blockers are all done. For a purely linear chain that means top to bottom.

Do NOT close or modify any parent issue.

<local-ticket-template>

# <NN>: <Ticket title>

**What to build:** the end-to-end behaviour this ticket makes work, from the user's perspective, not a layer-by-layer implementation list.

**Blocked by:** the numbers/titles of the tickets that gate this one, or "None (can start immediately)".

**Mode:** hitl | afk

**Human:** only for hitl, one line per trigger directly under `**Mode:**`:
`**Human:** <trigger>: <specific question for this ticket>`

**Status:** ready-for-human (hitl) | ready-for-agent (afk)

- [ ] Acceptance criterion 1
- [ ] Acceptance criterion 2

</local-ticket-template>

<issue-template>

## Parent

A reference to the parent issue on the tracker (if the source was an existing issue, otherwise omit this section).

## What to build

The end-to-end behaviour this ticket makes work, from the user's perspective, not layer-by-layer implementation.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Blocked by

- A reference to each blocking ticket, or "None (can start immediately)".

## Mode

hitl | afk

## Human

Only for hitl, one line per trigger directly under the Mode section:
`**Human:** <trigger>: <specific question for this ticket>`

</issue-template>

In either form, avoid specific file paths or code snippets: they go stale fast. Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it and note briefly that it came from a prototype. Trim to the decision-rich parts, not a working demo, just the important bits.

## Human tasks and mode

The agent writes the code and tests. The user makes the decisions, reviews, and tidies by hand.

**Decisions.** Slice against the spec's Implementation and Testing Decisions, settled with the user while grilling (`to-spec` § Implementation Decisions, § Testing Decisions), and ask none of your own. A slice that needs an architectural or testing choice the spec left open is a spec gap: raise it with the user and add the decision to the spec before slicing.

**Mode.** Set each ticket's mode explicitly; the user overrides either way in the quiz (step 4).

- **hitl** (human in the loop): a human stop happens only for a named trigger; label `ready-for-human`. Each trigger names the human stop and its question (§ Human triggers). A hitl ticket with no `**Human:**` line is invalid: add the line, or make the ticket afk.
- **afk** (away from keyboard): built start to finish without stopping; label `ready-for-agent`. It has no `**Human:**` line; that code gets the review at landing (`land` § Ask).

**Human triggers.** A ticket is hitl only when at least one of these five applies:

| Trigger | Applies when | The question the human answers | Stop |
|---|---|---|---|
| `structure` | Adds a new module, top-level directory, or new kind of thing (a shape later code will copy), or places code across a module boundary where no existing example shows how | "Is this the right place, and should it be new?" | shape review, before build |
| `surface` | Adds or changes load-bearing surface: stored data (schema, migration, persisted file format, event format that outlives a deploy) or an outside contract (public API, CLI flags/output, published export, webhook payload, interface outside code implements) | "Will this shape still be right in a year?" | shape review, before build |
| `decision` | A product or behaviour choice that the spec did not settle and the agent would otherwise guess | "Which option?" | settle in the `to-tickets` quiz if possible; if still open, shape review |
| `see-it-run` | UI, feel, or output the human must react to | "Does this look and feel right?" | after build, before land: show the running result |
| `one-way-door` | Deploy, migration on real data, sent messages, paid or other irreversible outside action | "Go or no go?" | immediately before the irreversible action |

Size, complexity, tests, bug fixes, and signature changes inside an existing module are not triggers: those tickets stay afk, and the PR review at landing catches a mistake there. When a match is uncertain, recommend afk and say so in the quiz.

Every shape review decision must have an answer naming one option letter before the build continues. An archived review with open decisions does not continue the build: the agent asks in chat for the missing answers. A plain "yes" with no option letter is never accepted as an answer.

The shape review contents live in `implement` (§ Shape review). The placement map drawing rules live in `implement/PLACEMENT-MAP.md`; this skill does not repeat them.

A `structure` ticket can be the first instance of a shape later tickets copy. Cut it into its own small hitl ticket, and make the afk tickets that copy it blocked by it, saying in "What to build" that they follow that ticket's shape. When an afk ticket must come before a hitl one, say so in the quiz, since it splits the spec run.

**Take the pen.** A build worker failing twice on the same problem hands the pen over (implement HITL.md § Take the pen).

A tidy is offered at landing, never planned in a ticket.
