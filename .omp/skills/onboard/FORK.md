# Onboard: fork mode

In a fork, nothing but the change itself reaches the eventual PR, so every agent file lives in an untracked `.omp/` directory, added to `.git/info/exclude`. Onboard's every-mode rules apply here; this file holds only the fork paths and the fork-only steps.

| What | Path |
|---|---|
| Agent file (auto-loaded project context, holds `## Agent skills`) | `.omp/AGENTS.md` |
| Coding standards, checks, issue-tracker doc | `.omp/CODING_STANDARDS.md`, `.omp/docs/agents/`, and the checks as a `## Checks` section in `.omp/AGENTS.md` |
| ADRs | `.omp/docs/adr/`, created with the first ADR |
| Domain terms | `.omp/GLOSSARY.md` |

Wherever the skills say `docs/agents/…`, `GLOSSARY.md`, `CODING_STANDARDS.md` or `docs/adr/`, read these paths.

## Steps

0. Add `.omp/` to `.git/info/exclude` before anything writes there.
    **Done when** `git status --porcelain` lists nothing under `.omp/`.
1. Run `skill://setup-matt-pocock-skills` with the `.omp/` paths from the table in place of its default paths, and finish it. Edit no tracked file.
2. Edit `.omp/docs/agents/domain.md` and the `## Agent skills` block so every path in them points at the `.omp/` locations.

Checks discovery in a fork: find the checks the project already uses, in this order: the CI config (`.github/workflows`), then the project's task runner (`mix` aliases, `package.json` scripts, `Makefile`). Write the command in `.omp/AGENTS.md` `## Checks`. When none is found, ask. Add no checks and no hooks to the fork; do not touch its hook.

**Done when** `.omp/` is excluded from git, `git status` shows no change to a tracked file, `.omp/AGENTS.md` has the `## Agent skills` block pointing at the `.omp/` paths and a `## Checks` section, and `.omp/CODING_STANDARDS.md` exists.
