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
| Ad-hoc surface work, no ticket | `implement` (it proposes the surface change and any exemplar first) |
| A spec with tickets left after the hitl ones | `implement-spec` (runs the remaining afk tickets on one integration branch, opening a PR; I first run each hitl ticket with `implement`, and it must not start while a hitl ticket is open; its PR is where I review and tidy) |
| New repo for this workflow | `onboard` (runs `setup-matt-pocock-skills` first) |
| Workflow changed or older repo setup | `onboard` (upgrades it) |
| Checking drift and rework | `calibrate` |
| A session felt clumsy; improve the agent's setup | `retro` (upstream) |

## Ask vs do

The agent asks me before anything hard to reverse or potentially harmful:
1. **publishing**: commit, push, tag, PR, merge;
2. deleting or overwriting work it didn't create, or rewriting git history;
3. changing persisted data, a public contract, or an external system (deploys, messages, paid services);
4. anything involving secrets or credentials.

`implement` stops for me three times: the skeleton review (a load-bearing surface change), the exemplar (I write the first instance of a pattern), and the diff review on hitl tickets. Everything else it decides, states the assumption, and lists in the walkthrough for my veto. Questions come batched in one `ask`.

## Terms

- **Surface**: module layout, public function heads and types, persisted data shape, cross-module contracts.
- **Load-bearing surface**: the persisted data shapes, and the contracts other modules or outside callers rely on. Changing it is hard to reverse, so a mistake is costly. The rest of the surface (module layout, internal heads and types) is surface but not load-bearing: it goes afk, and I review it in the PR.
- **Skeleton**: the surface written as real code, bodies not implemented.
- **Human task**: work on a ticket that I do in the code, as senior to the agent's junior. Four kinds:
  - **exemplar**: the ticket introduces a pattern a later ticket repeats (first handler, first migration, first component); I hand-write the first instance, code plus its test, because one exemplar shapes every later instance the agent copies.
  - **diff review**: on every hitl ticket, after the build and the agent's own code-review, I read the built diff in r3 in reading order and annotate; the agent revises until I archive it.
  - **tidy**: offered after every diff review; where taste matters, I refactor or delete anything myself, and the agent reruns the tests and reviews as a pair, editing my code only when asked.
  - **take the pen**: on demand, any mode; when the agent fails twice on the same problem with no new hypothesis, it hands me the repro and the ruled-out hypotheses, and I write it or give a steer.
- **hitl / afk**: afk by default; hitl when the ticket has an exemplar or changes the load-bearing surface. On a tracker: `ready-for-human` / `ready-for-agent`.
- **Gate**: the repo's one check command, in the agent file's `## Gate` section.
- **Stack pack**: `rule://stack-<name>`, what is true of every repo in a stack (e.g. `stack-elixir`, `stack-typescript`).

## to-tickets

Upstream `to-tickets`, plus: each ticket lists its Human tasks (the exemplars, whose patterns the ticket introduces) and afk is the default; a ticket is hitl only when it has an exemplar or changes the load-bearing surface, and the agent tells me in the session why each hitl ticket needs the human touch. I cut the human touch into its own small ticket so the tickets around it stay afk (e.g. the first provider adapter is a small hitl ticket carrying the exemplar; the other providers are afk tickets blocked by it), shaping the graph so hitl tickets block afk ones; when an afk ticket must come before a hitl one, the agent says so in the quiz, since it splits the spec run. Slices are also sized so I can review each in one sitting (about 300 changed non-test lines). While proposing, the agent tells me in the session why it recommends an exemplar for each: a ticket is the first instance of a pattern a later ticket repeats, so my hand-written first instance shapes every later one it copies. I can add or drop any. That reasoning isn't written into the tickets. I approve the batch once.

## implement

One ticket per fresh session, afk included. On a spec I run each hitl ticket with `implement` first; once every hitl ticket is done, I run `implement-spec` for the remaining afk tickets: it builds every open ticket, so it runs only when no hitl ticket is open, and its PR is where I review and tidy.

0. **Load** the ticket, the spec's user stories, `CODING_STANDARDS.md`, `GLOSSARY.md`, the ADRs; record the start commit and state the ticket's title back to me. Without a ticket, it first proposes the surface change and any exemplar in one `ask`. Hitl runs the skeleton, exemplar and diff-review stops below; afk skips them.
1. **Skeleton**, only if the change is load-bearing: written in the real files, reviewed by me in r3. It revises until I archive the review, restructures included. What my annotations teach gets filed by kind: domain terms in `GLOSSARY.md`, general rules in `CODING_STANDARDS.md`, real tradeoffs in ADRs. Later tickets that assumed the old surface get updated.
2. **Exemplar**, only if the ticket has one: it writes a `TODO(human)` stub where the pattern starts (its doc comment naming the pattern, the skeleton heads it fills, and the later tickets that copy it). I write the code and its test and say "done"; it reruns the tests and reviews my code as a pair, editing only when asked, and proposes a `CODING_STANDARDS.md` line naming the exemplar as the pattern's reference (written only if I accept). Done when the exemplar is green and reviewed.
3. **Build** with `tdd`: all logic, copying the exemplar wherever the pattern repeats. If it fails twice on the same problem with no new hypothesis, it hands me the repro and the ruled-out hypotheses, and I take the pen or give a steer. Done when every acceptance criterion has a passing test and no unimplemented bodies remain.
4. **Self-review**: `code-review` (Standards and Spec reviewers; the Spec one sees only the ticket, stories, skeleton and diff). It fixes what's real; the rest goes to the walkthrough as "where I'd want your eyes".
5. **Diff review**, hitl only: it publishes the diff to r3 against the start commit with a short tour in reading order, and revises from my annotations until I archive it. Then it offers a **tidy**: where taste matters, I can refactor or delete anything myself; it reruns the tests and reviews as a pair.
6. **Gate**, run last so it covers my tidy.
7. **walkthrough**.

If the build needs a new data shape or contract, it stops, asks, and records an ADR. The exemplar is the user's to write, and the pattern to copy. Any other public addition it makes and lists for veto.

## walkthrough

Every task that changes files ends here. In chat, in as few words as it can, the agent gives (empty parts left out):
1. what changed and why, naming the mechanism I should be able to explain back;
2. one large diagram, when a flow or structure changed;
3. up to three places it wants my eyes, with `file:line`;
4. decisions for my veto, including the approach behind each non-obvious piece of logic;
5. the Gate line.

Then one question: **commit** · **r3 then commit** · **PR** · **leave it**, recommending commit for small, contained work and a branch + PR for larger or cross-cutting work. When I pick PR, it reads `skill://pr` to write the PR body.

When the ticket was the last open one in its spec, in an onboarded repo that isn't a fork, it also suggests running `calibrate` in a fresh session.

## Diagrams

The agent draws diagrams with d2 through `bin/diagram`, which `install.sh` links into `~/.local/bin`. The script checks the same environment variables omp uses to decide whether it can show images (set by Ghostty, kitty, WezTerm and iTerm2; zellij passes images through) and renders an SVG with readable font sizes. When images can't show (SSH, other terminals, or after you say an image didn't show), the agent uses mermaid instead. Text read elsewhere, like r3 summaries and PR bodies, also uses mermaid, which GitHub draws.

## Repo docs

Project knowledge has three homes, one kind each:

- `GLOSSARY.md` (repo root): the domain's terms, meaning what words mean in this project.
- ADRs (the repo's ADR directory): decisions with real tradeoffs, and why.
- `CODING_STANDARDS.md` (repo root): how code is written here, as one-line rules; its existence marks the repo as onboarded.

In `docs/agents/`:

- `calibration.md`: the `calibrate` log.
- `issue-tracker.md`: written by `setup-matt-pocock-skills`.

The Gate lives in the agent file's `## Gate` section.

In a fork, these live under `.omp/` (`.omp/GLOSSARY.md`, `.omp/CODING_STANDARDS.md`, `.omp/adr/`, `.omp/docs/agents/`, with the agent file at `.omp/AGENTS.md`), excluded from git.

## Worked examples

### A small fix
"Fix the typo in the missing-user API error." The agent edits the string and runs the Gate, then gives the walkthrough: one sentence on the fix and the Gate line; no other part applies. It asks commit · r3 then commit · PR · leave it, recommending commit. I pick commit.

### Three afk tickets
`to-tickets` splits an internal logging utility into three tickets, none touching the surface, no human tasks. Each runs in its own fresh session: load → build → check → walkthrough, where the agent lists an assumption for veto (log level as a string; async flushing; JSON output) and I pick commit.

### A hitl ticket
A payment-gateway integration: `to-tickets` cuts the human touch into a small first-provider ticket, hitl because the `PaymentProvider` behaviour is a contract other modules rely on (skeleton) and it carries the exemplar adapter; the other providers are afk tickets blocked by it.
1. **Skeleton**: the agent writes the `PaymentProvider` behaviour and publishes it to r3. I annotate "amount should be a Money struct, not an integer"; it revises, proposes a convention line, and I archive the review.
2. **Exemplar**: I write the first provider adapter and its test; the agent reruns the tests and reviews.
3. **Build**: tdd for the HTTP glue, following the exemplar.
4. **Self-review**: code-review; real findings fixed, the rest goes to the walkthrough.
5. **Diff review**: I read the built diff in r3 in reading order and annotate; the agent revises until I archive it, then offers a tidy. I tidy one function myself and say "done"; it reruns the tests and reviews.
6. **Gate**, then **walkthrough**. I pick commit.

With the hitl ticket done, `implement-spec` builds the afk provider tickets afterwards, copying the exemplar on one integration branch and opening a PR, where I review and tidy.
