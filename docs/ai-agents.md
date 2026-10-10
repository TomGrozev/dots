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
  - **Skills**: Found in `.omp/skills/` (internal) and `~/.agents/skills/` (universal). `to-tickets` and `implement` are local forks of Matt Pocock's skills, edited directly; installed from upstream are `pr`, `retro` and `implement-spec` alongside our `calibrate`.
  - **Naming**: the domain-terms file is `GLOSSARY.md` and the coding-standards file is `CODING_STANDARDS.md` (repo root; in a fork, under `.omp/`). Their existence marks the repo as onboarded.
  - **Prose rule**: workflow prose avoids em-dashes (U+2014); upstream adopted the same ban after a careless sweep once broke YAML front matter in a skill file.
  - **Rules**: Global and role-specific guardrails in `.omp/RULES.md` and `.omp/rules/`, including the stack packs (`stack-elixir`, `stack-phoenix`, `stack-typescript`).
  - **Hooks**: Pre/post-execution hooks in `.omp/hooks/`.
  - **Extensions**: Custom functionality plugins in `.omp/extensions/`.
- **Monitoring**: `WATCHDOG.md` describes the automated oversight process.
- **Workflow**: See [pairing-workflow.md](pairing-workflow.md) for the collaboration map and [flow diagram](pairing-workflow.html).

## OpenCode

A set of tools for AI-powered code generation and interaction.
- Configuration is located in `.config/opencode/`.

## Companion Tools

- **Captain Miao**: Session manager and dashboard. Binary installed via `install.sh`.
- **r3**: Review tool for human-agent handoffs. Installed via npm.
- **Codebase Memory MCP**: Provides a knowledge graph of the repository. Installed as a binary.
- **CortexKit**: AI toolkit integration found in `.cortexkit/` and `.config/cortexkit/`.
- **Git Bot Identity**: Specialized extension for managing AI bot identities. See the [Git Bot Identity README](../.omp/extensions/git-bot-identity/README.md).
- **d2**: diagram renderer, run through `bin/diagram` (linked into `~/.local/bin`), which shows images where omp can (Ghostty, kitty, WezTerm, iTerm2) and tells the agent to use mermaid elsewhere. Binary installed via `install.sh`.
