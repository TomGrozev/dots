---
name: to-tickets
description: Break a plan, spec, or the current conversation into a set of tracer-bullet tickets, each declaring its blocking edges, published to the configured tracker (edges as text in one file per ticket locally, or native blocking links on a real tracker).
disable-model-invocation: true
---

# To Tickets

Break a plan, spec, or conversation into a set of **tickets**: tracer-bullet vertical slices, each declaring the tickets that **block** it.

The tracker doc (`docs/agents/issue-tracker.md`) and the label vocabulary (`docs/agents/triage-labels.md`) come from `skill://setup-matt-pocock-skills`. If either is missing, run `onboard` and stop before step 5.

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

Give each ticket its **blocking edges**: the other tickets that must complete before it can start. A ticket with no blockers can start immediately. The edges form one acyclic graph. A cycle means the tickets are one ticket, or a shared prefactor is missing. Resolve it before the quiz. For each ticket, set its `## Review gates` table by § Review gates.

**Wide refactors are the exception to vertical slicing.** A **wide refactor** is one mechanical change (rename a column, retype a shared symbol) whose **blast radius** fans across the whole codebase, so a single edit breaks thousands of call sites at once and no vertical slice can land green. Don't force it into a tracer bullet; sequence it as **expand–contract**. First expand: add the new form beside the old so nothing breaks. Then migrate the call sites over in batches sized by blast radius (per package, per directory), each batch its own ticket blocked by the expand, keeping CI green batch to batch because the old form still exists. Finally contract: delete the old form once no caller remains, in a ticket blocked by every migrate batch. When even the batches can't stay green alone, keep the sequence but let them share an integration branch that all block a final integrate-and-verify ticket; green is promised only there.

**Done when** every ticket has its blocking edges, the edges form one acyclic graph, and each ticket has its `**Mode:**` line and its `## Review gates` table.

### 4. Quiz the user

Present the proposed breakdown as a numbered list. For each ticket, show:

- **Title**: short descriptive name
- **Blocked by**: which other tickets (if any) must complete first
- **What it delivers**: the end-to-end behaviour this ticket makes work
- **Acceptance criteria**: 2 to 4 checks, each naming an observable behaviour

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Are the blocking edges correct: does each ticket only depend on tickets that genuinely block it?
- Should any tickets be merged or split further?

Show the hitl tickets as one compact table, so a tired user can scan each gate and its reason without reading prose:

| Ticket | Review gate | What you review | Reason |
|---|---|---|---|

If the breakdown is large, show the tickets as a graph with their blockers and hitl gates (AGENTS.md § Pages says when it is a page).

Iterate until the user approves the breakdown.

### 5. Publish the tickets to the configured tracker

Publish the approved tickets. **Done when** each ticket exists on the tracker in dependency order, its blockers resolve to real tickets, its gate table matches § Review gates, and its label matches its mode. **How** depends on the tracker `setup-matt-pocock-skills` configured; the tickets are the same either way, only the shape of the blocking edges changes:

- **Local files** → write one file per ticket under `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` in dependency order (blockers first). Each file's "Blocked by" lists the numbers/titles it depends on. Use the per-ticket file template below: one ticket per file, never a single combined file.
- **A real issue tracker (GitHub, Linear, …)** → publish one issue per ticket in dependency order (blockers first) so each ticket's blocking edges can reference real identifiers. Attach each ticket to the spec as a sub-issue. Set blockers as native links where the tracker has them; then omit `## Blocked by`. Otherwise list the blocking tickets there. Create the triage labels on the tracker first if they do not exist. Apply the triage label by mode unless instructed otherwise: `ready-for-human` for hitl, `ready-for-agent` for afk.

Do not close the spec. One edit to it is allowed: removing `ready-for-agent` from it when the tickets are published, so no agent picks up the spec itself (`to-spec` labels the spec and is read-only there).

<local-ticket-template>

# <NN>: <Ticket title>

**What to build:** the end-to-end behaviour this ticket makes work, from the user's perspective, not a layer-by-layer implementation list.

**Blocked by:** the numbers/titles of the tickets that block this one, or "None (can start immediately)".

**Spec:** path to the spec this ticket implements.

## Review gates

rows per § Review gates; omit for afk

**Mode:** hitl | afk
**Status:** in-progress | in-review | done

## Acceptance criteria

- [ ] Acceptance criterion 1
- [ ] Acceptance criterion 2

A criterion passes or fails a test. It states behaviour, not a file, function or task. Keep it testable.

</local-ticket-template>

<issue-template>

## Parent

A reference to the parent spec: the spec issue on the tracker, or the spec file path. `to-tickets` always fills it.

## What to build

The end-to-end behaviour this ticket makes work, from the user's perspective, not layer-by-layer implementation.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Blocked by

Present only when the tracker has no native blocker links. Then list each blocking ticket, or "None (can start immediately)".

## Review gates

rows per § Review gates; omit for afk

**Mode:** hitl | afk

</issue-template>

In either form, avoid specific file paths or code snippets: they go stale fast. Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it and note briefly that it came from a prototype. Trim to the decision-rich parts, not a working demo, just the important bits.

## Mode and label

The `**Mode:** hitl | afk` line is the only source of a ticket's mode; the gate table says which gates run. `to-tickets` writes the line, and the quiz may change it. It does not publish a `hitl` ticket with no gate rows, or an `afk` ticket with gate rows. At publish, hitl gets `ready-for-human` and afk gets `ready-for-agent`. The agent builds both kinds; the label names who acts next.

## Review gates

Read `skill://to-tickets/REVIEW-GATES.md` for the gate table format, the six gate reasons, the "Not reasons" list, and how to write a `## Review gates` row.

A tidy is offered at landing, never planned in a ticket.
