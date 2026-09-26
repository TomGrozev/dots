# AI Agent Tooling

This repository integrates several tools for AI-assisted coding, centered around the `omp` orchestrator and `opencode`.

## OMP (Orchestrator)

The orchestrator manages agent sessions, roles, and tool integrations.

- **Configuration**: 
  - `.omp/config.yml`: Primary configuration for models, agents, and settings.
  - `.omp/config-devcontainer.yml`: Devcontainer-specific overrides.
  - `.omp/merge-config.py`: Script to merge the above configurations.
- **Knowledge Graph**: `mcp.json` defines the Model Context Protocol server connections (e.g., `codebase-memory-mcp`).
- **Agent Ecosystem**:
  - **Roster**: Defined in `.omp/AGENTS.md`.
  - **Skills**: Found in `.omp/skills/` (internal) and `~/.agents/skills/` (universal).
  - **Rules**: Global and role-specific guardrails in `.omp/RULES.md` and `.omp/rules/`.
  - **Hooks**: Pre/post-execution hooks in `.omp/hooks/`.
  - **Extensions**: Custom functionality plugins in `.omp/extensions/`.
- **Monitoring**: `WATCHDOG.md` describes the automated oversight process.
- **Workflow**: See [pairing-workflow.md](pairing-workflow.md) for an overview of the pairing model, with a [flow diagram](pairing-workflow.html).

## OpenCode

A set of tools for AI-powered code generation and interaction.
- Configuration is located in `.config/opencode/`.

## Companion Tools

- **Captain Miao**: Session manager and dashboard. Binary installed via `install.sh`.
- **r3**: Review tool for human-agent handoffs. Installed via npm.
- **Codebase Memory MCP**: Provides a knowledge graph of the repository. Installed as a binary.
- **CortexKit**: AI toolkit integration found in `.cortexkit/` and `.config/cortexkit/`.
- **Git Bot Identity**: Specialized extension for managing AI bot identities. See the [Git Bot Identity README](../.omp/extensions/git-bot-identity/README.md).
