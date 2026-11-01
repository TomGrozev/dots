# AI Agent Tooling

This repository integrates several tools for AI-assisted coding, centered around the `omp` orchestrator.

## OMP (Orchestrator)

The orchestrator manages agent sessions, roles, and tool integrations.

- **Configuration**: 
  - `.omp/config.yml`: Primary configuration for models, agents, and settings.
  - `.omp/config-devcontainer.yml`: Devcontainer-specific overrides.
  - `.omp/merge-config.py`: Script to merge the above configurations.
- **Knowledge Graph**: `mcp.json` defines the Model Context Protocol server connections (e.g., `codebase-memory-mcp`).
- **Agent Ecosystem**:
  - **Roster**: Defined in `.omp/AGENTS.md`.
  - **Skills**: Found in `.omp/skills/` (local) and `~/.agents/skills/` (upstream). `to-tickets`, `implement` and `implement-spec` are local forks of Matt Pocock's skills, edited directly; `install.sh` removes their upstream copies so the local ones shadow them. `land`, `onboard` and `calibrate` are written here from scratch.
  - **Naming**: the domain-terms file is `GLOSSARY.md` and the coding-standards file is `CODING_STANDARDS.md` (repo root; in a fork, under `.omp/`). Their existence marks the repo as onboarded.
  - **Prose rule**: workflow prose avoids em-dashes (U+2014); upstream adopted the same ban after a careless sweep once broke YAML front matter in a skill file.
  - **Rules**: Global and role-specific guardrails in `.omp/RULES.global.md` (installed as `~/.omp/agent/RULES.md`) and `.omp/rules/`, including the stack packs (`stack-elixir`, `stack-phoenix`, `stack-typescript`).
  - **Extensions**: Custom functionality plugins in `.omp/extensions/`.
- **Monitoring**: `WATCHDOG.md` describes the automated oversight process.
- **Workflow**: See the [pairing workflow](pairing-workflow.html) for the collaboration map.

## Companion Tools

- **Captain Miao**: Session manager and dashboard. Binary installed via `install.sh`.
- **r3**: Review tool for human-agent handoffs. Installed via npm.
- **Codebase Memory MCP**: Provides a knowledge graph of the repository. Installed as a binary.
- **CortexKit**: AI toolkit integration found in `.cortexkit/` and `.config/cortexkit/`.
- **Git Bot Identity**: Specialized extension for managing AI bot identities. See the [Git Bot Identity README](../.omp/extensions/git-bot-identity/README.md).
- **Diagrams**: the agent draws console diagrams as mermaid; rich pages go on r3 (see `.omp/AGENTS.md` § Talking to the user).
