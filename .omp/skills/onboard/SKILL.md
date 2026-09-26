---
name: onboard
description: "Set a repo up for the pairing workflow, any language: detects the mode (existing, new, fork), runs setup-matt-pocock-skills (issue tracker, labels, domain docs) if needed, detects the stack, extracts `## Conventions`, installs linter/formatter/boundary guardrails, and writes the `## Gate` command. Re-run to add missing pieces."
disable-model-invocation: true
---

# Onboard

Run once per repo, when the user asks. The result is a repo where every skill has what it needs: an issue tracker for `to-spec`/`to-tickets`/`wayfinder`, conventions for `pair`, and a gate for `implement`. It proposes; the user decides. Re-running fills in only what is missing.

Markdown conventions are advisory; linters, boundary checks, and the gate are the enforcement. Prefer turning a convention into a check over adding another line to the pairing context.

## Context location

Where onboarding writes is the **pairing context** — the single place every skill reads. Refer to it as "the pairing context"; never hard-code the file elsewhere.

- **Normal (`existing`/`new`)** — the repo's agent file: `CLAUDE.md` if it exists, else `AGENTS.md`. It carries the sections `## Agent skills`, `## Stack`, `## Conventions`, `## Gate`. ADRs live in the repo's ADR directory; the calibration log is `docs/agents/calibration.md`.
- **`fork`** — nothing may land in the repo. The pairing context is a local, untracked `.omp/AGENTS.md` (omp auto-loads it as project context), with `.omp/` appended to `.git/info/exclude`. ADRs go to `.omp/adr/`, setup docs to `.omp/docs/agents/`, and calibration is skipped.

`pair` runs for every `hitl` ticket; for ad-hoc surface work with no ticket it runs only in an onboarded repo (one whose pairing context has `## Conventions`).

## Mode detection

Detect the mode first, then confirm it with the `ask` tool — mark the detected mode `(Recommended)`. Never write anything before the mode is settled:

- **`fork`** — contributing to someone else's repo. Signals: `gh repo view --json isFork,parent` reports a fork; or an `upstream` remote exists; or you have no push rights to `origin`. Nothing but the change itself may reach the eventual PR.
- **`new`** — greenfield. Signals: no history (or near-empty) and no source.
- **`existing`** — everything else.

## Steps

1. **Matt's setup** (every mode): if the pairing context has no `## Agent skills` block or the issue-tracker doc is missing (in `fork`, under `.omp/docs/agents/`), run `skill://setup-matt-pocock-skills` now and finish it before continuing. Keep the default triage labels: `to-tickets` maps `afk` → `ready-for-agent` and `hitl` → `ready-for-human`. In `fork`, still run it, but it writes only to the local untracked location — `.omp/AGENTS.md` for its `## Agent skills` block and `.omp/docs/agents/` for its docs — so nothing lands in the PR. The tracker is whatever the user picks during setup (GitHub issues on the fork or upstream, local markdown, …).
2. **Sync**: `git fetch`; read the up-to-date remote default branch (a stale clone gives a stale picture). In `fork`, fetch `upstream` too and read its default branch.
3. **Detect the stack** from manifest files (`mix.exs` → elixir, `package.json`/`tsconfig.json` → typescript, `pyproject.toml` → python, `Cargo.toml` → rust, `go.mod` → go; several may apply). In `new`, take the stack from the scaffold, or ask once if the scaffold is ambiguous. Load the stack pack if one exists (below).
4. **Extract conventions** (`existing` and `fork`): dispatch a `scout` over the code, ADRs, `CONTEXT.md`, and existing lint/CI config. Look in these categories: naming, module/directory layout, public-API shape, error-handling shape, data access, config, test style/placement, logging. A pattern counts as a convention only when it is the clear majority (~3+ occurrences); skip anything the linter or formatter already enforces. Return each candidate as a one-line positive rule with 1–2 `file:line` examples and tagged repo-specific or stack-generic, capped at ~15, highest-impact first. Also list every place where the code does the same thing two different ways, with both examples. The user approves, edits, or drops each; write approved lines to `## Conventions` and offer to file one cleanup ticket per contradictory case. In `new`, skip extraction: write `## Conventions` with a note that it fills from skeleton edits as `pair` captures them.
5. **Guardrails** (`existing`/`new`): propose the applicable guardrails now, not after repeat offences:
   - **Linter** at strict settings, in CI.
   - **Formatter check**, in CI.
   - **Module boundary enforcement** (only when the stack pack names a tool): other modules may only call a module's public surface. Use the pack's tool; if no pack names one, skip this guardrail.
   Run each applicable one once. If existing code violates it, offer a menu: fix now, a ticket per cluster, or start lax and ratchet up. In `fork`, change no guardrails, hooks, or config.
6. **Gate** — one repo-owned command, the single source of truth (`## Gate` in the pairing context). The repo's pre-commit hook runs that same command; the hook is the backstop, so never `--no-verify`. (`implement`'s exit steps still run it explicitly, in every mode, because `r3` reviews uncommitted work and the output is the evidence.)
   - Detect existing pre-commit tooling: `.pre-commit-config.yaml`, lefthook, husky, `.git/hooks/pre-commit`, a `mix precommit` alias, package scripts.
   - If a precommit command exists, Gate = it; extend it with any missing lint/format/boundary checks (`existing`/`new` only).
   - Else create a repo-owned command idiomatic for the stack (a Makefile target, a `just`/npm `precommit` script, a `mix precommit` alias) and wire the pre-commit hook to run it, using the repo's hook manager if one exists. Propose it; the user approves.
   - In `fork`, Gate = the upstream's own checks, derived from `CONTRIBUTING`, the CI workflow, or the Makefile, run locally. Do not touch the hook.
   - Run the gate once and show its output.
7. **Offer calibrate** (`existing`, and `new` only once history exists): suggest `skill://calibrate` to record the rework baseline (optional; the user decides). In `fork`, calibrate is skipped — nothing may persist and the history isn't yours.

**Done when**: `## Agent skills`, `## Conventions`, and `## Gate` exist in the pairing context, the gate passes (or its failures are ticketed), and the user is told: "this repo is onboarded — `## Conventions` is its record of local rules."

The finished pairing context carries (in `fork`, all of this in `.omp/AGENTS.md`):

```markdown
## Agent skills        ← setup-matt-pocock-skills (tracker, labels, domain docs)
## Stack               ← e.g. "elixir (stack pack: rule://stack-elixir)"
## Conventions         ← repo-specific one-liners; marks the repo onboarded
## Gate                ← one repo-owned command, e.g. mix precommit
```

## Stack Packs

A **stack pack** is a rule file `~/.omp/agent/rules/stack-<name>.md` (source: dotfiles `.omp/rules/`) holding what is true of every repo in that stack: skeleton idiom, what counts as public surface, linter/boundary/formatter tools, default gate. It auto-injects whenever the agent edits that stack's files and is readable as `rule://stack-<name>`.

- **Pack exists** → use its tools and gate as defaults in steps 5–6.
- **No pack** → pick the ecosystem's standard tool for each guardrail category; record choices in the repo only.
- **Promote to a pack** when there is enough to say: 3+ stack-generic conventions (captured in `pair`, or found in step 4) recurring across 2+ repos of that stack. Propose the new pack or additions as a menu item; never write one silently. Repo-specific conventions never go in a pack.
