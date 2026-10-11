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

Module layout, internal functions and types, and private helpers are surface but not load-bearing: they go afk, reviewed at landing (`land` § Ask). The mode rule that uses this term lives in `to-tickets` § Human tasks and mode.

## Steps

### 0. Load
Read the ticket (the argument: a tracker reference or a local ticket path) and state its title back to the user in one line. Then read its spec's user stories and Implementation and Testing Decisions, `CODING_STANDARDS.md`, `GLOSSARY.md`, and the ADRs in the area. Build to the spec's decisions. Record the start commit: `git rev-parse HEAD`.

- **Ad-hoc** (no ticket): there is no spec, so propose here, in one `ask`: the how choices a spec would have settled (each with options, tradeoffs, and your recommendation) and any review (`review: skeleton` or `review: pattern <name>`), each with a one-line reason, saying plainly where you are unsure. Ad-hoc implement counts as hitl.
- **hitl** (the ticket's mode is hitl: `Mode: hitl`, or label `ready-for-human`; mode rule: `to-tickets` § Human tasks and mode): step 1 runs when it applies (HITL.md § Skeleton), and `land` requires the user's review before landing (land § Review).
- **afk**: no stops before the walkthrough; skip step 1.

**Done when** the ticket and its context are read, the start commit is recorded, and the mode is known (ad-hoc: the user has answered).

### 1. Skeleton
Only when the ticket carries `review: skeleton` (its `Human` field; the load-bearing surface is in § Surface): follow HITL.md § Skeleton.

**Done when** the user has archived the r3 review, the lines the user accepted are written, and every later ticket that builds on this surface (the tickets this one blocks) is edited to match the agreed surface, so each stays self-contained and correct.

### 2. Build
Dispatch `task` workers, one per seam or acceptance criterion, in one parallel batch (`isolated: true`). Each worker reads `skill://tdd` and builds its seam to it. Each brief carries Surface needs found mid-build and the test cadence: typecheck and run single test files; the full suite runs in the Gate. When the ticket names a reference instance, the brief says to copy it (§ Surface needs found mid-build). A worker's second failure on the same problem with no new hypothesis triggers HITL.md § Take the pen, in any mode. Seams: the ones to-spec agreed; else the highest existing seam. Ask only when two seams are plausible and lead to materially different tests.

**Done when** every acceptance criterion has a passing test and no unimplemented bodies remain.

### 3. Self-review
1. Read `skill://code-review` and run it with its inputs supplied, so it has nothing to ask:
   - fixed point: the start commit;
   - diff command: `git add -N . && git diff <start>` (the work is uncommitted);
   - spec: the ticket, its spec's user stories and Implementation and Testing Decisions, and the skeleton;
   - standards: the repo's documented standards, plus the Agent Rules' **Durable names** and **Comments carry the why** (`~/.omp/agent/RULES.md`), so the Standards reviewer checks every new name and comment with eyes that did not write them.

   The Spec reviewer receives only those and the diff, never your reasoning. Fix what's real; the rest become notes (`land` § Notes).

**Done when** the review axes are reported, with what's real fixed and the rest kept for the notes.

### 4. Gate
Run the Gate. Without one, run the stack pack's default gate, else the repo's test + lint commands, and suggest `onboard`. Make it pass by fixing the code; tests and lint rules stay as they are, and hooks stay on.

**Done when** the Gate passes, with its command and output tail shown.

### 5. Finish
Hand over to `walkthrough` (read `skill://walkthrough`), passing the ticket reference, the ticket's mode and the points kept for notes. This skill makes no commits.

**Done when** `walkthrough` has them.

## Surface needs found mid-build
The skeleton (or, for afk, the existing code) fixes the surface. A subagent building part of this ticket gets this in its brief: the approved skeleton is fixed; when the ticket names a reference instance, the brief says to copy it; surface needs go in its report under `### Surface additions`.
- Needs a new persisted data shape or cross-module contract: stop, `ask`, and record the decision as an ADR (`domain-modeling` format) in the repo's ADR directory.
- Any other public addition: make it, and record it as a note (`land` § Notes).
