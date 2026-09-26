# Dotfiles

My personal dotfiles, mainly used to set up dev pods and AI-assisted coding.

## What's Included

### Shell & Core
- **Zsh & Bash**: Full configuration (`.zshrc`, `.zshenv`, `.zprofile`, `.bashrc`, `.profile`) including Oh My Zsh and Powerlevel10k.
- **Environment**: Specialized agent environment (`.agent-env.sh`) and tool versions via [asdf](https://asdf.io/) (`.tool-versions`).
- **FZF**: Shell integration (`.fzf.bash`, `.fzf.zsh`).

### AI Agent Tooling
- **OMP (Orchestrator)**: High-level agent management, roles, skills, and rules (`.omp/`).
- **OpenCode**: AI-powered code interaction tools (`.config/opencode/`).
- **Codebase Memory**: Knowledge graph MCP for structural codebase analysis.
- **Companion Tools**: Captain Miao (session manager) and r3 (review tool).
- **CortexKit**: AI toolkit integration (`.cortexkit/`, `.config/cortexkit/`).

### Editor & Git
- **Neovim**: LazyVim-based configuration with custom AI and development plugins (`.config/nvim/`).
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
4. **Configuration**: Sets up `.config/` subdirectories for `gh`, `nvim`, `opencode`, `ghostty`, `yazi`, `zellij`, `cortexkit`, and `captain-miao`.
5. **Agents**: Installs essential agent skills (Matt Pocock engineering skills, conventional-commit, frontend-design) via npm.
6. **Integration**: Configures `r3` public URLs for Coder workspaces.

### Manual Installation
If you prefer not to use the script, manually symlink the required files:
```bash
ln -s ~/dotfiles/.zshrc ~/.zshrc
ln -s ~/dotfiles/.gitconfig ~/.gitconfig
# ... etc.
```

## Docs
For detailed information on specific components, see the documentation:
- [AI Agent Tooling](docs/ai-agents.md) - Detail on OMP, OpenCode, and supporting tools.

