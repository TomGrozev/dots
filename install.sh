#!/bin/bash

# Dotfiles install script
# Symlinks dotfiles from ~/dotfiles to ~ and installs plugins

set -e

DOTFILES_DIR="$(cd "$(dirname "$0")" && pwd)"
# --- Initialize git submodules (e.g. .tmux) -----------------------------------
echo ""
echo "Initializing git submodules..."
git submodule update --init --recursive || echo "  Warning: submodule init failed (check network)"

ZSH_CUSTOM="${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}"

# Matt Pocock engineering skills to install for opencode
MATT_POCOCK_SKILLS=(
  ask-matt
  code-review
  codebase-design
  diagnosing-bugs
  domain-modeling
  grill-me
  grill-with-docs
  grilling
  handoff
  implement
  improve-codebase-architecture
  prototype
  setup-matt-pocock-skills
  tdd
  teach
  to-spec
  to-tickets
  triage
  wayfinder
  writing-great-skills
  design-an-interface
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

config_dirs=(gh ghostty nvim opencode cortexkit yazi zellij)

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

# --- Download Zellij WASM plugins ------------------------------------------
echo ""
echo "Downloading Zellij plugins..."

ZELLIJ_PLUGIN_DIR="$HOME/.config/zellij/plugins"
mkdir -p "$ZELLIJ_PLUGIN_DIR"

ZELLIJ_PLUGIN_NAMES=("zjstatus.wasm" "zjframes.wasm" "zjstatus-hints.wasm" "zellij_forgot.wasm")
ZELLIJ_PLUGIN_URLS=(
  "https://github.com/dj95/zjstatus/releases/latest/download/zjstatus.wasm"
  "https://github.com/dj95/zjstatus/releases/latest/download/zjframes.wasm"
  "https://github.com/b0o/zjstatus-hints/releases/latest/download/zjstatus-hints.wasm"
  "https://github.com/karimould/zellij-forgot/releases/download/0.4.2/zellij_forgot.wasm"
)

for i in "${!ZELLIJ_PLUGIN_NAMES[@]}"; do
  plugin_name="${ZELLIJ_PLUGIN_NAMES[$i]}"
  plugin_url="${ZELLIJ_PLUGIN_URLS[$i]}"
  plugin_path="$ZELLIJ_PLUGIN_DIR/$plugin_name"

  if [ -f "$plugin_path" ]; then
    echo "  $plugin_name already downloaded, skipping"
  else
    echo "  Downloading $plugin_name..."
    curl -fL --progress-bar -o "$plugin_path" "$plugin_url" || {
      echo "    Warning: Failed to download $plugin_name"
    }
  fi
done

# --- Symlink tmux config (gpakosz/.tmux, a git submodule) --------------------
echo ""
echo "Creating tmux config symlinks..."
if [ -e "$DOTFILES_DIR/.tmux/.tmux.conf" ]; then
  tmux_target="$HOME/.tmux.conf"
  if [ -e "$tmux_target" ] && [ ! -L "$tmux_target" ]; then
    echo "  Backing up existing .tmux.conf -> .tmux.conf.bak"
    mv "$tmux_target" "${tmux_target}.bak"
  fi
  ln -sfn "$DOTFILES_DIR/.tmux/.tmux.conf" "$tmux_target"
  echo "  Linked .tmux.conf"

  tmux_local_target="$HOME/.tmux.conf.local"
  tmux_local_source="$DOTFILES_DIR/.tmux.conf.local"
  if [ -e "$tmux_local_target" ] && [ ! -L "$tmux_local_target" ]; then
    echo "  Backing up existing .tmux.conf.local -> .tmux.conf.local.bak"
    mv "$tmux_local_target" "${tmux_local_target}.bak"
  fi
  ln -sfn "$tmux_local_source" "$tmux_local_target"
  echo "  Linked .tmux.conf.local"
  echo "  (tmux plugins auto-install on first tmux launch when configured)"
else
  echo "  .tmux submodule not found; run: git submodule update --init --recursive"
fi

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

  echo "  Remove all existing skills..."
  rm -rf "$HOME/.agents/skills/" || true

  echo "  Installing skills for opencode..."
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
