# Onboard: fork mode

In a fork, nothing but the change itself reaches the eventual PR, so every agent file lives in an untracked `.omp/` directory, added to `.git/info/exclude`.

| What | Path |
|---|---|
| Agent file (auto-loaded project context, holds `## Agent skills`) | `.omp/AGENTS.md` |
| Coding standards, Gate, issue-tracker doc | `.omp/CODING_STANDARDS.md`, `.omp/docs/agents/`, and the Gate as a `## Gate` section in `.omp/AGENTS.md` |
| ADRs | `.omp/adr/` |
| Domain terms | `.omp/GLOSSARY.md` |

Wherever the skills say `docs/agents/…`, `GLOSSARY.md`, `CODING_STANDARDS.md` or the ADR directory, read these paths. The `fork` notes in onboard's steps cover guardrails, the Gate and calibrate.

## Running Matt's setup in a fork

`skill://setup-matt-pocock-skills` takes no path argument: it writes a root `GLOSSARY.md` layout, `docs/agents/{issue-tracker,domain,triage-labels}.md`, and an `## Agent skills` block into the repo's `CLAUDE.md`/`AGENTS.md`. So in a fork:

1. Run `skill://setup-matt-pocock-skills` as written and finish it.
2. Move what it wrote under `.omp/` (`mv`, since `.omp/` is untracked): the agent file's block into `.omp/AGENTS.md`, `GLOSSARY.md` (and `GLOSSARY-MAP.md` in a multi-context repo) to `.omp/`, the ADR directory to `.omp/adr/`, and `docs/agents/` to `.omp/docs/agents/`.
3. Edit `.omp/docs/agents/domain.md` and the `## Agent skills` block so every path in them points at the `.omp/` locations.

**Done when** `.omp/` is excluded from git, `.omp/AGENTS.md` has the `## Agent skills` block pointing at the `.omp/` paths and a `## Gate` section, and `.omp/CODING_STANDARDS.md` exists.
