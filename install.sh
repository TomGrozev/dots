#!/bin/bash

# Dotfiles install script
# Symlinks dotfiles from ~/dotfiles to ~ and installs plugins

set -e

DOTFILES_DIR="$(cd "$(dirname "$0")" && pwd)"
ZSH_CUSTOM="${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}"

# Matt Pocock engineering skills to install for opencode
MATT_POCOCK_SKILLS=(
  ask-matt
  codebase-design
  diagnosing-bugs
  domain-modeling
  grill-me
  grill-with-docs
  grilling
  handoff
  improve-codebase-architecture
  prototype
  setup-matt-pocock-skills
  tdd
  teach
  to-issues
  to-prd
  triage
  writing-great-skills
  review
  design-an-interface
  implement
)

# --- Install Oh My Zsh ------------------------------------------------------

echo ""
echo "Installing Oh My Zsh..."

if [ -d "$HOME/.oh-my-zsh" ]; then
  echo "  Oh My Zsh already installed, skipping"
else
  echo "  Installing Oh My Zsh..."
  curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh | sh -s -- --unattended
fi

# --- Symlink dotfiles ---
echo "Creating symlinks..."

files=(
  .gitconfig
  .gitignore_global
  .zshrc
  .zshenv
  .zprofile
  .p10k.zsh
  .bashrc
  .fzf.zsh
  .fzf.bash
  .tool-versions
)

for file in "${files[@]}"; do
  target="$HOME/$file"
  source="$DOTFILES_DIR/$file"

  if [ -e "$target" ] && [ ! -L "$target" ]; then
    echo "  Backing up existing $file → ${file}.bak"
    mv "$target" "${target}.bak"
  fi

  ln -sfn "$source" "$target"
  echo "  Linked $file"
done

# --- Symlink .config subdirectories ---
echo ""
echo "Creating .config symlinks..."

config_dirs=(gh nvim opencode)

mkdir -p "$HOME/.config"

for dir in "${config_dirs[@]}"; do
  target="$HOME/.config/$dir"
  source="$DOTFILES_DIR/.config/$dir"

  if [ -e "$target" ] && [ ! -L "$target" ]; then
    echo "  Backing up existing .config/$dir → .config/${dir}.bak"
    mv "$target" "${target}.bak"
  fi

  ln -sfn "$source" "$target"
  echo "  Linked .config/$dir"
done

# --- Install Oh My Zsh plugins ---
echo ""
echo "Installing Oh My Zsh plugins..."

plugins=(
  "zsh-users/zsh-syntax-highlighting"
  "zsh-users/zsh-autosuggestions"
  "MichaelAquilina/zsh-you-should-use"
  "fdellwing/zsh-bat"
  "Aloxaf/fzf-tab"
)

for plugin in "${plugins[@]}"; do
  plugin_name=$(basename "$plugin")
  plugin_dir="$ZSH_CUSTOM/plugins/$plugin_name"

  if [ -d "$plugin_dir" ]; then
    echo "  $plugin_name already installed, updating..."
    (cd "$plugin_dir" && git pull --quiet)
  else
    echo "  Installing $plugin_name..."
    git clone --quiet "https://github.com/$plugin" "$plugin_dir"
  fi
done

# --- Install Powerlevel10k theme ---
echo ""
echo "Installing Powerlevel10k theme..."

p10k_dir="$ZSH_CUSTOM/themes/powerlevel10k"

if [ -d "$p10k_dir" ]; then
  echo "  Powerlevel10k already installed, updating..."
  (cd "$p10k_dir" && git pull --quiet)
else
  echo "  Installing Powerlevel10k..."
  git clone --quiet --depth=1 "https://github.com/romkatv/powerlevel10k.git" "$p10k_dir"
fi

# --- Install opencode npm dependencies ---
echo ""
echo "Installing opencode npm dependencies..."

if command -v npm &>/dev/null; then
  (cd "$DOTFILES_DIR/.config/opencode" && npm install --production)
  echo "  opencode dependencies installed"
  
  echo "  Installing Matt Pocock skills for opencode..."
  matt_pocock_skill_args=()
  for skill in "${MATT_POCOCK_SKILLS[@]}"; do
    matt_pocock_skill_args+=(-s "$skill")
  done
  npx skills add mattpocock/skills "${matt_pocock_skill_args[@]}" -a opencode -y -g
  npx skills add https://github.com/github/awesome-copilot --skill conventional-commit -y -g -a opencode
  npx skills add https://github.com/anthropics/skills --skill frontend-design -y -g -a opencode
else
  echo "  npm not found. Install Node.js to get opencode plugin dependencies."
fi

# --- Install Plannotator ---
echo ""
echo "Installing Plannotator..."

if command -v plannotator &>/dev/null; then
  echo "  plannotator already installed, skipping"
else
  curl -fsSL https://plannotator.ai/install.sh | bash
  echo "  plannotator installed"
fi

echo ""
echo "✅ Done! Restart your shell or run: source ~/.zshrc"




