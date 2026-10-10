---
name: implement
description: "Implement one ticket (or one ad-hoc task) in a fresh session: tdd, code-review, Gate, then the walkthrough."
disable-model-invocation: true
---

# Implement

Implement the work described by one ticket. One ticket per fresh session, every mode: the ticket is self-contained, so nothing from another ticket's session is needed. You orchestrate; `task` workers do the build legwork (AGENTS.md § Route).

## Surface
The module layout, public function heads and types, persisted data shape, and cross-module contracts.

A **load-bearing surface** is the part of that surface worth a stop: persisted data shapes, and contracts other modules or outside callers rely on. Changing one is hard to reverse, so a mistake is costly: this is what makes a ticket **hitl** (the mode rule's source is `to-tickets` § Human tasks and mode). Module layout and internal heads and types are surface but not load-bearing: they go afk, and the user reviews them in the PR.

## Steps

### 0. Load
Read the ticket (the argument: a tracker reference or a local ticket path) and state its title back to the user in one line. Then read its spec's user stories, `CODING_STANDARDS.md`, `GLOSSARY.md`, and the ADRs in the area. Record the start commit: `git rev-parse HEAD`.

- **Ad-hoc** (no ticket): to-tickets never ran, so propose here, in one `ask`: the surface change (if any), and any exemplar, with a one-line reason, saying plainly where you are unsure.
- **hitl** (the ticket or the ad-hoc proposal has an exemplar or changes the load-bearing surface; mode rule: `to-tickets` § Human tasks and mode): steps 1, 2, 5 run, each only when it applies, from its section of [HITL.md](HITL.md).
- **afk**: no stops before the walkthrough; skip steps 1, 2 and 5.

**Done when** the ticket and its context are read, the start commit is recorded, and the mode is known (ad-hoc: the user has answered).

### 1. Skeleton
Only when the ticket changes the load-bearing surface (see § Surface): follow HITL.md § Skeleton.

**Done when** the user has archived the r3 review, the lines the user accepted are written, and every later ticket that builds on this surface (the tickets this one blocks) is edited to match the agreed surface, so each stays self-contained and correct.

### 2. Exemplar
Only when the ticket has a Human entry: follow HITL.md § Exemplar.

**Done when** the exemplar is green and reviewed.

### 3. Build
Dispatch `task` workers, one per seam or acceptance criterion, in one parallel batch (`isolated: true`). Each worker reads `skill://tdd` and builds its seam to it. Each brief carries § Surface needs found mid-build and the test cadence: typecheck and run single test files; the full suite runs in the Gate. Worker briefs say to copy the exemplar where the pattern repeats. A worker's second failure on the same problem with no new hypothesis triggers HITL.md § Take the pen, in any mode. Seams: the ones to-spec agreed; else the highest existing seam. Ask only when two seams are plausible and lead to materially different tests.

**Done when** every acceptance criterion has a passing test and no unimplemented bodies remain.

### 4. Self-review
1. Read `skill://code-review` and run it with its inputs supplied, so it has nothing to ask:
   - fixed point: the start commit;
   - diff command: `git add -N . && git diff <start>` (the work is uncommitted);
   - spec: the ticket, its spec's user stories, and the skeleton;
   - standards: the repo's documented standards, plus the Agent Rules' **Durable names** and **Comments carry the why** (`~/.omp/agent/RULES.md`), so the Standards reviewer checks every new name and comment with eyes that did not write them.

   The Spec reviewer receives only those and the diff, never your reasoning. Fix what's real; the rest goes to the walkthrough as "where I'd want your eyes".

**Done when** the review axes are reported, with what's real fixed and the rest listed for the walkthrough.

### 5. Diff review
Only on hitl tickets: follow HITL.md § Diff review, then § Tidy offer.

**Done when** the user has archived the diff-review artifact and answered the tidy offer.

### 6. Gate
Run the Gate: the command in the agent file's `## Gate` section; if absent, the stack pack's default gate, else the repo's test + lint commands, and suggest `onboard`. Run it last, so it covers the user's tidy edits. Make it pass by fixing the code; tests and lint rules stay as they are, and hooks stay on.

**Done when** the Gate passes, with its command and output tail shown.

### 7. Finish
Read `skill://walkthrough`, passing the ticket reference and the ticket's mode (hitl or afk; ad-hoc counts as hitl). Landing (commit, branch, PR) is the walkthrough's question; this skill writes no git history.

**Done when** the walkthrough's question is answered.

## Surface needs found mid-build
The skeleton (or, for afk, the existing code) fixes the surface. A subagent building part of this ticket gets this in its brief: the approved skeleton is fixed; the exemplar is the user's to write and the pattern to copy; surface needs go in its report under `### Surface additions`.
- Needs a new persisted data shape or cross-module contract: stop, `ask`, and record the decision as an ADR (`domain-modeling` format) in the repo's ADR directory.
- Any other public addition: make it, and list it in the walkthrough under For veto.
