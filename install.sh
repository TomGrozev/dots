#!/bin/bash

# Dotfiles install script
# Symlinks dotfiles from ~/dotfiles to ~ and installs plugins

set -e

DOTFILES_DIR="$(cd "$(dirname "$0")" && pwd)"

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
  research
  resolving-merge-conflicts
  setup-matt-pocock-skills
  tdd
  teach
  to-questionnaire
  to-spec
  to-tickets
  triage
  wait-what
  wayfinder
  wizard
  writing-for-agents
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

config_dirs=(gh ghostty nvim opencode cortexkit yazi zellij zjsh)

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

ZELLIJ_PLUGIN_NAMES=("zjstatus.wasm" "zjframes.wasm" "zjstatus-hints.wasm" "zellij-autolock.wasm" "harpoon.wasm")
ZELLIJ_PLUGIN_URLS=(
  "https://github.com/dj95/zjstatus/releases/latest/download/zjstatus.wasm"
  "https://github.com/dj95/zjstatus/releases/latest/download/zjframes.wasm"
  "https://github.com/b0o/zjstatus-hints/releases/latest/download/zjstatus-hints.wasm"
  "https://github.com/fresh2dev/zellij-autolock/releases/latest/download/zellij-autolock.wasm"
  "https://github.com/Nacho114/harpoon/releases/latest/download/harpoon.wasm"
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

# --- Install zjsh session launcher -----------------------------------------
echo ""
echo "Installing zjsh..."

LOCAL_BIN="$HOME/.local/bin"
mkdir -p "$LOCAL_BIN"

ZJSH_BIN="$LOCAL_BIN/zjsh"

if [ -x "$ZJSH_BIN" ]; then
  echo "  zjsh already installed, skipping"
else
  echo "  Downloading zjsh..."
  ZJSH_URL="https://github.com/tassis/zjsh/releases/download/v0.4.0/zjsh-v0.4.0-darwin-arm64.tar.gz"
  ZJSH_TMP=$(mktemp -d)
  curl -fL --progress-bar -o "$ZJSH_TMP/zjsh.tar.gz" "$ZJSH_URL" || {
    echo "    Warning: Failed to download zjsh"
    rm -rf "$ZJSH_TMP"
  }
  if [ -f "$ZJSH_TMP/zjsh.tar.gz" ]; then
    tar -xzf "$ZJSH_TMP/zjsh.tar.gz" -C "$ZJSH_TMP"
    mv "$ZJSH_TMP/zjsh" "$ZJSH_BIN"
    chmod +x "$ZJSH_BIN"
    rm -rf "$ZJSH_TMP"
    echo "  zjsh installed to ~/.local/bin/zjsh"
  fi
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

# --- Clean up Plannotator (replaced by r3) ---
if [ -f "$LOCAL_BIN/plannotator" ]; then
  echo ""
  echo "Removing old Plannotator (replaced by r3)..."
  rm -f "$LOCAL_BIN/plannotator"
  echo "  plannotator removed"
fi

# --- Install r3 (review tool) ---
echo ""
echo "Installing r3..."

if [ -x "$LOCAL_BIN/r3" ]; then
  echo "  r3 already installed, skipping"
else
  npm install -g --prefix "$HOME/.local" @hyperlogue/r3
  echo "  r3 installed to ~/.local/bin/r3"
fi

# --- Auto-configure r3 for Coder public URL ---
# Inside a Coder workspace, construct the workspace proxy URL for r3.
# Pattern: https://{port}--{agent}--{workspace}--{owner}.{domain}
if [ -n "${CODER_AGENT_URL:-}" ] && [ -n "${CODER_WORKSPACE_NAME:-}" ] && [ -n "${CODER_WORKSPACE_OWNER_NAME:-}" ]; then
  # Extract domain from CODER_AGENT_URL (e.g., https://dev.theg.house/ → dev.theg.house)
  CODER_DOMAIN="${CODER_AGENT_URL#*://}"
  CODER_DOMAIN="${CODER_DOMAIN%%/*}"
  CODER_DOMAIN="${CODER_DOMAIN%/}"

  # Lowercase all components — Coder proxy URLs are always lowercase
  AGENT_NAME=$(echo "${CODER_WORKSPACE_AGENT_NAME:-main}" | tr '[:upper:]' '[:lower:]')
  WS_NAME=$(echo "$CODER_WORKSPACE_NAME" | tr '[:upper:]' '[:lower:]')
  OWNER_NAME=$(echo "$CODER_WORKSPACE_OWNER_NAME" | tr '[:upper:]' '[:lower:]')

  # Read r3's configured port; fall back to r3's default (8791) if unset
  R3_PORT=$(r3 config get port 2>/dev/null)
  R3_PORT="${R3_PORT:-8791}"
  R3_URL="https://${R3_PORT}--${AGENT_NAME}--${WS_NAME}--${OWNER_NAME}.${CODER_DOMAIN}"

  r3 config set publicUrl "$R3_URL" 2>/dev/null
  r3 config set requireLogin 0 2>/dev/null
  echo "  r3 configured for Coder at $R3_URL"
else
  echo "  Not inside Coder — skipping r3 public URL config"
  echo "  (run: r3 config set publicUrl <url> && r3 config set requireLogin 0)"
fi

echo ""
echo "✅ Done! Restart your shell or run: source ~/.zshrc"
