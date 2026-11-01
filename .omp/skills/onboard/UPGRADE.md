# Onboard: upgrade

Read when onboard runs on a repo that already has agent setup. Each row is a legacy signal you find by inspecting the repo, and its migration. Append rows whenever the workflow changes.

## Signals and migrations

In `fork`, read the paths through [FORK.md](FORK.md): the agent file is `.omp/AGENTS.md`, and every repo doc below lives under `.omp/`. Moves there are plain `mv`, since `.omp/` is untracked.

Tickets means open local tickets (`.scratch/*/issues/*.md`) and open tracker issues labelled `ready-for-agent` or `ready-for-human`. Unless a row says otherwise, "set the mode" means by the mode rule (`to-tickets` § Review gates): hitl if and only if the `## Review gates` table has a row.

| Signal | Migration |
|---|---|
| The repo has `CONTEXT.md` or `CONTEXT-MAP.md` at the root (or a per-context `CONTEXT.md`) | `git mv` it to `GLOSSARY.md` (`GLOSSARY-MAP.md`, per-context `GLOSSARY.md`); no content change. |
| The repo has `docs/agents/conventions.md` | `git mv` it to `CODING_STANDARDS.md` at the root; no content change: upstream defines no format for this file, and `code-review` reads it as prose, so the one-line rules carry over as they are. |
| The agent file has a `## Conventions` section | Move its lines to `CODING_STANDARDS.md`; delete the section. |
| The repo has `docs/agents/gate.md` | Move its command into a `## Checks` section of the agent file (`CLAUDE.md` if it exists, else `AGENTS.md`; in a fork, `.omp/AGENTS.md`); delete the file. |
| The `## Agent skills` block doesn't point at `docs/agents/` | Point it there. |
| The agent file has a `## Gate` section | Rename it to `## Checks`. |
| A ticket carries a `Puzzles` field, in any style: `ping-pong`, `strong-style`, `solo`, `(human)`, `(agent)`, or its `Human` list has `exemplar: <pattern>` entries, or a `review:` entry of the retired `skeleton` or `pattern` kind | Remove the `Puzzles` field. Map each entry to a `## Review gates` table (format in `to-tickets` § Review gates): entries about placement, a boundary, a migration or a contract map to a `before build` gate; entries about what to run or show map to an `after build` gate. Write the `What` and the `Why` for this ticket, not the generic text. An entry that matches no gate is dropped; a ticket left with no row is afk. Set the label to match, and tell the user which entries changed, so they can tidy at landing. |
| A ticket carries an old trigger line in the retired form `**Human:** structure|surface|decision|see-it-run|one-way-door: <question>` | Map to a `## Review gates` table (format in `to-tickets` § Review gates): `structure` and `surface` map to a `before build` gate (reason 2 or 3), `decision` maps to a `before build` gate with the decision as its `What`, and `see-it-run` maps to an `after build` gate (reason 4). Remove a `one-way-door` line: the ask-before rule in `.omp/AGENTS.md` covers it. Each kept gate needs a `Why` that names a valid reason; if none can be stated, drop the row, and the ticket becomes afk (relabel `ready-for-agent`). |
| A ticket carries a Mode field or a `## Mode` section | Remove it: the `## Review gates` table decides the mode. |
| A ticket's mode and label disagree | Relabel: hitl → `ready-for-human`, afk → `ready-for-agent`. |
| A ticket still carries a legacy `## Human stops` table (`| Stop | What | Why |`) | Rewrite it as a `## Review gates` table (`| When | What | Why |`, format in `to-tickets` § Review gates): a `Shape review` row becomes a `before build` gate, and a `See it run` row becomes an `after build` gate; carry the `What` and the `Why` over as they are. Keep any old `**Human:**` rows (see the trigger-line row above), but rewrite each one into the new gate format. |
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
