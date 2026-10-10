---
name: onboard
description: "Set a repo up for the pairing workflow, any language: detects the mode (existing, new, fork), runs setup-matt-pocock-skills (issue tracker, labels, domain docs) if needed, detects the stack, extracts conventions to CODING_STANDARDS.md, installs linter/formatter/boundary guardrails, and records the Gate in the agent file's `## Gate` section. Re-run to add missing pieces or upgrade an older setup."
disable-model-invocation: true
---

# Onboard

Run once per repo, when the user asks. The result is a repo where every skill has what it needs: an issue tracker for `to-spec`/`to-tickets`/`wayfinder`, conventions and a Gate for `implement`. It proposes; the user decides. Re-running fills in only what is missing.

Prefer turning a convention into a check over adding another line to `CODING_STANDARDS.md`.

## Context location

Where onboarding writes is the single source of truth for the repo's agent rules.

- **Normal (`existing`/`new`)**: the repo's agent file (`CLAUDE.md` if it exists, else `AGENTS.md`) carries the `## Agent skills` block. Coding standards live in `CODING_STANDARDS.md` at the repo root, the Gate in the agent file's `## Gate` section, ADRs in the repo's ADR directory, and the calibration log in `docs/agents/calibration.md`.
- **`fork`**: see [FORK.md](FORK.md).

What goes where:
- `GLOSSARY.md`: the domain's terms (the words).
- ADRs: decisions with real tradeoffs, and why; hard to reverse.
- `CODING_STANDARDS.md`: how code is written here, as one-line rules.

An onboarded repo is one where `CODING_STANDARDS.md` exists.
Re-running onboard on a repo that already has agent setup reads [UPGRADE.md](UPGRADE.md) first.

## Mode detection

Detect the mode first, then confirm it with the `ask` tool, marking the detected mode `(Recommended)`. Write nothing until the mode is settled:

- **`fork`**: contributing to someone else's repo. Signals: `gh repo view --json isFork,parent` reports a fork; or an `upstream` remote exists; or you have no push rights to `origin`. Nothing but the change itself may reach the eventual PR.
- **`new`**: greenfield. Signals: no history (or near-empty) and no source.
- **`existing`**: everything else.

## Steps

1. **Matt's setup** (every mode): if the repo's agent file has no `## Agent skills` block or the issue-tracker doc is missing, run `skill://setup-matt-pocock-skills` now and finish it before continuing. Keep the default triage labels: `to-tickets` maps `afk` → `ready-for-agent` and `hitl` → `ready-for-human`.
    **Done when** the agent file has an `## Agent skills` block and `docs/agents/issue-tracker.md` exists.
2. **Sync**: `git fetch`; read the up-to-date remote default branch (a stale clone gives a stale picture). In `fork`, fetch `upstream` too and read its default branch.
    **Done when** you are reading the freshly fetched remote default branch (in `fork`, upstream's too).
3. **Detect the stack** from manifest files (`mix.exs` → elixir, `package.json`/`tsconfig.json` → typescript, `pyproject.toml` → python, `Cargo.toml` → rust, `go.mod` → go; several may apply). In `new`, take the stack from the scaffold, or ask once if the scaffold is ambiguous. Load the stack pack if one exists (below).
    **Done when** the stack list is stated and every existing stack pack for it is loaded.
4. **Extract conventions** (`existing` and `fork`): dispatch a `scout` over the code, ADRs, `GLOSSARY.md`, and existing lint/CI config. Look in these categories: code-shape naming, module/directory layout, public-API shape, error-handling shape, data access, config, test style/placement, logging. (Note: domain terms belong in `GLOSSARY.md`). A pattern counts as a convention only when it is the clear majority (~3+ occurrences); skip anything the linter or formatter already enforces. Return each candidate as a one-line positive rule with 1–2 `file:line` examples and tagged repo-specific or stack-generic, capped at ~15, highest-impact first. Also list every place where the code does the same thing two different ways, with both examples. The user approves, edits, …
    **Done when** every candidate is approved, edited or dropped, and the approved lines are in `CODING_STANDARDS.md`.
5. **Guardrails** (`existing`/`new`): propose the applicable guardrails now, not after repeat offences:
   - **Linter** at strict settings, in CI.
   - **Formatter check**, in CI.
   - **Module boundary enforcement** (only when the stack pack names a tool): other modules may only call a module's public surface. Use the pack's tool; if no pack names one, skip this guardrail.
   Run each applicable one once. If existing code violates it, offer a menu: fix now, a ticket per cluster, or start lax and ratchet up. In `fork`, change no guardrails, hooks, or config.
    **Done when** each applicable guardrail has run once and the user has picked a path for any violations (in `fork`: skipped, said so).
6. **Gate**: one repo-owned command, recorded as the agent file's `## Gate` section (its own section, not inside `## Agent skills`; setup-matt-pocock-skills owns that block). The repo's pre-commit hook runs that same command as a backstop, so hooks stay on (no `--no-verify`). `implement` and `walkthrough` still run it explicitly, because the work is uncommitted when reviewed and the output is the evidence.
   - Detect existing pre-commit tooling: `.pre-commit-config.yaml`, lefthook, husky, `.git/hooks/pre-commit`, a `mix precommit` alias, package scripts.
   - If a precommit command exists, Gate = it; extend it with any missing lint/format/boundary checks (`existing`/`new` only).
   - Else create a repo-owned command idiomatic for the stack (a Makefile target, a `just`/npm `precommit` script, a `mix precommit` alias) and wire the pre-commit hook to run it, using the repo's hook manager if one exists. Propose it; the user approves.
   - In `fork`, Gate = the upstream's own checks, derived from `CONTRIBUTING`, the CI workflow, or the Makefile, run locally. Do not touch the hook.
   - Run the gate once and show its output.
    **Done when** the agent file's `## Gate` section holds the command and its run output has been shown.
7. **Offer calibrate** (`existing`, and `new` only once history exists): suggest `skill://calibrate` to record the rework baseline (optional; the user decides). In `fork`, calibrate is skipped, since nothing may persist and the history isn't yours.
    **Done when** the user has answered the offer (in `fork`: skipped, said so).

**Done when**: `CODING_STANDARDS.md` exists, the repo's agent file has a `## Gate` section and an `## Agent skills` block pointing at `docs/agents/`, the gate passes (or its failures are ticketed), and the user is told: "this repo is onboarded, `CODING_STANDARDS.md` is its record of local rules."

The finished repo layout carries:

```markdown
## Agent skills (in AGENTS.md/CLAUDE.md) → points to docs/agents/
## Stack (in AGENTS.md/CLAUDE.md) → e.g. "elixir (stack pack: rule://stack-elixir)"
CODING_STANDARDS.md → repo-specific one-liners; marks the repo onboarded
## Gate (in AGENTS.md/CLAUDE.md) → one repo-owned command, e.g. mix precommit
```

## Stack Packs

A **stack pack** is a rule file `~/.omp/agent/rules/stack-<name>.md` (source: dotfiles `.omp/rules/`) holding what is true of every repo in that stack: skeleton idiom, what counts as public surface, linter/boundary/formatter tools, default gate. It auto-injects whenever the agent edits that stack's files and is readable as `rule://stack-<name>`.

- **Pack exists** → use its tools and gate as defaults in steps 5–6.
- **No pack** → pick the ecosystem's standard tool for each guardrail category; record choices in the repo only.
- **Promote to a pack** when there is enough to say: 3+ stack-generic conventions (recorded during `implement`'s skeleton review, or found in step 4) recurring across 2+ repos of that stack. Propose the new pack or additions as a menu item; the user decides. Repo-specific conventions stay out of packs.
