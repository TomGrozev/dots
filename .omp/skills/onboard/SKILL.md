---
name: onboard
description: "Set a repo up for the agent workflow: mode, conventions, guardrails, checks. Re-run to fill gaps or upgrade an old setup."
disable-model-invocation: true
---

# Onboard

Run once per repo, when the user asks. The result is a repo where every skill has what it needs: an issue tracker for `to-spec`/`to-tickets`/`wayfinder`, conventions and checks for `implement`. It proposes; the user decides. Re-running fills in only what is missing. Re-running on a repo that already has agent setup reads [UPGRADE.md](UPGRADE.md) first.

Prefer turning a convention into a check over adding another line to `CODING_STANDARDS.md`.

## Context location

Where onboarding writes is the single source of truth for the repo's agent rules.

- **Normal (`existing`/`new`)**: the repo's agent file (`CLAUDE.md` if it exists, else `AGENTS.md`) carries the `## Agent skills` block. Coding standards live in `CODING_STANDARDS.md` at the repo root, the checks in the agent file's `## Checks` section, ADRs in `docs/adr/` (created with the first ADR), and the calibration log in `docs/agents/calibration.md`.
- **`fork`**: see [FORK.md](FORK.md).

When a file the workflow uses already exists (`GLOSSARY.md`, `CODING_STANDARDS.md`, an ADR directory, `docs/agents/`), use it in place and add to it. Never replace it. The exception is the agent scaffolding in a `fork` (`AGENTS.md`, `CLAUDE.md`): onboard does not edit them there and writes `.omp/AGENTS.md`.

What goes where: file each proposed line by the test in `skill://land/FILING.md`. It also covers the fork paths under `.omp/`.

Conventions are repo-specific. A stack-generic candidate goes to the stack-pack promotion list (below), not to `CODING_STANDARDS.md`.

An onboarded repo is one where `CODING_STANDARDS.md` exists.

## Detect the mode

Detect the mode first, then confirm it with the `ask` tool, marking the detected mode `(Recommended)`. Write nothing until the mode is settled:

- **`fork`**: contributing to someone else's repo. Signals: `gh repo view --json isFork,parent` reports a fork; or an `upstream` remote exists; or you have no push rights to `origin`. Nothing but the change itself may reach the eventual PR.
- **`new`**: greenfield. Signals: no history (or near-empty) and no source.
- **`existing`**: everything else.

In a `fork`, steps 6 to 8 do not run, except the checks discovery in step 7.

## Steps

1. **Matt's setup** (every mode): if the repo's agent file has no `## Agent skills` block or the issue-tracker doc is missing, run `skill://setup-matt-pocock-skills` now and finish it before continuing. Keep the default triage labels: `to-tickets` maps `afk` → `ready-for-agent` and `hitl` → `ready-for-human`. Append this line to `docs/agents/triage-labels.md`: "The label `ready-for-human` includes hitl tickets an agent builds with review gates; `triage` forms raw issues into tickets and does not relabel hitl tickets."
    **Done when** the agent file has an `## Agent skills` block, `docs/agents/issue-tracker.md` exists, and `docs/agents/triage-labels.md` carries the `ready-for-human` line above.
2. **Sync**: `git fetch`; read the up-to-date remote default branch (a stale clone gives a stale picture). In `fork`, fetch `upstream` too and read its default branch.
    **Done when** you are reading the freshly fetched remote default branch (in `fork`, upstream's too).
3. **Index**: ask once: "Index this repo into codebase-memory for structural code questions?" On a yes, call `mcp__codebase_memory_mcp_index_repository`. On a no, note it and move on.
    **Done when** the user has answered, and the index call ran or was skipped by their answer.
4. **Detect the stack** from manifest files (`mix.exs` → elixir, `package.json`/`tsconfig.json` → typescript, `pyproject.toml` → python, `Cargo.toml` → rust, `go.mod` → go; several may apply). In `new`, take the stack from the scaffold, or ask once if the scaffold is ambiguous. Load the stack pack if one exists (below). Record one line in the agent file: `## Stack` with the stack names and each pack, e.g. `elixir (stack pack: rule://stack-elixir)`.
    **Done when** that `## Stack` line exists and every pack it names is loaded.
5. **Extract conventions** (`existing` and `fork`): dispatch the `scout` with the brief in § Convention Extract. Present the candidates; the user approves, edits or drops each one.
    **Done when** every candidate is approved, edited or dropped, and the approved lines are in `CODING_STANDARDS.md`.
6. **Guardrails** (`existing`/`new`): propose the applicable guardrails now, not after repeat offences:
   - **Linter** at strict settings, in CI.
   - **Formatter check**, in CI.
   - **Elixir**: offer to add `mix_audit` (a new dependency, so ask first); on a yes, add it to the deps and run it.
   - **Module boundary enforcement** (only when the stack pack names a tool): other modules may only call a module's public surface. Use the pack's tool; if no pack names one, skip this guardrail.
   Run each applicable one once. If existing code violates it, offer a menu: fix now, a ticket per cluster, or start lax and ratchet up.
    **Done when** each applicable guardrail has run once and the user has picked a path for any violations.
7. **Checks**: one repo-owned command, recorded as the agent file's `## Checks` section (its own section, not inside `## Agent skills`; setup-matt-pocock-skills owns that block). In `existing`/`new`, the repo's pre-commit hook runs that same command as a backstop, so hooks stay on (no `--no-verify`). `implement` and `land` still run it explicitly, because the work is uncommitted when reviewed and the output is the evidence.
   - In `fork`, the checks discovery and its paths are in [FORK.md](FORK.md).
   - Else detect existing pre-commit tooling: `.pre-commit-config.yaml`, lefthook, husky, `.git/hooks/pre-commit`, a `mix precommit` alias, package scripts.
   - If a precommit command exists, checks = it; extend it with any missing lint/format/boundary checks.
   - Else create a repo-owned command idiomatic for the stack (a Makefile target, a `just`/npm `precommit` script, a `mix precommit` alias) and wire the pre-commit hook to run it, using the repo's hook manager if one exists. Propose it; the user approves.
   - Run the checks once and show their output.
   - **CI and branch protection** (`existing`/`new`, never `fork`): when no CI workflow exists, offer one that runs the checks command. Also offer branch protection on the default branch that requires that check. The workflow is a normal change that lands through `skill://land`; branch protection asks first.
    **Done when** the `## Checks` section holds the command and its run output has been shown; in `existing`/`new`, the pre-commit hook also runs it. In `existing`/`new`, the user has answered the CI and branch-protection offers; in `fork`, these offers are skipped.
8. **Offer calibrate** (`existing`, and `new` only once history exists: at least 20 commits or one landed spec): suggest `skill://calibrate` to record the rework baseline, once (optional; the user decides).
    **Done when** the user has answered the offer.

**Done when**: `CODING_STANDARDS.md` exists, the repo's agent file has a `## Checks` section and an `## Agent skills` block pointing at `docs/agents/`, the checks pass (or their failures are ticketed), and the user is told: "this repo is onboarded, `CODING_STANDARDS.md` is its record of local rules."

The finished repo layout carries:

```markdown
## Agent skills (in AGENTS.md/CLAUDE.md) → points to docs/agents/
## Stack (in AGENTS.md/CLAUDE.md) → e.g. "elixir (stack pack: rule://stack-elixir)"
CODING_STANDARDS.md → repo-specific one-liners; marks the repo onboarded
## Checks (in AGENTS.md/CLAUDE.md) → one repo-owned command, e.g. mix precommit
```

## Convention Extract

The `scout` brief for step 5 must require:
- **Sources**: the code, ADRs, `GLOSSARY.md`, and existing lint/CI config.
- **Categories**: code-shape naming, module/directory layout, public-API shape, error-handling shape, data access, config, test style/placement, logging. Domain terms belong in `GLOSSARY.md`.
- **Evidence**: each candidate as a one-line positive rule with 1–2 `file:line` examples. A pattern counts only when it is the clear majority (about 3+ occurrences).
- **Filters**: read the stack pack first, and drop every candidate the pack or the linter already covers.
- **Tags**: each candidate tagged repo-specific or stack-generic. A stack-generic candidate goes to the stack-pack promotion list, not to `CODING_STANDARDS.md`.
- **Cap**: at most ~15 candidates, highest-impact first.
- **Duplicates**: every place where the code does the same thing two different ways, with both examples.

## Stack Packs

A **stack pack** is a rule file `~/.omp/agent/rules/stack-<name>.md` (source: dotfiles `.omp/rules/`) holding what is true of every repo in that stack: skeleton idiom, what counts as public surface, linter/boundary/formatter tools, default checks. It auto-injects whenever the agent edits that stack's files and is readable as `rule://stack-<name>`.

- **Pack exists** → use its tools and checks as defaults in steps 6–7.
- **No pack** → pick the ecosystem's standard tool for each guardrail category; record choices in the repo only.
- **Promote to a pack** when 3+ stack-generic conventions recur across 2+ repos of that stack. Sources: found in step 5, or noted in reviews for promotion (a stack-generic convention seen in a shape review is noted for pack promotion). Propose the new pack or additions as a menu item; the user decides. Repo-specific conventions stay out of packs.
