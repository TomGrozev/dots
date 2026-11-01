---
name: implement
description: "Implement one ticket (or one ad-hoc task) in a fresh session: tdd, code-review, checks, then hand over to land."
disable-model-invocation: true
---

# Implement

Implement the work described by one ticket. One ticket per fresh session, every mode: the ticket is self-contained, so nothing from another ticket's session is needed. You orchestrate; `task` workers do the build legwork (AGENTS.md § Route).

## Surface
The module layout, public function heads and types, persisted data shape, and cross-module contracts.

A **load-bearing surface** is the part of that surface worth a review gate, because changing it later is hard to reverse. Which parts those are (the `before build` reasons 1 to 3) lives in `to-tickets` § Review gates. For a new module the load-bearing part is its layout and public heads; for a copied shape, the shape itself.

Internal functions, types and private helpers inside an existing module are surface but not load-bearing: they go afk, and the review is offered at landing (`land` step r3 review), not promised.

## Steps

### 0. Load
Read the ticket (the argument: a tracker reference or a local ticket path) and state its title back to the user in one line. Then read its spec's user stories and Implementation and Testing Decisions, `CODING_STANDARDS.md`, `GLOSSARY.md`, and the ADRs in the area. Build to the spec's decisions. Record the start commit: `git rev-parse HEAD`.

The Review gates table decides the mode: a row means hitl, no rows means afk.

- **Ad-hoc** (no ticket): there is no spec, so propose here, in one `ask`: the how choices a spec would have settled (each with options, tradeoffs, and your recommendation) and which review gates apply (`to-tickets` § Review gates), each with a one-line reason, saying plainly where you are unsure. Ad-hoc counts as hitl and passes `hitl` to `land`; the user-named gates run as written.
- **hitl** (the Review gates table has at least one row): read the table; each `before build` gate runs step 1. Shape review, and each `after build` gate runs step 3. See it run (HITL.md). `land` requires the user's review before merge (`land` step r3 review).
- **afk** (no rows; never call it invalid): no gates before handover.

**Done when** the ticket and its context are read, the start commit is recorded, and the mode is known (ad-hoc: the user has answered).

### 1. Shape review
Only when the ticket has a `before build` gate (ad-hoc: the user named one in the step 0 `ask`): follow `implement/HITL.md` § Shape review. The load-bearing surface is in § Surface. The build does not start until the user has approved or changed the shape and chosen in each decision.

**Done when** the answers are applied: the shape is approved or changed, and each decision has a choice. Then every later ticket that builds on this surface (the tickets this one blocks) is edited on the tracker to match the agreed surface, so each stays self-contained and correct.

### 2. Build
Dispatch `task` workers, one per seam or acceptance criterion, in one parallel batch (`isolated: true`). Each worker reads `skill://tdd` and builds its seam to it. Each brief carries Surface needs found mid-build and the test cadence: typecheck and run single test files; the full suite runs in the checks. When a later ticket copies this ticket's shape, the brief says to follow it. A worker's second failure on the same problem with no new hypothesis triggers HITL.md § Take the pen, in any mode. Seams: the ones the shape review agreed; else the highest existing seam. Ask only when two seams are plausible and lead to materially different tests.

**Done when** every acceptance criterion has a passing test and no unimplemented bodies remain.

### 3. See it run
Only when the ticket has an `after build` gate (ad-hoc: the user named one in the step 0 `ask`): follow `implement/HITL.md` § See it run, before self-review and `land`.

**Done when** the user has seen the running result and reacted, and the real objections are fixed and shown again.

### 4. Self-review
1. Read `skill://code-review` and run it with its inputs supplied, so it has nothing to ask:
   - fixed point: the start commit;
   - diff command: `git add -N . && git diff <start>` (the work is uncommitted);
   - spec: the ticket, its spec's user stories and Implementation and Testing Decisions, and the shape review's answers; ad-hoc work has no ticket, so use the step 0 `ask` answers as the spec input;
   - standards: the repo's documented standards, plus the Agent Rules' **Durable names** and **Comments carry the why** (`~/.omp/agent/RULES.md`), so the Standards reviewer checks every new name and comment with eyes that did not write them.

   The Spec reviewer receives only those and the diff, never your reasoning. Fix what's real; the rest become notes (`land` step Notes).

**Done when** the review axes are reported, with what's real fixed and the rest kept for the notes.

### 5. Checks
Run the checks. Checks fallback, the one rule (`land` reuses the checks command it receives, else this same rule): the repo checks; else the stack pack's default checks; else the repo's test and lint commands; else state there is none and suggest `onboard` (interactive only; an unattended run states there is none and goes on). Make them pass by fixing the code; tests and lint rules stay as they are, and hooks stay on.

**Done when** the checks pass, with their command and output tail shown.

### 6. Finish
Hand over to `land` (read `skill://land`), passing the ticket reference (ad-hoc: pass `hitl` as the mode with no ticket reference), the mode, the start commit, the checks command, and the points kept for notes. This skill makes no commits. Many tickets from one spec in a single session use `implement-spec` instead of repeating this skill.

**Done when** `land` has them.

## Surface needs found mid-build
The shape review (or, for afk, the existing code) fixes the surface. A subagent building part of this ticket gets this in its brief: the reviewed surface is fixed; when a later ticket copies this ticket's shape, the brief says to follow it; surface needs go in its report under `### Surface additions`.
- Needs a change to the load-bearing surface (§ Surface) that the ticket's shape review did not cover: on hitl, stop and run a shape review for it (`implement/HITL.md` § Shape review); on afk there is no one to ask, so make the smallest change that works and flag it in the report. Either way the decision is recorded as an ADR (`domain-modeling` format) in the repo's ADR directory.
- A signature change inside an existing module: no gate. Any other public addition: make it, and record it as a note (`land` step Notes).
