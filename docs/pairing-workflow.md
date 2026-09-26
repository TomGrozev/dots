# Pairing workflow

Matt Pocock's flow — wayfinder → to-spec → to-tickets → implement — with pairing layered in.
This page is the readable version of the [flow diagram](pairing-workflow.html). In the diagram,
coloured nodes show who is acting: blue **skill** = you call it, grey = called for you by another
skill, amber ⏸ = the AI stops and waits for you.

Source of truth for the mechanics: `.omp/skills/`, installed by `install.sh` into
`~/.agents/skills/`. This page and the diagram are the human-readable companion to those
skills — if the two ever disagree, the skills win.

## The route

| Where the work is | Path |
|---|---|
| Big or foggy | **wayfinder** → decision tickets → **to-spec** → **to-tickets** → **implement** |
| Medium | **grill-me** → **to-spec** → **to-tickets** → **implement** |
| Small ask, no skill | straight to **implement** |

**onboard** runs once per repo: it puts the issue tracker, `## Conventions`, and the
`## Gate` in place so every other skill has what it needs. **calibrate** runs occasionally to
measure rework in git history.

## Who owns what

The split is the heart of pairing:

- **You (the user)** own the **public surface**: modules and where they live, public function
  heads + types, schemas/migrations, and the contracts between modules. Plus any **puzzle**
  you take on.
- **The AI** owns the **chores**: wiring, boilerplate, glue, tests, call-site migrations,
  pattern-following CSS — everything a competent dev writes without stopping to think.
- **Tests** are derived by the AI from the spec and the ticket's acceptance criteria. You
  never write or approve a test list.

## Ticket modes

**implement** is where the ticket actually gets built, and its `ticket mode` decides who is in
charge:

- **hitl** (human in the loop) — the ticket changes the public surface, or it contains a
  puzzle you want. Goes through **pair**.
- **afk** (away from keyboard) — everything else, including anything describable in one
  sentence. The AI does the chores via **tdd** and you see it in the walkthrough.

These are the same words wayfinder uses for its tickets; `to-tickets` proposes a mode per
ticket and you approve the batch.

## Pair, step by step (hitl tickets)

1. **The skeleton.** The AI writes the public surface as real code in the real files —
   heads, types, structs, schemas — with the bodies left not-implemented (the repo's idiom,
   e.g. `raise "not implemented"`). It stages the files so your edits show up as the unstaged
   `git diff`.
2. **You shape it. ⏸** The AI posts the file list (for ad-hoc work, also the proposed puzzles
   and styles). You edit the files in your editor and say "go".
3. **Restate.** The AI reads your edits, records any convention they imply, restates the
   resulting surface as one short list and continues.
4. **Implement with tdd.** Chores and solo/strong-style puzzles first, then hand each
   ping-pong puzzle over (tests + stub ready) and wait for "done". Every acceptance criterion
   ends up with a passing test.
5. **Exit steps.** Blind review + Gate, then the walkthrough, then commit or PR.

## Puzzles

A **puzzle** is a piece of a ticket's internals where the thinking is the work: an algorithm,
a state machine, an edge-case policy, ordering/concurrency, a non-obvious query. Usually 0–3
per ticket, often none. The AI proposes each puzzle and its style; you accept or change it.

| Style | Who does what |
|---|---|
| **Ping-pong** | AI writes the failing tests + a `TODO(human)` stub with context and tradeoffs; you write the code; the AI reviews it like a pair — it never rewrites your code unless asked. Good for self-contained domain logic the tests pin down well. |
| **Strong-style** | You navigate, the AI drives: the AI offers 2–3 approaches, you pick one (or sketch your own) and the AI types it. Good where the approach is the real question. |
| **Solo** | The AI does it alone; it shows up in the walkthrough like any other code. |

## The two stops

- **The hard stop** — the only *unplanned* mid-work stop. If implementation needs a new
  persisted data shape or a cross-module contract the skeleton doesn't have, the AI stops and
  you decide; the decision is recorded as an ADR.
- **Skeleton amendments** — any *other* public-surface change needed mid-implementation. The
  AI makes the call, continues, and lists it in the walkthrough for your veto. A vetoed
  amendment is reverted and recorded as an ADR.

## Conventions

When a correction of yours (skeleton edit, review comment) implies a rule for how things are
done in general, the AI proposes it as a one-line convention on the spot, tagged
**repo-specific** or **stack-generic**. Accepted lines go into the repo's `## Conventions`
(see **onboard**); stack-generic ones can later become stack packs. Decisions with real
tradeoffs become ADRs instead. Repeating a convention should eventually turn into a linter or
boundary rule.

## Where you decide

| Moment | Your input |
|---|---|
| wayfinder / grill-me | What to build and how it behaves (becomes user stories + acceptance criteria) |
| to-spec | Test seams (asked once) |
| to-tickets review | Slicing, blockers, each ticket's mode, puzzles and styles — one approval for the batch |
| pair | Edit the skeleton; write ping-pong puzzles; pick strong-style approaches |
| End of every task | r3 pass? then the walkthrough (as r3 comments or in chat) · commit or PR? (skip either with one word) |

## Terms

- **Public surface** — modules and where they live, public function heads + types,
  schemas/migrations, contracts between modules. Yours.
- **Skeleton** — the public surface as real code in the real files, bodies not implemented.
  You edit it in your editor and say "go".
- **Gate** — one repo-owned command under `## Gate` in the repo's agent file (written by
  onboard), e.g. tests + compiler + linter + formatter. It must pass with output shown before
  review.
- **Blind review** — a reviewer that sees only skeleton, acceptance criteria and diff — not
  the implementer's reasoning — looking for untested criteria, duplicated code, and changed
  semantics behind a stable interface.
- **Stack pack** — `rule://stack-<name>`, e.g. `stack-elixir`: language-wide rules that
  auto-load when the AI edits that language's files.
