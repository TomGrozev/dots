# Onboard: upgrade

Each row is a legacy signal you find by inspecting the repo, and its migration. Append rows whenever the workflow changes.

## Signals and migrations

In `fork`, read the paths through [FORK.md](FORK.md): the agent file is `.omp/AGENTS.md`, and every repo doc below lives under `.omp/`. Moves there are plain `mv`, since `.omp/` is untracked.

Tickets means open local tickets (`.scratch/*/issues/*.md`) and open tracker issues labelled `ready-for-agent` or `ready-for-human`. It also includes tickets with `**Status:** in-progress`; list them apart from the others.

Labels follow the ticket's mode: `hitl` → `ready-for-human`, `afk` → `ready-for-agent`. When a ticket has no `**Mode:**` line, ask the user. Read `skill://to-tickets/REVIEW-GATES.md` for the gate table format.

| Signal | Migration |
|---|---|
| The repo has `CONTEXT.md` or `CONTEXT-MAP.md` at the root (or a per-context `CONTEXT.md`) | `git mv` it to `GLOSSARY.md` (`GLOSSARY-MAP.md`, per-context `GLOSSARY.md`); no content change. |
| The repo has `docs/agents/conventions.md` | `git mv` it to `CODING_STANDARDS.md` at the root; no content change: upstream defines no format for this file, and `code-review` reads it as prose, so the one-line rules carry over as they are. |
| The agent file has a `## Conventions` section | Move its lines to `CODING_STANDARDS.md`; delete the section. |
| The repo has `docs/agents/gate.md` | Move its command into a `## Checks` section of the agent file (`CLAUDE.md` if it exists, else `AGENTS.md`; in a fork, `.omp/AGENTS.md`); delete the file. |
| The `## Agent skills` block doesn't point at `docs/agents/` | Point it there. |
| The agent file has a `## Gate` section | Rename it to `## Checks`. |
| A ticket carries a `Puzzles` field, in any style: `ping-pong`, `strong-style`, `solo`, `(human)`, `(agent)`, or its `Human` list has `exemplar: <pattern>` entries, or a `review:` entry of the retired `skeleton` or `pattern` kind | Remove the `Puzzles` field. Map each entry to a `## Review gates` table: entries about placement, a boundary, a migration or a contract map to a `before build` gate; entries about what to run or show map to an `after build` gate. Write the `What you review` and the `Reason` for this ticket, not the generic text. An entry that matches no gate is dropped; a ticket left with no row is afk. Set the mode line and label to match, and tell the user which entries changed, so they can tidy at landing. |
| A ticket carries an old trigger line in the retired form `**Human:** structure|surface|decision|see-it-run|one-way-door: <question>` | Map to a `## Review gates` table: `structure` and `surface` map to a `before build` gate (An outside contract, or New structure), `decision` maps to a `before build` gate with the decision as its `What you review` and the reason Open design, `see-it-run` maps to an `after build` gate (Taste: taste that tests cannot judge). Remove a `one-way-door` line: the ask-first rule in `~/.omp/agent/AGENTS.md` covers it. Each kept gate needs a `Reason` that names a valid reason by name; if none can be stated, drop the row, and the ticket becomes afk (relabel `ready-for-agent`). |
| A ticket carries a Mode field or a `## Mode` section | Replace it with the line `**Mode:** hitl` or `**Mode:** afk`, from the old field's value. When the old field and the gate table disagree, list it in the Plan step and ask the user which side is right. |
| A ticket's mode line, label and gate table disagree | List each mismatch in the Plan step, and ask the user which side is right. Never rewrite the mode line from the table. Apply the answer to the other sides, then relabel to match. `to-tickets` does not publish a hitl ticket with no gate rows, or an afk ticket with gate rows. |
| A ticket still carries a legacy `## Human stops` table (`| Stop | What | Why |`) | Rewrite it as a `## Review gates` table with the headers `| Review gate | What you review | Reason |`: a `Shape review` row becomes a `before build` gate, and a `See it run` row becomes an `after build` gate; carry the `What` and the `Why` over as they are. Keep any old `**Human:**` rows and migrate each one by the trigger-line row above. |
| Repo docs mention the retired `pair` skill or "pairing context" | List each as a manual action; the user's docs are theirs to rewrite. |

## Procedure

1. **Detect**: check every signal above.
   **Done when** every signal is checked and each hit is listed with its location.
2. **Plan**: print one numbered list of every move, label change and ticket rewrite. List the in-progress tickets apart, and ask once per in-progress ticket: update its gates now, leave it as it is, or stop the upgrade. Then one `ask` with two options: approve all, or edit (the user names the items to change).
   **Done when** the user has approved all, or named the items to edit.
3. **Apply**, then re-run Detect.
   **Done when** every approved item is applied and Detect finds no signal left (or states why one stays).
4. **Hand over**: list the remaining manual actions, then continue onboard's steps to fill anything still missing.
   **Done when** the user has the list.
