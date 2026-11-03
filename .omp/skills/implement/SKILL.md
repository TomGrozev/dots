---
name: implement
description: "Implement one ticket (or one ad-hoc task) in a fresh session: tdd, code-review, checks, then hand over to land."
disable-model-invocation: true
---

# Implement

Implement the work described by one ticket. One ticket per fresh session, every mode: the ticket is self-contained, so nothing from another ticket's session is needed. You orchestrate; `task` workers do the build legwork (AGENTS.md § Route).

The steps below run in every mode. A hitl ticket adds two review gates; `implement/HITL.md` holds the gate steps, the surface definition and the page rules. This file says only when to open it.

## Steps

### 0. Load
Read the ticket (the argument: a tracker reference or a local ticket path) and state its title back to the user in one line. If the reference matches no ticket or more than one, list the matches and ask before you read further.

The ticket's `**Mode:**` line alone picks the branch below; the gate table only says which gates run. When the line and the table disagree, stop and ask the user.

Then read its spec: the `Parent` issue on a tracker, or the `**Spec:**` path in a local ticket. When the ticket has neither, ask for the spec. Also read the spec's user stories and Implementation and Testing Decisions, `CODING_STANDARDS.md`, `GLOSSARY.md`, and the ADRs in the area. Build to the spec's decisions. Record the start commit: `git rev-parse HEAD`.

- **Ad-hoc** (no ticket): there is no spec, so propose here, in one `ask`: the how choices a spec would have settled (each with options, tradeoffs, and your recommendation) and which review gates apply, each with a one-line reason. A gate is `before build` (run before step 1) or `after build` (run after step 1). Read `skill://to-tickets/REVIEW-GATES.md` for the gate reasons and pick the one that names the risk. Ad-hoc counts as hitl and passes `hitl` to `land`; the user-named gates run as written.
- **hitl**: read `HITL.md` now. Its `## Review gates` table says which gates run.
- **afk**: no gates before handover.

**Done when** the ticket and its context are read, the start commit is recorded, and the mode is known (ad-hoc: the user has answered).

hitl with a `before build` row: run `HITL.md` § Shape review before step 1.

### 1. Build
Dispatch `task` workers, one per seam or acceptance criterion, in one parallel batch (`isolated: true`). Each worker reads `skill://tdd` and builds its seam to it. Each brief carries the test cadence: typecheck and run single test files; the full suite runs in the checks. Each brief carries an `outputSchema` with the fields `summary`, `issues` (each with options), `defaults`, and `surface_additions`. When a later ticket copies this ticket's shape, the brief says to follow it. Seams: the ones the spec agreed, or the shape review agreed; else the highest existing seam: the largest boundary the current code already draws (an existing module or function head) that the change sits behind. Ask only when two seams are plausible and lead to materially different tests.

Take the pen, any mode: a worker's second failure on the same problem with no new hypothesis hands the question to the user. Give the repro and the hypotheses ruled out, and ask whether they take the pen or give a steer. If they take it, wait for "done"; if they steer, resume with the steer. No user (unattended run): follow the stuck-run rule in your system prompt.

**Done when** every acceptance criterion has a passing test and no unimplemented bodies remain.

hitl with an `after build` row: run `HITL.md` § See it run after step 1, before step 2.

### 2. Self-review
1. Read `skill://code-review` and run it with its inputs supplied, so it has nothing to ask:
   - fixed point: the start commit;
   - diff command: `git add -N . && git diff <start>` (the work is uncommitted);
   - spec: the ticket, its spec's user stories and Implementation and Testing Decisions, and the shape review's answers; ad-hoc work has no ticket, so use the step 0 `ask` answers as the spec input;
   - standards: the repo's documented standards, plus the Agent Rules' **Durable names** and **Comments carry the why**, so the Standards reviewer checks every new name and comment with eyes that did not write them.

   The Spec reviewer receives only those and the diff, never your reasoning. Fix what's real; the rest become notes (`land` step Notes).

**Done when** the review axes are reported, with what's real fixed and the rest kept for the notes.

### 3. Checks
Run the checks in the order in `skill://land/CHECKS.md`. No user (unattended run): follow the stuck-run rule in your system prompt. Make the checks pass by fixing the code; tests and lint rules stay as they are, and hooks stay on.

**Done when** the checks pass, with their command and output tail shown.

### 4. Finish
Hand over to `land` (read `skill://land`), passing the ticket reference (ad-hoc: pass `hitl` as the mode with no ticket reference), the mode, the start commit, the checks command, and the points kept for notes. This skill makes no commits. Many tickets from one spec in a single session use `implement-spec` instead of repeating this skill.

**Done when** `land` has them.

## Surface needs found mid-build
Trigger: a worker must add or change a public function head, a module layout or a stored data shape that the ticket (or its Shape review) did not agree. The worker reports it in `surface_additions`.
- hitl: stop; the main session runs a new Shape review for it (`HITL.md` § Shape review).
- afk: make the smallest change that works and report it.

Record: a module layout or stored data shape change gets an ADR (`domain-modeling` format) in `docs/adr/` (fork: `.omp/docs/adr/`); any other public addition is a note (`land` step Notes). A signature change inside an existing module needs no gate.
