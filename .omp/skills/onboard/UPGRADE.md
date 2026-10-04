# Onboard: upgrade

Read when onboard runs on a repo that already has agent setup. Each row is a legacy signal you find by inspecting the repo, and its migration. Append rows whenever the workflow changes.

## Signals and migrations

In `fork`, read the paths through [FORK.md](FORK.md): the agent file is `.omp/AGENTS.md`, and `docs/agents/` is `.omp/docs/agents/`.

Tickets means open local tickets (`.scratch/*/issues/*.md`) and open tracker issues labelled `ready-for-agent` or `ready-for-human`.

| Signal | Migration |
|---|---|
| The agent file has a `## Conventions` section | Move its lines to `docs/agents/conventions.md`; delete the section. |
| The agent file has a `## Gate` section | Move the command to `docs/agents/gate.md`; delete the section. |
| The `## Agent skills` block doesn't point at `docs/agents/` | Point it there. |
| A ticket's puzzles carry an old style: `ping-pong`, `strong-style`, `solo` | Rewrite as a `Puzzles` list. `ping-pong` (the user wrote the body) → `(human)`; `strong-style` (the user picked the approach, the agent typed it) and `solo` → `(agent)`. Tell the user which strong-style puzzles became agent puzzles, so they can reclaim any as human. |
| A ticket lacks `Mode` or `Puzzles` | Add them: hitl when it changes the surface or has a human puzzle, otherwise afk; `None` when it has no puzzles. |
| A ticket's mode and label disagree | Relabel: hitl → `ready-for-human`, afk → `ready-for-agent`. |
| Repo docs mention the retired `pair` skill or "pairing context" | List each as a manual action; the user's docs are theirs to rewrite. |

## Procedure

1. **Detect**: check every signal above.
   **Done when** every signal is checked and each hit is listed with its location.
2. **Plan**: one `ask` listing the files to move, the tickets to rewrite (ticket and change), the labels to change, and the manual actions.
   **Done when** the user has approved, edited or dropped every item.
3. **Apply** the approved items, tracker edits included.
   **Done when** every approved item is applied.
4. **Hand over**: list the remaining manual actions, then continue onboard's steps to fill anything still missing.
   **Done when** the user has the list.
