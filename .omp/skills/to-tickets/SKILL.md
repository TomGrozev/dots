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

Give each ticket its **blocking edges**: the other tickets that must complete before it can start. A ticket with no blockers can start immediately. For each ticket, set its `## Review gates` table by § Review gates.

**Wide refactors are the exception to vertical slicing.** A **wide refactor** is one mechanical change (rename a column, retype a shared symbol) whose **blast radius** fans across the whole codebase, so a single edit breaks thousands of call sites at once and no vertical slice can land green. Don't force it into a tracer bullet; sequence it as **expand–contract**. First expand: add the new form beside the old so nothing breaks. Then migrate the call sites over in batches sized by blast radius (per package, per directory), each batch its own ticket blocked by the expand, keeping CI green batch to batch because the old form still exists. Finally contract: delete the old form once no caller remains, in a ticket blocked by every migrate batch. When even the batches can't stay green alone, keep the sequence but let them share an integration branch that all block a final integrate-and-verify ticket; green is promised only there.

### 4. Quiz the user

Present the proposed breakdown as a numbered list. For each ticket, show:

- **Title**: short descriptive name
- **Blocked by**: which other tickets (if any) must complete first
- **What it delivers**: the end-to-end behaviour this ticket makes work

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Are the blocking edges correct: does each ticket only depend on tickets that genuinely block it?
- Should any tickets be merged or split further?

Show the hitl tickets as one compact table, so a tired user can scan each gate and its reason without reading prose:

| Ticket | When | What | Why |
|---|---|---|---|

Iterate until the user approves the breakdown.

### 5. Publish the tickets to the configured tracker

Publish the approved tickets. **How** depends on the tracker `/setup-matt-pocock-skills` configured; the tickets are the same either way, only the shape of the blocking edges changes:

- **Local files** → write one file per ticket under `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` in dependency order (blockers first). Each file's "Blocked by" lists the numbers/titles it depends on. Use the per-ticket file template below: one ticket per file, never a single combined file.
- **A real issue tracker (GitHub, Linear, …)** → publish one issue per ticket in dependency order (blockers first) so each ticket's blocking edges can reference real identifiers. Use the platform's native blocking / sub-issue relationship where it has one; otherwise set each ticket's "Blocked by" to the blocking issues. Create the triage labels on the tracker first if they do not exist. Apply the triage label by mode unless instructed otherwise: `ready-for-human` for hitl, `ready-for-agent` for afk.

Work the **frontier**: any ticket whose blockers are all done. For a purely linear chain that means top to bottom.

Do not close the spec. One edit to it is allowed: removing `ready-for-agent` from it when the tickets are published, so no agent picks up the spec itself (`to-spec` labels the spec and is read-only there).

<local-ticket-template>

# <NN>: <Ticket title>

**What to build:** the end-to-end behaviour this ticket makes work, from the user's perspective, not a layer-by-layer implementation list.

**Blocked by:** the numbers/titles of the tickets that block this one, or "None (can start immediately)".

**Spec:** path to the spec this ticket implements.

## Review gates

rows per § Review gates; omit for afk

**Status:** ready-for-human (hitl) | ready-for-agent (afk) | in-progress | done

- [ ] Acceptance criterion 1
- [ ] Acceptance criterion 2

</local-ticket-template>

<issue-template>

## Parent

A reference to the parent spec on the tracker (if the source was an existing issue, otherwise omit this section).

## What to build

The end-to-end behaviour this ticket makes work, from the user's perspective, not layer-by-layer implementation.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Blocked by

- A reference to each blocking ticket, or "None (can start immediately)".

## Review gates

rows per § Review gates; omit for afk

</issue-template>

In either form, avoid specific file paths or code snippets: they go stale fast. Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it and note briefly that it came from a prototype. Trim to the decision-rich parts, not a working demo, just the important bits.

## Review gates

The agent writes the code and tests. The user decides, reviews, and tidies by hand. A ticket's review gates are the points where work pauses for the user to see and judge something before it continues; a ticket with at least one gate is **hitl**, a ticket with none is **afk**.

**Format.** A ticket lists its gates in a `## Review gates` section, as a table. No other form:

```
## Review gates

| When | What | Why |
|---|---|---|
| before build | How a saved chat keeps its model when the suite changes | Migration: the pin is stored per chat and hard to change later |
| after build | The model picker in the chat header | Names the user sees |
```

`When` is `before build` or `after build`; a ticket may carry both. `What` names the real thing, not generic text. `Why` names the specific risk and must match a valid reason below.

**Valid reasons.** For a `before build` gate:

1. **Migration**: a change to data that already exists, i.e. a schema change or a persisted file, message or event format that existing records must migrate. New tables or fields that need no migration are not a reason.
2. **An outside contract**: a public API endpoint, CLI flags or output, a published export, a webhook or event payload, an interface that code outside the module implements or calls.
3. **New structure**: a new module or top-level directory, or the first instance of a shape that later tickets copy (a mistake multiplies in the copies).

For an `after build` gate:

4. **Taste** that tests cannot judge: UI, feel, output, names the user sees.

For either kind:

5. **The user asked** to oversee it.

Not reasons: "it creates new files", "is this the right place" alone, size, complexity, tests, bug fixes, signature changes inside an existing module. When a match is uncertain, recommend afk in the quiz.

**Mode and label.** The mode is hitl if and only if the Review gates table has at least one row; else afk. The table decides. The quiz override edits the table: to make a ticket afk, remove its rows; to make it hitl, add a row. At publish, hitl gets `ready-for-human` and afk gets `ready-for-agent`. A stuck run relabels `ready-for-human` and comments its question; when the user answers, the label goes back to `ready-for-agent` (the ticket's table decides the mode again).

**First instance of a shape.** A ticket that is the first instance of a shape later tickets copy gets a `before build` gate (reason 3). Cut it into its own small hitl ticket, and make the afk tickets that copy it blocked by it, saying in "What to build" that they follow that ticket's shape.

A tidy is offered at landing, never planned in a ticket.
