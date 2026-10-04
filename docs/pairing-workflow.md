# Pairing workflow

The human-readable map of how the agent and I work together. The agent's own instructions live in `.omp/AGENTS.md`, `.omp/RULES.md` and the skills in `.omp/skills/` (symlinked into `~/.omp/agent/`); Matt Pocock's skills install to `~/.agents/skills` via `install.sh`. A diagram version of this page is [pairing-workflow.html](pairing-workflow.html), which the agent finds at `~/.omp/agent/pairing-workflow.html`, linked there by `install.sh`.

## Pathways

I pick the entry point; nothing routes automatically.

| Starting point | Path |
|---|---|
| Huge or foggy | `wayfinder` → `to-spec` → `to-tickets` → `implement` per ticket |
| A feature in a repo | `grill-with-docs` (optionally `prototype`) → `to-spec` → `to-tickets` → `implement` per ticket |
| A plan or decision, no docs | `grill-me` |
| A bug | `diagnosing-bugs` → fix + regression test → `walkthrough` |
| A small, clear ask | just ask → `walkthrough` |
| Ad-hoc surface work, no ticket | `implement` (it proposes surface and puzzles first) |
| New repo for this workflow | `onboard` (runs `setup-matt-pocock-skills` first) |
| Workflow changed or older repo setup | `onboard` (upgrades it) |
| Checking drift and rework | `calibrate` |

## Ask vs do

The agent asks me before anything hard to reverse or potentially harmful:
1. **publishing**: commit, push, tag, PR, merge;
2. deleting or overwriting work it didn't create, or rewriting git history;
3. changing persisted data, a public contract, or an external system (deploys, messages, paid services);
4. anything involving secrets or credentials.

`implement` adds two stops of its own: a surface change (I review the skeleton) and a human puzzle (I write it). Everything else it decides, states the assumption, and lists in the walkthrough for my veto. Questions come batched in one `ask`.

## Terms

- **Surface**: module layout, public function heads and types, persisted data shape, cross-module contracts.
- **Skeleton**: the surface written as real code, bodies not implemented.
- **Puzzle**: a piece of a ticket's internals where the thinking is the work; pure plumbing has none.
- **Human puzzle**: the user writes its code.
- **Agent puzzle**: the agent writes it and explains its approach.
- **hitl / afk**: hitl when a ticket changes the surface or has a human puzzle; otherwise afk. On a tracker: `ready-for-human` / `ready-for-agent`.
- **Gate**: the repo's one check command, in `docs/agents/gate.md`.
- **Stack pack**: `rule://stack-<name>`, what is true of every repo in a stack (e.g. `stack-elixir`, `stack-typescript`).

## to-tickets

Upstream `to-tickets`, plus: each ticket lists its puzzles, each marked `(human)` (I write it) or `(agent)` (the agent writes it), and its mode follows from that and from whether it changes the surface. Slices are also sized so I can review each in one sitting (about 300 changed non-test lines). While proposing, the agent tells me in the session why it marked each puzzle human or agent, recommending human where a mistake would be silent, costly or hard to undo, and says when it is unsure. I can claim any puzzle. That reasoning isn't written into the tickets. I approve the batch once.

## implement

One ticket per fresh session, afk included.

0. **Load** the ticket, the spec's user stories, `docs/agents/conventions.md`, `CONTEXT.md`, the ADRs; record the start commit. Without a ticket, it first proposes the surface change and puzzles in one `ask`.
1. **Skeleton**, only if the surface changes: written in the real files, reviewed by me in r3. It revises until I resolve the review, restructures included. What my annotations teach gets filed by kind: domain terms in `CONTEXT.md`, general rules in `conventions.md`, real tradeoffs in ADRs. Later tickets that assumed the old surface get updated.
2. **Build** with `tdd`, everything except my puzzles, which stay outside the tdd loop (at most an empty `TODO(human)` stub if its code needs one).
3. **My puzzles**: all its failing tests at once and a `TODO(human)` stub with the context and tradeoffs. I write it and say "done"; it reruns the tests and reviews my code as a pair.
4. **Check**: `code-review` (Standards and Spec reviewers; the Spec one sees only the ticket, stories, skeleton and diff), then the Gate with its output.
5. **walkthrough**.

If the build needs a new data shape or contract, it stops, asks, and records an ADR. Any other public addition it makes and lists for veto.

## walkthrough

Every task that changes files ends here. In chat, in as few words as it can, the agent gives (empty parts left out):
1. what changed and why, naming the mechanism I should be able to explain back;
2. one large diagram, when a flow or structure changed;
3. up to three places it wants my eyes, with `file:line`;
4. decisions for my veto;
5. the Gate line.

Then one question: **commit** · **r3 then commit** · **PR** · **leave it**, recommending commit for small, contained work and a branch + PR for larger or cross-cutting work.

When the ticket was the last open one in its spec, in an onboarded repo that isn't a fork, it also suggests running `calibrate` in a fresh session.

## Diagrams

The agent draws diagrams with d2 through `bin/diagram`, which `install.sh` links into `~/.local/bin`. The script checks the same environment variables omp uses to decide whether it can show images (set by Ghostty, kitty, WezTerm and iTerm2; zellij passes images through) and renders an SVG with readable font sizes. When images can't show (SSH, other terminals, or after you say an image didn't show), the agent uses mermaid instead. Text read elsewhere, like r3 summaries and PR bodies, also uses mermaid, which GitHub draws.

## Repo docs

Project knowledge has three homes, one kind each:

- `CONTEXT.md` (repo root): the domain's terms, meaning what words mean in this project.
- ADRs (the repo's ADR directory): decisions with real tradeoffs, and why.
- `docs/agents/conventions.md`: how code is written here, as one-line rules; its existence marks the repo as onboarded.

Also in `docs/agents/`:

- `gate.md`: the Gate.
- `calibration.md`: the `calibrate` log.
- `issue-tracker.md`: written by `setup-matt-pocock-skills`.

In a fork, these live under `.omp/` (`.omp/CONTEXT.md`, `.omp/adr/`, `.omp/docs/agents/`), excluded from git.

## Worked examples

### A small fix
"Fix the typo in the missing-user API error." The agent edits the string and runs the Gate, then gives the walkthrough: one sentence on the fix and the Gate line; no other part applies. It asks commit · r3 then commit · PR · leave it, recommending commit. I pick commit.

### Three afk tickets
`to-tickets` splits an internal logging utility into three tickets, none touching the surface, no puzzles. Each runs in its own fresh session: load → build → check → walkthrough, where the agent lists an assumption for veto (log level as a string; async flushing; JSON output) and I pick commit.

### A hitl ticket
A payment-gateway integration ticket changes the surface and has one human puzzle, the HMAC signature, which the agent recommended for me because a mistake would be silent.
1. **Skeleton**: the agent writes the `PaymentProvider` behaviour and publishes it to r3. I annotate "amount should be a Money struct, not an integer"; it revises, proposes a convention line, and I resolve the review.
2. **Build**: tdd for the HTTP glue.
3. **Puzzle**: failing tests and a `TODO(human)` for the HMAC. I write it and say "done"; it reruns the tests and reviews.
4. **Check**: code-review, then the Gate.
5. **walkthrough**: what and why (signature verification), a diagram of the payment flow, where it wants my eyes. It recommends PR; I pick PR.
