# Onboard: upgrade

Read when onboard runs on a repo that already has agent setup. Each row is a legacy signal you find by inspecting the repo, and its migration. Append rows whenever the workflow changes.

## Signals and migrations

In `fork`, read the paths through [FORK.md](FORK.md): the agent file is `.omp/AGENTS.md`, and every repo doc below lives under `.omp/`. Moves there are plain `mv`, since `.omp/` is untracked.

Tickets means open local tickets (`.scratch/*/issues/*.md`) and open tracker issues labelled `ready-for-agent` or `ready-for-human`.

| Signal | Migration |
|---|---|
| The repo has `CONTEXT.md` or `CONTEXT-MAP.md` at the root (or a per-context `CONTEXT.md`) | `git mv` it to `GLOSSARY.md` (`GLOSSARY-MAP.md`, per-context `GLOSSARY.md`); no content change. |
| The repo has `docs/agents/conventions.md` | `git mv` it to `CODING_STANDARDS.md` at the root; no content change: upstream defines no format for this file, and `code-review` reads it as prose, so the one-line rules carry over as they are. |
| The agent file has a `## Conventions` section | Move its lines to `CODING_STANDARDS.md`; delete the section. |
| The repo has `docs/agents/gate.md` | Move its command into a `## Gate` section of the agent file (`CLAUDE.md` if it exists, else `AGENTS.md`; in a fork, `.omp/AGENTS.md`); delete the file. |
| The `## Agent skills` block doesn't point at `docs/agents/` | Point it there. |
| A ticket carries a `Puzzles` field, in any style: `ping-pong`, `strong-style`, `solo`, `(human)`, `(agent)` | Remove the field. Add `Human`: an exemplar when the ticket is the first instance of a pattern a later ticket repeats, else `None`. Recompute the mode (hitl when it has an exemplar or changes the load-bearing surface, else afk; mode rule: `to-tickets` § Human tasks and mode). Tell the user which former human puzzles were dropped, so they can mark one as an exemplar or plan a tidy. |
| A ticket lacks `Mode` or `Human` | Add them: hitl when it has an exemplar or changes the load-bearing surface, otherwise afk (mode rule: `to-tickets` § Human tasks and mode); `None` when it has no Human entry. |
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
