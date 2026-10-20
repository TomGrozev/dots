# Dotfiles

My personal dotfiles, mainly used to set up dev pods and AI-assisted coding.

## What's Included

### Shell & Core
- **Zsh & Bash**: Full configuration (`.zshrc`, `.zshenv`, `.zprofile`, `.bashrc`) including Oh My Zsh and Powerlevel10k.
- **Environment**: Tool versions via [asdf](https://asdf.io/) (`.tool-versions`).
- **FZF**: Shell integration (`.fzf.bash`, `.fzf.zsh`).

### AI Agent Tooling
- **OMP (Orchestrator)**: High-level agent management, roles, skills, and rules (`.omp/`).
- **Codebase Memory**: Knowledge graph MCP for structural codebase analysis.
- **Companion Tools**: Captain Miao (session manager) and r3 (review tool).
- **CortexKit**: AI toolkit integration (`.cortexkit/`, `.config/cortexkit/`).

### Editor & Git
- **Neovim**: LazyVim-based configuration with custom development plugins (`.config/nvim/`).
- **Git**: GPG signing, delta pager, and global ignores (`.gitconfig`, `.gitignore_global`).
- **Git Bot Identity**: Separate git identity for agent-made commits (`.config/git-bot-identity/`).

### Terminal & System
- **Ghostty**: Modern terminal configuration (`.config/ghostty/`).
- **Zellij**: Multiplexer setup (`.config/zellij/`).
- **Yazi**: Terminal file manager (`.config/yazi/`).
- **GitHub CLI**: gh configuration (`.config/gh/`).
- **Safety Net**: CC-safety-net policy management (`.cc-safety-net/`).

## Setup

### Quick Install
```bash
cd ~
git clone https://github.com/TomGrozev/dots dotfiles
cd dotfiles
./install.sh
```

The install script performs the following:
1. **Symlinks**: Maps dotfiles from `~/dotfiles` to home directory, backing up existing files with `.bak`.
2. **Shell**: Installs Oh My Zsh and required plugins (syntax highlighting, autosuggestions) and Powerlevel10k.
3. **Tooling**: Installs binaries for `codebase-memory-mcp`, `captain-miao`, and `r3`.
4. **Configuration**: Sets up `.config/` subdirectories for `gh`, `nvim`, `ghostty`, `yazi`, `zellij`, `cortexkit`, and `captain-miao`.
5. **Agents**: Installs essential agent skills (Matt Pocock engineering skills, conventional-commit, frontend-design) via npm.
6. **Integration**: Configures `r3` public URLs for Coder workspaces.
7. **Arch Linux packages**: On Arch hosts only, installs `packages/arch.txt` with pacman and `packages/aur.txt` with yay (bootstrapped if missing), and on any Linux host without omp, downloads the latest omp release into `~/.local/bin`. Find packages installed outside the lists with `pacman -Qqen` (repo) and `pacman -Qqem` (AUR).

### Agent Pod Mode
An agent pod clones this repo at startup and runs the installer in its lean
profile:

```bash
AGENT_POD=true bash install.sh
```

The pod's image already carries omp, node, git, gh, zsh and the CLI tools
(`miao`, `miao-server`, `zellij`, `d2`, …), so this mode skips the shell installs
(oh-my-zsh, p10k), the interactive wiring (dotfile and `~/.config` symlinks,
Zellij plugins, `r3`, the captain-miao dashboard) and the devcontainer's
`config-devcontainer.yml` overlay. It links the authored
agent config — `~/.omp/agent/` gets `mcp.json`, `AGENTS.md`, `RULES.md`,
`agents/`, `rules/`, `extensions/`, `skills/{implement,walkthrough,land}` and
`pairing-workflow.html` — plus the
cc-safety-net policy, the omp plugins (`cc-safety-net` and the neuralwatt fork),
the `diagram` helper and the agent skills. Instead of linking `config.yml`, the
mode bakes `.omp/config-agent-pod.yml` into it with `.omp/merge-config.py` (the
same mechanism the devcontainer uses for `config-devcontainer.yml`), and links
`.omp/APPEND_SYSTEM-agent-pod.md` to `~/.omp/agent/APPEND_SYSTEM.md`, which omp
appends to the main session's system prompt. The image itself ships no omp
config, and its `skills.includeSkills` allowlist in that overlay decides which
installed skills the pod's agent can actually read.

Binary installs that the image does not ship still run in this mode, because each
is guarded by a presence check: `codebase-memory-mcp` lands in `~/.local/bin` on
a fresh pod, and is a no-op wherever it already exists.

### Manual Installation
If you prefer not to use the script, manually symlink the required files:
```bash
ln -s ~/dotfiles/.zshrc ~/.zshrc
ln -s ~/dotfiles/.gitconfig ~/.gitconfig
# ... etc.
```

## Docs
For detailed information on specific components, see the documentation:
- [AI Agent Tooling](docs/ai-agents.md) - Detail on OMP and supporting tools.

