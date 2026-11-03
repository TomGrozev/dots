# AI Agent Tooling

This repository integrates several tools for AI-assisted coding, centered around the `omp` orchestrator.

## OMP (Orchestrator)

The orchestrator manages agent sessions, roles, and tool integrations.

- **Configuration**: 
  - `.omp/config.yml`: Primary configuration for models, agents, and settings.
  - `.omp/config-agent-pod.yml`: Agent-pod overrides, merged into `config.yml` by `install.sh` under `AGENT_POD=true`.
  - `.omp/config-devcontainer.yml`: Devcontainer-specific overrides.
  - `.omp/merge-config.py`: Script to merge the above configurations.
- **Knowledge Graph**: `mcp.json` defines the Model Context Protocol server connections (e.g., `codebase-memory-mcp`).
- **Agent Ecosystem**:
  - **Roster**: Defined in `.omp/AGENTS.md`.
  - **Agent files**: subagent definitions in `.omp/agents/`. Each `model:` is a role alias from `modelRoles` in `.omp/config.yml`.
  - **Skills**: Found in `.omp/skills/` (local) and `~/.agents/skills/` (upstream). `to-tickets`, `implement` and `implement-spec` are local forks of Matt Pocock's skills, edited directly; `install.sh` removes their upstream copies so the local ones shadow them. `land`, `onboard`, `calibrate` and `writing-prose` are written here from scratch. `security-review` comes from `getsentry/skills` and installs on the laptop only.
  - **Naming**: the domain-terms file is `GLOSSARY.md` and the coding-standards file is `CODING_STANDARDS.md` (repo root; in a fork, under `.omp/`). Their existence marks the repo as onboarded.
  - **Prose rule**: workflow prose avoids em-dashes (U+2014); upstream adopted the same ban after a careless sweep once broke YAML front matter in a skill file.
  - **Report**: each project agent defines an `output` schema in its file that fits its job (`task.structured: true` in `.omp/config.yml`); a built-in worker (`task`, `scout`, `sonic`) gets an `outputSchema` only when Main needs to read single fields.
  - **Rules**: Global and role-specific guardrails in `.omp/RULES.global.md` (installed as `~/.omp/agent/RULES.md`) and `.omp/rules/`, including the stack packs (`stack-elixir`, `stack-phoenix`, `stack-typescript`).
  - **Extensions**: Custom functionality plugins in `.omp/extensions/`.
- **Monitoring**: `WATCHDOG.md` describes the automated oversight process.
- **Workflow**: See the [agent workflow](agent-workflow.html) for the collaboration map.

## Companion Tools

- **Captain Miao**: Session manager and dashboard. Binary installed via `install.sh`.
- **r3**: Review tool for human-agent handoffs. Installed via npm.
- **Codebase Memory MCP**: Provides a knowledge graph of the repository. Installed as a binary.
- **Git Bot Identity**: Specialized extension for managing AI bot identities. See the [Git Bot Identity README](../.omp/extensions/git-bot-identity/README.md).
- **Diagrams**: the agent draws console diagrams as mermaid; rich pages go on r3 (see `.omp/AGENTS.md` § Talking to the user).
