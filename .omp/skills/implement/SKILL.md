---
name: implement
description: "Implement tickets or a spec in the pairing workflow: routes each ticket by mode (hitl → user shapes the surface, puzzles run ping-pong/strong-style/solo via pair; afk → straight through), then blind review, the repo gate, and one review unit per ticket."
disable-model-invocation: true
---

# Implement

Implement the work described in the tickets. Route each ticket by its mode:

- **`hitl`** (human in the loop; tracker label `ready-for-human`): run `skill://pair` — skeleton, then `tdd` with the puzzles in their agreed styles.
- **`afk`** (agent works while the user is away; label `ready-for-agent`): implement with `tdd` directly.
- **Mode-less tickets** (older/Matt-format): propose mode, puzzles, and styles per ticket using the rules in `to-tickets` and confirm once for the batch.

Tests come from the ticket's acceptance criteria and the spec's user stories and testing decisions, at the seams to-spec agreed (the highest existing seam when there is no spec). Never ask the user to confirm a test list.

**Override — `afk` for the whole run**: invoking implement with the argument `afk` (e.g. `/skill:implement afk #12`) forces `afk` for every ticket in that run. It skips `pair` only; blind review, the Gate, and the end-of-task flow still run.

## Implementation Rules

- **Hard stop**: stop and await the user if the change needs persisted data shape or a cross-module contract that the approved skeleton (or existing code, for `afk`) lacks. Definition and ADR requirement: `skill://pair`.
- **While working**: typecheck and run single-file tests regularly; full suite only in the gate.

## Exit Steps (every ticket, in order)

1. **Blind review**: run `skill://code-review`. Its **Spec** axis reviewer receives ONLY the skeleton (or the ticket for `afk`), the ticket's acceptance criteria (plus the spec's relevant user stories), and the diff — never the implementer's reasoning or transcript. Its brief asks for exactly three lists: (a) acceptance criteria or stories with no covering test, (b) duplicated code paths or a second convention for something the repo already does, (c) semantics changed behind an unchanged-looking interface (defaults, nil/empty handling, error shapes, ordering). Fix what's real; the rest goes into the walkthrough as "where I'd want your eyes". It is input to the walkthrough, not a verdict.
2. **Gate**: run the repo's gate command from the pairing context's `## Gate` (`skill://onboard`; if absent, use the stack pack's default or the repo's test + lint commands, and suggest running `onboard`). It is ONE repo-owned command — the same one the repo's pre-commit hook runs — and I run it explicitly here, because r3 reviews uncommitted work and its output is the evidence. It MUST pass. Paste the command and the tail of its output into the handover — claims without output don't count. Never `--no-verify`, and never make it pass by skipping, deleting, or weakening tests or lint rules.
3. **Done** when: acceptance criteria have passing tests, the gate passed with evidence, skeleton amendments are recorded, and hard-stop ADRs are written to the pairing context's ADR location (`skill://onboard`; `.omp/adr/` in fork mode).

## Review Units and Flow

- **`hitl` tickets**: after each ticket's exit steps, run the end-of-task flow in `skill://walkthrough` before starting the next ticket.
- **`afk` tickets**: run back-to-back on a work branch (`feat/<slug>`; create it at the start of the run if on the default branch). One conventional commit per ticket after its exit steps, without asking (local and reversible; this is the review unit). At the end of the run follow `skill://walkthrough`'s multi-ticket flow: one end-of-task flow for the batch — walkthrough sections per commit, one r3 question, then land on the default branch or open a PR.
- **Mixed runs**: work the frontier in dependency order. A `hitl` ticket interrupts the `afk` streak; flush the pending `afk` commits through the end-of-task flow first so review units stay small.

## Delegation

Chores and solo puzzles may go to `task` subagents. The brief MUST carry:
1. The approved skeleton and the ticket's acceptance criteria (plus relevant spec user stories and testing decisions).
2. Which puzzles are ping-pong — the subagent writes only their tests and `TODO(human)` stubs, never the implementation — and any strong-style picks the user made.
3. The repo's `## Conventions` pointer and stack pack name, if any.
4. A requirement to use `tdd`, and to paste the gate (or scoped test) command output in `### Verified`.
5. The hard stop definition (`skill://pair`) and the instruction to hub-message Main with `await` if triggered; ADRs and conventions go to the pairing context (`skill://onboard`, `.omp/adr/` in fork mode).

Subagents report skeleton amendments under `### Skeleton amendments`. The blind reviewer is never the subagent that wrote the code.
