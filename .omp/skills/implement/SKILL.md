---
name: implement
description: "Implement one ticket (or one ad-hoc task) in a fresh session: tdd, code-review, Gate, then the walkthrough."
disable-model-invocation: true
---

# Implement

Implement the work described by one ticket, in this session. One ticket per fresh session, every mode: the ticket is self-contained, so nothing from another ticket's session is needed.

Use `tdd` at pre-agreed seams. Typecheck and run single test files regularly; the full suite runs in the Gate.

## Surface
The module layout, public function heads and types, persisted data shape, and cross-module contracts.

## Steps

### 0. Load
Read the ticket (the argument: a tracker reference or a local ticket path), its spec's user stories, `docs/agents/conventions.md`, `CONTEXT.md`, and the ADRs in the area. Record the start commit: `git rev-parse HEAD`.

- **Ad-hoc** (no ticket): to-tickets never ran, so propose here, in one `ask`: the surface change (if any), and each puzzle marked as human or agent with a one-line reason, saying plainly where you are unsure.
- **hitl** (the ticket or the ad-hoc proposal changes the surface or has a human puzzle): steps 1 and 3 run, each from its section of [HITL.md](HITL.md).
- **afk**: no stops before the walkthrough; skip steps 1 and 3.

**Done when** the ticket and its context are read, the start commit is recorded, and the mode is known (ad-hoc: the user has answered).

### 1. Skeleton
Only when the ticket changes the surface: follow HITL.md § Skeleton.

**Done when** the user has archived the r3 review, the lines the user accepted are written, and every later ticket that builds on this surface (the tickets this one blocks) is edited to match the agreed surface, so each stays self-contained and correct.

### 2. Build
Run `tdd` for your own code only; human puzzles stay outside the loop. If your code needs a human puzzle's function, write only its `TODO(human)` stub so the code compiles; the puzzle's tests come in step 3. Never write a human puzzle's body, not even to turn a test green. Seams: the ones to-spec agreed; else the highest existing seam. Ask only when two seams are plausible and lead to materially different tests.

**Done when** every acceptance criterion outside human puzzles has a passing test, and the only unimplemented bodies are the human puzzles' `TODO(human)` stubs.

### 3. Human puzzles
For each, follow HITL.md § Human puzzles.

**Done when** every human puzzle passes its tests and has been reviewed.

### 4. Check
1. Run `code-review` with its inputs supplied, so it has nothing to ask:
   - fixed point: the start commit;
   - diff command: `git add -N . && git diff <start>` (the work is uncommitted);
   - spec: the ticket, its spec's user stories, and the skeleton.

   The Spec reviewer receives only those and the diff, never your reasoning. Fix what's real; the rest goes to the walkthrough as "where I'd want your eyes".
2. Run the Gate: the command in `docs/agents/gate.md`; if absent, the stack pack's default gate, else the repo's test + lint commands, and suggest `onboard`. Make it pass by fixing the code; tests and lint rules stay as they are, and hooks stay on.

**Done when** both review axes are reported and the Gate passes, with its command and output tail shown.

### 5. Finish
Run `skill://walkthrough`, passing the ticket reference so the commit or PR cites it. Landing (commit, branch, PR) is the walkthrough's question; this skill writes no git history.

**Done when** the walkthrough's question is answered.

## Surface needs found mid-build
The skeleton (or, for afk, the existing code) fixes the surface. A subagent building part of this ticket gets this in its brief: the approved skeleton is fixed; `TODO(human)` stubs are the user's to write; surface needs go in its report under `### Surface additions`.
- Needs a new persisted data shape or cross-module contract: stop, `ask`, and record the decision as an ADR (`domain-modeling` format) in the repo's ADR directory.
- Any other public addition: make it, and list it in the walkthrough under For veto.
