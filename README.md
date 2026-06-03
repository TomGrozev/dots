# Dotfiles

These are by personal dot files that I use to setup mainly dev pods.

## What's Included

- **Shell**: Bash (`.bashrc`, `.fzf.bash`) and Zsh (`.zshrc`, `.zshenv`, `.zprofile`) configs with Oh My Zsh + Powerlevel10k
- **Git**: GPG signing, delta pager, global ignores (`.gitconfig`, `.gitignore_global`)
- **Editor**: Neovim/LazyVim configuration (`.config/nvim`)
- **CLI Tools**: GitHub CLI (`.config/gh`), opencode (`.config/opencode`)
- **Terminal**: Powerlevel10k theme (`.p10k.zsh`), FZF integration (`.fzf.bash`, `.fzf.zsh`)
- **Version Manager**: asdf (`.tool-versions`)

## Prerequisites

- Unix-like system (macOS, Linux)
- Zsh
- Git with GPG signing configured
- [Oh My Zsh](https://ohmyz.sh/) (installed automatically)
- [asdf](https://asdf.io/) for version management

## Quick Setup

```bash
cd ~
git clone https://github.com/tomgrozev/dotfiles.git
cd dotfiles
./install.sh
```

The install script will:

1. Symlink dotfiles from `~/dotfiles` to your home directory
2. Back up any existing files with `.bak` suffix
3. Install Oh My Zsh plugins (zsh-syntax-highlighting, zsh-autosuggestions)
4. Install Powerlevel10k theme
5. Set up `.config/` subdirectories for gh, nvim, and opencode

TBH this install script was written by AI so I haven't tested. YOLO, have fun!

## Manual Installation

If you prefer not to run the install script, you can manually symlink the files:

```bash
ln -s ~/dotfiles/.zshrc ~/.zshrc
ln -s ~/dotfiles/.gitconfig ~/.gitconfig
# ... etc.
```

