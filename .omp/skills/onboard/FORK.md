# Onboard: fork mode

In a fork, nothing but the change itself reaches the eventual PR, so every agent file lives in an untracked `.omp/` directory, added to `.git/info/exclude`.

| What | Path |
|---|---|
| Agent file (auto-loaded project context, holds `## Agent skills`) | `.omp/AGENTS.md` |
| Conventions, Gate, issue-tracker doc | `.omp/docs/agents/` |
| ADRs | `.omp/adr/` |
| Domain terms | `.omp/CONTEXT.md` |

Wherever the skills say `docs/agents/…`, `CONTEXT.md` or the ADR directory, read these paths. Run `skill://setup-matt-pocock-skills` pointed at them. The `fork` notes in onboard's steps cover guardrails, the Gate and calibrate.

**Done when** `.omp/` is excluded from git, `.omp/AGENTS.md` has the `## Agent skills` block, and `.omp/docs/agents/conventions.md` and `.omp/docs/agents/gate.md` exist.
