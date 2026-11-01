---
name: implement
description: "Implement one ticket (or one ad-hoc task) in a fresh session: tdd, code-review, Gate, then hand over to land."
disable-model-invocation: true
---

# Implement

Implement the work described by one ticket. One ticket per fresh session, every mode: the ticket is self-contained, so nothing from another ticket's session is needed. You orchestrate; `task` workers do the build legwork (AGENTS.md § Route).

## Surface
The module layout, public function heads and types, persisted data shape, and cross-module contracts.

A **load-bearing surface** is the part of that surface worth a stop, because changing it later is hard to reverse:
- **stored data**: a database schema or migration, a persisted file format, a message or event format written to a queue or log that outlives a deploy;
- **outside contracts**: a public API endpoint, CLI flags or output, a published library export, a webhook or event payload, an interface that code outside the module implements or calls.

A `before:` stop fires for each `**Human:** before:` line the ticket carries (HITL.md). Its Why is usually a change to this load-bearing surface (hard to undo), or a taste or oversight call (`to-tickets` § Human tasks and mode). Module layout, internal functions and types, and private helpers are surface but not load-bearing: they go afk, reviewed at landing (`land` step r3 review).

## Steps

### 0. Load
Read the ticket (the argument: a tracker reference or a local ticket path) and state its title back to the user in one line. Then read its spec's user stories and Implementation and Testing Decisions, `CODING_STANDARDS.md`, `GLOSSARY.md`, and the ADRs in the area. Build to the spec's decisions. Record the start commit: `git rev-parse HEAD`.

- **Ad-hoc** (no ticket): there is no spec, so propose here, in one `ask`: the how choices a spec would have settled (each with options, tradeoffs, and your recommendation) and which human stops apply (HITL.md), each with a one-line reason, saying plainly where you are unsure. Ad-hoc implement counts as hitl; the user-named stops run as written.
- **hitl** (the ticket carries at least one `**Human:**` line; mode rule: `to-tickets` § Human tasks and mode): read the `**Human:**` lines; each runs its stop below (HITL.md). `land` requires the user's review before landing (`land` step r3 review). A `Mode:` field or label that disagrees with the lines is a mismatch: the lines decide, and you record the mismatch as a note (`land` step Notes).
- **afk** (a ticket with no `**Human:**` line; never call it invalid): no stops before handover.

**Done when** the ticket and its context are read, the start commit is recorded, and the mode is known (ad-hoc: the user has answered).

### 1. Before stop
Only when the ticket has a `**Human:** before:` line (ad-hoc: the user named one in the step 0 `ask`): follow HITL.md § Before stop (a shape review or a decision). The load-bearing surface is in § Surface. The build does not start on the part under review until the user has approved or changed the shape and chosen in each decision.

**Done when** the answers are applied: a shape review is approved or changed, and each decision has a choice. Then every later ticket that builds on this surface (the tickets this one blocks) is edited to match the agreed surface, so each stays self-contained and correct.

### 2. Build
Dispatch `task` workers, one per seam or acceptance criterion, in one parallel batch (`isolated: true`). Each worker reads `skill://tdd` and builds its seam to it. Each brief carries Surface needs found mid-build and the test cadence: typecheck and run single test files; the full suite runs in the Gate. When a later ticket copies this ticket's shape, the brief says to follow it. A worker's second failure on the same problem with no new hypothesis triggers HITL.md § Take the pen, in any mode. Seams: the ones the before stop agreed; else the highest existing seam. Ask only when two seams are plausible and lead to materially different tests.

**Done when** every acceptance criterion has a passing test and no unimplemented bodies remain.

### 3. After stop
Only when the ticket has a `**Human:** after:` line (ad-hoc: the user named one in the step 0 `ask`): follow HITL.md § After stop, before self-review and `land`.

**Done when** the human has seen the running result and reacted, and the real objections are fixed and shown again.

### 4. Self-review
1. Read `skill://code-review` and run it with its inputs supplied, so it has nothing to ask:
   - fixed point: the start commit;
   - diff command: `git add -N . && git diff <start>` (the work is uncommitted);
   - spec: the ticket, its spec's user stories and Implementation and Testing Decisions, and the before stop's answers;
   - standards: the repo's documented standards, plus the Agent Rules' **Durable names** and **Comments carry the why** (`~/.omp/agent/RULES.md`), so the Standards reviewer checks every new name and comment with eyes that did not write them.

   The Spec reviewer receives only those and the diff, never your reasoning. Fix what's real; the rest become notes (`land` step Notes).

**Done when** the review axes are reported, with what's real fixed and the rest kept for the notes.

### 5. Gate
Run the Gate. Without one, run the stack pack's default gate, else the repo's test + lint commands, and suggest `onboard`. Make it pass by fixing the code; tests and lint rules stay as they are, and hooks stay on.

**Done when** the Gate passes, with its command and output tail shown.

### 6. Finish
Hand over to `land` (read `skill://land`), passing the ticket reference, the ticket's mode and the points kept for notes. This skill makes no commits.

**Done when** `land` has them.

## Surface needs found mid-build
The before stop (or, for afk, the existing code) fixes the surface. A subagent building part of this ticket gets this in its brief: the reviewed surface is fixed; when a later ticket copies this ticket's shape, the brief says to follow it; surface needs go in its report under `### Surface additions`.
- Needs a change to the load-bearing surface (§ Surface) that the ticket's `before:` line did not cover: on hitl, stop and run a before stop for it (HITL.md § Before stop); on afk there is no one to ask, so make the smallest change that works and flag it in the report. Either way the decision is recorded as an ADR (`domain-modeling` format) in the repo's ADR directory.
- A signature change inside an existing module: no stop. Any other public addition: make it, and record it as a note (`land` step Notes).
