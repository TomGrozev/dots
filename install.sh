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

# --- Link omp (Oh My Pi) config ---
# ~/.omp/agent/ holds runtime state (agent.db, sessions/, memories/) alongside
# authored config, so individual entries are linked rather than the directory.
echo ""
echo "Linking omp config..."

OMP_AGENT_DIR="$HOME/.omp/agent"
mkdir -p "$OMP_AGENT_DIR"

omp_entries=(config.yml mcp.json AGENTS.md RULES.md agents extensions)

for entry in "${omp_entries[@]}"; do
  source="$DOTFILES_DIR/.omp/$entry"
  target="$OMP_AGENT_DIR/$entry"

  [ -e "$source" ] || continue

  if [ -e "$target" ] && [ ! -L "$target" ]; then
    echo "  Backing up existing $entry → ${entry}.bak"
    mv "$target" "${target}.bak"
  fi

  ln -sfn "$source" "$target"
  echo "  Linked ~/.omp/agent/$entry"
done

# --- Install cc-safety-net plugin for omp ---
# cc-safety-net v2: PreToolUse hook blocking destructive commands (rm -rf, git reset
# --hard, git push --force, etc.) and secret-file reads (~/.ssh/*, .env, ~/.aws, …).
# Installed as an omp npm plugin into ~/.omp/plugins/. omp's plugin state is runtime-
# managed (package.json + omp-plugins.lock.json), so we run the installer rather than
# committing a manifest. Idempotent: re-running on an already-installed plugin is a no-op.
# Strict preset: set CC_SAFETY_NET_LEVEL=strict in the environment (e.g. .zshenv) —
# check the cc-safety-net docs for the canonical pinning method before adding it.
if command -v omp &>/dev/null; then
  echo ""
  echo "Installing cc-safety-net plugin for omp..."
  omp install cc-safety-net
fi

# --- Link cc-safety-net policy ---
# Policy file is declarative and never overwritten at runtime — safe to symlink.
# strict preset: fail-closed on unparseable commands. Other fields default per docs.
CCSN_DIR="$HOME/.cc-safety-net"
mkdir -p "$CCSN_DIR"
ln -sfn "$DOTFILES_DIR/.cc-safety-net/policy.json" "$CCSN_DIR/policy.json"
echo "  Linked ~/.cc-safety-net/policy.json"

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

# --- Install codebase-memory-mcp -------------------------------------------
echo ""
echo "Installing codebase-memory-mcp..."

CODEBASE_MEMORY_MCP_BIN="$LOCAL_BIN/codebase-memory-mcp"

if [ -x "$CODEBASE_MEMORY_MCP_BIN" ]; then
  echo "  codebase-memory-mcp already installed, skipping"
else
  echo "  Downloading codebase-memory-mcp..."

  # Detect OS
  UNAME_OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
  case "$UNAME_OS" in
    darwin) OS_PART="darwin" ;;
    linux)  OS_PART="linux" ;;
    *)
      echo "    Error: unsupported OS '$UNAME_OS' (only darwin and linux are supported)" >&2
      exit 1
      ;;
  esac

  # Detect architecture
  UNAME_ARCH="$(uname -m)"
  case "$UNAME_ARCH" in
    arm64|aarch64) ARCH_PART="arm64" ;;
    x86_64|amd64)  ARCH_PART="amd64" ;;
    *)
      echo "    Error: unsupported architecture '$UNAME_ARCH'" >&2
      exit 1
      ;;
  esac

  # Upstream naming convention: Linux uses the -portable archive variant
  if [ "$OS_PART" = "linux" ]; then
    ARCHIVE_NAME="codebase-memory-mcp-${OS_PART}-${ARCH_PART}-portable.tar.gz"
  else
    ARCHIVE_NAME="codebase-memory-mcp-${OS_PART}-${ARCH_PART}.tar.gz"
  fi

  RELEASE_BASE="https://github.com/DeusData/codebase-memory-mcp/releases/latest/download"
  ARCHIVE_URL="$RELEASE_BASE/$ARCHIVE_NAME"
  CHECKSUMS_URL="$RELEASE_BASE/checksums.txt"

  TMPDIR="$(mktemp -d)"
  trap 'rm -rf "$TMPDIR"' EXIT
  ARCHIVE_PATH="$TMPDIR/$ARCHIVE_NAME"
  CHECKSUMS_PATH="$TMPDIR/checksums.txt"

  curl -fL --progress-bar -o "$ARCHIVE_PATH" "$ARCHIVE_URL"
  curl -fL --progress-bar -o "$CHECKSUMS_PATH" "$CHECKSUMS_URL"

  # Verify SHA-256 checksum
  if command -v sha256sum >/dev/null 2>&1; then
    ACTUAL_SHA="$(sha256sum "$ARCHIVE_PATH" | awk '{print $1}')"
  elif command -v shasum >/dev/null 2>&1; then
    ACTUAL_SHA="$(shasum -a 256 "$ARCHIVE_PATH" | awk '{print $1}')"
  else
    echo "    Error: neither sha256sum nor shasum found; cannot verify checksum" >&2
    exit 1
  fi

  EXPECTED_SHA="$(awk -v f="$ARCHIVE_NAME" '$2==f {print $1}' "$CHECKSUMS_PATH")"
  if [ -z "$EXPECTED_SHA" ]; then
    echo "    Error: no checksum entry for $ARCHIVE_NAME in checksums.txt" >&2
    exit 1
  fi

  if [ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]; then
    echo "    Error: SHA-256 mismatch for $ARCHIVE_NAME" >&2
    echo "      expected: $EXPECTED_SHA" >&2
    echo "      actual:   $ACTUAL_SHA" >&2
    exit 1
  fi

  # Extract archive and install binary
  tar -xzf "$ARCHIVE_PATH" -C "$TMPDIR"
  if [ ! -f "$TMPDIR/codebase-memory-mcp" ]; then
    echo "    Error: archive did not contain a 'codebase-memory-mcp' binary" >&2
    exit 1
  fi
  mv "$TMPDIR/codebase-memory-mcp" "$CODEBASE_MEMORY_MCP_BIN"
  chmod +x "$CODEBASE_MEMORY_MCP_BIN"

  echo "  codebase-memory-mcp installed to ~/.local/bin/codebase-memory-mcp"
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
