---
name: pair
description: "HITL pairing phase: the user shapes the public surface (modules, function heads, types, schemas, contracts) as real code, then the ticket's puzzles run in their agreed pairing style while the AI does the chores. Run for every `hitl` ticket via implement; for ad-hoc surface work with no ticket, run only in an onboarded repo."
disable-model-invocation: true
---

# Pair

`pair` is how a `hitl` (human-in-the-loop) ticket runs. The user owns the **public surface** and any **puzzle** they take; the AI owns the chores. `afk` tickets skip this skill.

Behaviour is not re-decided here. It was settled upstream (grilling → spec user stories → ticket acceptance criteria), and to-spec agreed the test seams. The AI derives the tests from those; the user never writes or approves a test list. For ad-hoc work with no spec, the AI infers behaviours from the ask and tests at the highest existing seam.

## Ownership Line
- **Public surface** (user owns): module/file names and location; public function heads + types/specs; structs/records/interfaces; persisted data shape (schemas, migrations); contracts between modules (events, message shapes, behaviours/protocols/interfaces, public functions called across module boundaries).
- **Puzzles** (the user's pick): the 0–3 pieces of a ticket's internals that are interesting logic, where the thinking is the work — an algorithm, a state machine, an edge-case policy, ordering/concurrency, a non-obvious query or data transformation. If a competent dev could write it without stopping to think, it is not a puzzle.
- **Chores** (AI, never offered): wiring, boilerplate, glue, pattern-following components/templates, CSS, renames, call-site migrations, tests.

## Pairing Styles
Each puzzle has a style, using the standard pair-programming terms (**driver** types, **navigator** steers):

- **Ping-pong** — the AI writes the failing tests for the puzzle and a `TODO(human)` stub carrying context (what's already built around it), the task, and the tradeoffs to weigh (not the answer). The user writes the code until the tests pass and says "done". The AI then reviews it as a pair would: rerun tests, point out anything it would push back on, one insight. It never rewrites the user's code unless asked.
- **Strong-style** — the user navigates, the AI drives: the AI lays out 2–3 approaches with tradeoffs, the user picks one or sketches their own (prose, pseudocode, a partial function), and the AI types it. Strong-style puzzles are read first in the walkthrough.
- **Solo** — the AI does it alone; it appears in the walkthrough like any other code.

The AI proposes each puzzle and its style; the user only accepts or changes it. Suggest **ping-pong** for self-contained domain logic that the tests pin down well; **strong-style** for logic tangled into existing code, or where the approach is the real question; **solo** when stakes are low or the user is short on time. Styles are proposed in `to-tickets` and approved in its review; for ad-hoc work, alongside the skeleton in step 3.

## The Skeleton
A **skeleton** is the public surface written as real code in the real files, bodies left not-implemented with the language's idiom (`raise "not implemented"`, `throw new Error("not implemented")`, `raise NotImplementedError`, `todo!()`, …). If a stack pack exists (`rule://stack-<name>`, e.g. `rule://stack-elixir`), follow its idiom.

## Workflow

1. **Write skeleton** in the real files, following the repo's `## Conventions` and the spec's implementation decisions.
   - *Done when*: every public-surface item in the ticket exists as a head/type/struct/schema and bodies are not-implemented.
2. **Stage it**: `git add` the touched files, so the user's edits show up as the unstaged `git diff`.
3. **User shapes** — **WAIT**. Post the skeleton's file list; for ad-hoc work, also the puzzles and proposed styles. Then use the `ask` tool to ask how they want to review it: **edit in editor** (recommended) or **r3 annotations**.
   - Editor: the user edits the files and says "go" (optionally changing styles). r3: open the review per `skill://r3`, `r3 watch` it, and treat resolved annotations as the edits.
4. **Restate**: read the edits via `git diff`, then `git add` again. Apply **convention capture** (below). Restate the resulting surface as one short list and continue immediately — no confirmation wait.
5. **Implement** with `tdd` against the skeleton: chores and solo/strong-style puzzles first (strong-style waits only for the user's pick), then hand each ping-pong puzzle over (tests + stub ready) and wait for "done".
   - *Done when*: every acceptance criterion has a passing test, no body is still not-implemented, and `implement`'s exit steps (blind review, gate) pass; then hand over to `skill://walkthrough`.

Waits: the skeleton (step 3), strong-style picks, ping-pong handovers — all agreed up front — plus the hard stop.

## Constraints & Rules

### The Hard Stop
The only **unplanned** mid-work stop. The AI **MUST stop** and propose a change before proceeding if the implementation needs:
- a change to persisted data shape, or
- a contract between modules,

that the approved skeleton (or, for `afk` work, the existing code) does not already have. In a subagent, the hard stop is a `hub` message to Main with `await`. The decision taken at a hard stop is recorded as an ADR (`domain-modeling` skill format) in the pairing context's ADR directory (see `skill://onboard`), in the same change.

### Skeleton Amendments
Any other public-surface change during implementation (e.g., a new public function) is a **skeleton amendment**: make the best call, continue, list it (`file:line` + one-line why) in the walkthrough for veto. A **vetoed** amendment is reverted and gets an ADR recording what was rejected and why, in the pairing context's ADR directory.

### Prototypes
An accepted **prototype** or designer output counts as the skeleton for that ticket and may go straight to production. The hard stop still applies.

## Convention Capture
A convention states how things are done in general (one-off renames or detail changes are NOT conventions). When a user correction (skeleton edit, r3 annotation, or ping-pong review discussion) implies one:

1. **Propose** a one-line convention immediately, tagged **repo-specific** or **stack-generic** (true of any repo in this language/framework).
2. **Record** accepted lines in the pairing context's `## Conventions` (see `skill://onboard`). Stack-generic ones are also stack-pack candidates (`skill://onboard`, Stack packs).
3. **ADR instead** (in the pairing context's ADR directory) when the decision has real tradeoffs.
4. **Enforce**: when a correction repeats a recorded convention, propose a linter or boundary rule as a separate ticket.
