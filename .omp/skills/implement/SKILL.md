---
name: implement
description: "Implement one ticket (or one ad-hoc task) in a fresh session: tdd, code-review, Gate, then the walkthrough."
disable-model-invocation: true
---

# Implement

Implement the work described by one ticket. One ticket per fresh session, every mode: the ticket is self-contained, so nothing from another ticket's session is needed. You orchestrate; `task` workers do the build legwork (AGENTS.md § Route).

## Surface
The module layout, public function heads and types, persisted data shape, and cross-module contracts.

A **load-bearing surface** is the part of that surface worth a stop, because changing it later is hard to reverse:
- **stored data**: a database schema or migration, a persisted file format, a message or event format written to a queue or log that outlives a deploy;
- **outside contracts**: a public API endpoint, CLI flags or output, a published library export, a webhook or event payload, an interface that code outside the module implements or calls.

A stop fires only when the change is new or load-bearing (HITL.md § Triggers):
- a **new** cross-module boundary with no existing example showing how to cross it: the `structure` trigger;
- a **new** load-bearing surface, or a **change** to stored data or an outside contract: the `surface` trigger;
- a signature change **inside** an existing module, with its boundary and callers unchanged: not a stop.

Module layout, internal functions and types, and private helpers are surface but not load-bearing: they go afk, reviewed at landing (`land` § Ask). The mode rule that uses this term lives in `to-tickets` § Human tasks and mode.

## Steps

### 0. Load
Read the ticket (the argument: a tracker reference or a local ticket path) and state its title back to the user in one line. Then read its spec's user stories and Implementation and Testing Decisions, `CODING_STANDARDS.md`, `GLOSSARY.md`, and the ADRs in the area. Build to the spec's decisions. Record the start commit: `git rev-parse HEAD`.

- **Ad-hoc** (no ticket): there is no spec, so propose here, in one `ask`: the how choices a spec would have settled (each with options, tradeoffs, and your recommendation) and which triggers apply (HITL.md § Triggers), each with a one-line reason, saying plainly where you are unsure. Ad-hoc implement counts as hitl; the user-named triggers run as stops.
- **hitl** (the ticket's mode is hitl: `Mode: hitl`, or label `ready-for-human`; mode rule: `to-tickets` § Human tasks and mode): read the `**Human:**` lines; each names a trigger (HITL.md § Triggers) and runs that trigger's stop below. A hitl ticket with no `**Human:**` line is invalid (HITL.md § Ticket fields): stop and ask. `land` requires the user's review before landing (land § Review).
- **afk**: no stops before the walkthrough.

**Done when** the ticket and its context are read, the start commit is recorded, and the mode is known (ad-hoc: the user has answered).

### 1. Shape review
Only when a `**Human:**` line names `structure`, `surface`, or `decision`: follow HITL.md § Shape review. The load-bearing surface is in § Surface.

**Done when** every decision on the r3 page has an answer comment naming one option letter, the chosen options are applied, and every later ticket that builds on this surface (the tickets this one blocks) is edited to match the agreed surface, so each stays self-contained and correct.

### 2. Build
Dispatch `task` workers, one per seam or acceptance criterion, in one parallel batch (`isolated: true`). Each worker reads `skill://tdd` and builds its seam to it. Each brief carries Surface needs found mid-build and the test cadence: typecheck and run single test files; the full suite runs in the Gate. When a later ticket copies this ticket's shape, the brief says to follow it. A worker's second failure on the same problem with no new hypothesis triggers HITL.md § Take the pen, in any mode. Seams: the ones the shape review agreed; else the highest existing seam. Ask only when two seams are plausible and lead to materially different tests.

**Done when** every acceptance criterion has a passing test and no unimplemented bodies remain.

### 3. See it run
Only when a `**Human:**` line names `see-it-run`: follow HITL.md § See it run, before `land`.

**Done when** the human has seen the running result and reacted, and the real objections are fixed and shown again.

### 4. Self-review
1. Read `skill://code-review` and run it with its inputs supplied, so it has nothing to ask:
   - fixed point: the start commit;
   - diff command: `git add -N . && git diff <start>` (the work is uncommitted);
   - spec: the ticket, its spec's user stories and Implementation and Testing Decisions, and the shape review's answers;
   - standards: the repo's documented standards, plus the Agent Rules' **Durable names** and **Comments carry the why** (`~/.omp/agent/RULES.md`), so the Standards reviewer checks every new name and comment with eyes that did not write them.

   The Spec reviewer receives only those and the diff, never your reasoning. Fix what's real; the rest become notes (`land` § Notes).

**Done when** the review axes are reported, with what's real fixed and the rest kept for the notes.

### 5. Gate
Run the Gate. Without one, run the stack pack's default gate, else the repo's test + lint commands, and suggest `onboard`. Make it pass by fixing the code; tests and lint rules stay as they are, and hooks stay on.

**Done when** the Gate passes, with its command and output tail shown.

### 6. One-way-door
Only when a `**Human:**` line names `one-way-door`, or the next action is an irreversible outside action of the kind `one-way-door` covers: follow HITL.md § One-way-door before running it.

**Done when** the human answered go, or the action was ruled out.

### 7. Finish
Hand over to `walkthrough` (read `skill://walkthrough`), passing the ticket reference, the ticket's mode and the points kept for notes. This skill makes no commits.

**Done when** `walkthrough` has them.

## Surface needs found mid-build
The shape review (or, for afk, the existing code) fixes the surface. A subagent building part of this ticket gets this in its brief: the reviewed surface is fixed; when a later ticket copies this ticket's shape, the brief says to follow it; surface needs go in its report under `### Surface additions`.
- Needs a new cross-module boundary with no existing example: stop; that is the `structure` trigger, so it runs the shape review stop (HITL.md § Shape review) and the decision is recorded as an ADR (`domain-modeling` format) in the repo's ADR directory.
- Needs a new persisted data shape or a change to an outside contract: stop; that is the `surface` trigger, so it runs the shape review stop and the decision is recorded as an ADR (`domain-modeling` format) in the repo's ADR directory.
- A signature change inside an existing module: no stop. Any other public addition: make it, and record it as a note (`land` § Notes).
