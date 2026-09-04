#!/bin/bash

# Dotfiles install script
# Symlinks dotfiles from ~/dotfiles to ~ and installs plugins and tools.

set -e

DOTFILES_DIR="$(cd "$(dirname "$0")" && pwd)"
ZSH_CUSTOM="${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}"
LOCAL_BIN="$HOME/.local/bin"
OMP_AGENT_DIR="$HOME/.omp/agent"

# Host platform detection (reused by the binary install blocks below).
UNAME_OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
UNAME_ARCH="$(uname -m)"

mkdir -p "$LOCAL_BIN" "$OMP_AGENT_DIR" "$HOME/.config"

# --- Helpers ---

# Symlink source → target, backing up any pre-existing real file/dir to *.bak.
# Skips (with a warning) when the source is absent, so stale entries surface
# instead of producing dangling symlinks.
link_entry() {
  local source="$1" target="$2" label="$3"
  if [ ! -e "$source" ]; then
    echo "  Skipping $label (source not found: $source)"
    return 0
  fi
  if [ -e "$target" ] && [ ! -L "$target" ]; then
    echo "  Backing up existing $label → ${label}.bak"
    mv "$target" "${target}.bak"
  fi
  ln -sfn "$source" "$target"
  echo "  Linked $label"
}

# --- Install Oh My Zsh ---
echo ""
echo "Installing Oh My Zsh..."

if [ -d "$HOME/.oh-my-zsh" ]; then
  echo "  Oh My Zsh already installed, skipping"
else
  echo "  Installing Oh My Zsh..."
  curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh | sh -s -- --unattended
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

# --- Symlink dotfiles ---
echo ""
echo "Creating symlinks..."

files=(
  .gitconfig
  .gitignore_global
  .zshrc
  .zshenv
  .zprofile
  .profile
  .agent-env.sh
  .p10k.zsh
  .bashrc
  .fzf.zsh
  .fzf.bash
  .tool-versions
)

for file in "${files[@]}"; do
  link_entry "$DOTFILES_DIR/$file" "$HOME/$file" "$file"
done

# --- Symlink .config subdirectories ---
echo ""
echo "Creating .config symlinks..."

config_dirs=(gh ghostty nvim opencode cortexkit yaji zellij)

for dir in "${config_dirs[@]}"; do
  link_entry "$DOTFILES_DIR/.config/$dir" "$HOME/.config/$dir" ".config/$dir"
done

# --- Link captain-miao config ---
# config.toml is symlinked on the laptop so `pooled` stays unset (direct-local,
# the default). Dev containers bake a *copy* with `pooled = true` instead,
# mirroring the omp config.yml bake: pooling is a per-host role, and it has to
# live in config.toml itself. dashboard-overrides.json is the dashboard's own
# runtime store (pin/follow-up/default_agent/…) and gets rewritten by the
# dashboard on every save — it has no `pooled` key, so a setting written there
# is both never read and promptly clobbered.
captain_miao_src="$DOTFILES_DIR/.config/captain-miao"
captain_miao_dst="$HOME/.config/captain-miao"
if [ ! -d "$captain_miao_src" ]; then
  echo "  Skipping .config/captain-miao (source not found: $captain_miao_src)"
elif [ "${DEVCONTAINER:-}" = "true" ]; then
  echo ""
  echo "Baking captain-miao config with pooled mode..."
  # The destination may be a directory symlink left by an earlier install
  # (or the laptop path); it must become a real directory, not a link through
  # which the baked file would land back in ~/dotfiles.
  if [ -L "$captain_miao_dst" ]; then
    rm -f "$captain_miao_dst"
  fi
  mkdir -p "$captain_miao_dst"
  # Back up a real (non-symlink) existing file, matching link_entry.
  if [ -e "$captain_miao_dst/config.toml" ] && [ ! -L "$captain_miao_dst/config.toml" ]; then
    mv "$captain_miao_dst/config.toml" "$captain_miao_dst/config.toml.bak"
  fi
  if awk -f - "$captain_miao_src/config.toml" >"$captain_miao_dst/config.toml" <<'AWK'; then
/^[[:space:]]*\[/ && $0 !~ /^[[:space:]]*\[launcher\]/ { in_launcher = 0 }
/^[[:space:]]*\[launcher\]/ { print; print "pooled = true"; in_launcher = 1; next }
in_launcher && /^[[:space:]]*pooled[[:space:]]*=/ { next }
{ print }
AWK
    echo "  Wrote $captain_miao_dst/config.toml with pooled = true"
  else
    echo "  WARNING: bake failed, falling back to a plain symlink (pooled stays off)"
    rm -f "$captain_miao_dst/config.toml"
    link_entry "$captain_miao_src" "$captain_miao_dst" ".config/captain-miao"
  fi
else
  link_entry "$captain_miao_src" "$captain_miao_dst" ".config/captain-miao"
fi

# --- Link omp (Oh My Pi) config ---
# ~/.omp/agent/ holds runtime state (agent.db, sessions/, memories/) alongside
# authored config, so individual entries are linked rather than the directory.
echo ""
echo "Linking omp config..."

omp_entries=(config.yml config-devcontainer.yml models.yml mcp.json AGENTS.md RULES.md agents extensions rules)

for entry in "${omp_entries[@]}"; do
  # config.yml is handled below in devcontainers: baked with the overlay
  # merged in, not symlinked (see the block after this loop).
  if [ "$entry" = "config.yml" ] && [ "${DEVCONTAINER:-}" = "true" ] && [ -f "$DOTFILES_DIR/.omp/config-devcontainer.yml" ]; then
    continue
  fi
  link_entry "$DOTFILES_DIR/.omp/$entry" "$OMP_AGENT_DIR/$entry" "~/.omp/agent/$entry"
done

# --- Link pi voice STT config ---
# Authored copy of the pi-voice-stt (Soniox) settings read from ~/.pi/agent/stt.json.
link_entry "$DOTFILES_DIR/.pi/stt.json" "$HOME/.pi/agent/stt.json" ".pi/agent/stt.json"

# --- Devcontainer: bake config-devcontainer.yml into config.yml ---
# A PI_CONFIG_FILES env var could select this overlay dynamically for shells that
# source it - but captain-miao's remote/pooled session spawn never runs a shell at
# all (miao-server launches the agent binary directly with a hardcoded minimal
# env), so that env var would never reach it. Deep-merge the overlay into
# config.yml itself at install time instead, so the file omp loads by default
# already has it - no env var required. Arrays replace wholesale (documented in
# config-devcontainer.yml's own header), matching PI_CONFIG_FILES's merge semantics
# exactly (verified: both routes resolve tools.approvalMode to "yolo" identically).
# Falls back to a plain symlink of the base config.yml if python3/pip/pyyaml is
# unavailable - that fails safe (restrictive approvalMode) rather than silently
# leaving no config.yml at all.
if [ "${DEVCONTAINER:-}" = "true" ] && [ -f "$DOTFILES_DIR/.omp/config-devcontainer.yml" ]; then
  echo ""
  echo "Baking devcontainer overlay into config.yml..."
  if command -v python3 >/dev/null 2>&1 &&
    python3 -m pip install --quiet --user --break-system-packages pyyaml >/dev/null 2>&1 &&
    python3 "$DOTFILES_DIR/.omp/merge-config.py" \
      "$DOTFILES_DIR/.omp/config.yml" \
      "$DOTFILES_DIR/.omp/config-devcontainer.yml" \
      "$OMP_AGENT_DIR/config.yml"; then
    echo "  Wrote merged config.yml"
  else
    echo "  WARNING: merge failed (python3/pyyaml unavailable?) - falling back to plain config.yml symlink"
    echo "  (devcontainer overlay will NOT apply - approvalMode stays restrictive until python3/pyyaml"
    echo "  is available and install.sh is re-run)"
    link_entry "$DOTFILES_DIR/.omp/config.yml" "$OMP_AGENT_DIR/config.yml" "~/.omp/agent/config.yml"
  fi
fi

# --- Link cc-safety-net policy ---
# Policy file is declarative and never overwritten at runtime — safe to symlink.
# strict preset: fail-closed on unparseable commands. Other fields default per docs.
echo ""
echo "Linking cc-safety-net policy..."

CCSN_DIR="$HOME/.cc-safety-net"
mkdir -p "$CCSN_DIR"
ln -sfn "$DOTFILES_DIR/.cc-safety-net/policy.json" "$CCSN_DIR/policy.json"
echo "  Linked ~/.cc-safety-net/policy.json"

# --- Install omp plugins ---
# omp npm plugins installed into ~/.omp/plugins/. omp's plugin state is runtime-
# managed (package.json + omp-plugins.lock.json), so we run the installer rather than
# committing a manifest. Idempotent: re-running on an already-installed plugin is a no-op.
# cc-safety-net: PreToolUse hook blocking destructive commands (rm -rf, git reset --hard,
# git push --force, etc.) and secret-file reads (~/.ssh/*, .env, ~/.aws, …). Strict
# preset: set CC_SAFETY_NET_LEVEL=strict in the environment (e.g. .zshenv) — check the
# cc-safety-net docs for the canonical pinning method before adding it.
OMP_PLUGINS=(cc-safety-net @mikefreno/omp-neuralwatt)

if command -v omp &>/dev/null; then
  for plugin in "${OMP_PLUGINS[@]}"; do
    echo ""
    echo "Installing $plugin plugin for omp..."
    omp install "$plugin"
  done
fi

# --- Install pi-voice-stt (Soniox STT fork) ---
# omp's plugin installer has no git-remote mode (npm specs, local paths, or
# marketplace refs only), so the fork is cloned to a stable path outside the
# dotfiles tree and linked from there. Linking the dotfiles checkout itself
# would break if the clone is cleaned up mid-session; ~/.local/share is the
# permanent home (plugins are referenced from ~/.omp/plugins/node_modules as
# a symlink). Fork: TomGrozev/pi-voice-stt, branch feat/soniox-provider —
# upstream PR cgarrot/pi-voice-stt#20 (Soniox cloud STT). When the PR merges
# and ships in a release, drop this block and add `pi-voice-stt` to OMP_PLUGINS
# above instead. No npm install needed: the extension has no runtime deps,
# only peerDependencies resolved from omp's bundled @earendil-works packages.
PI_VOICE_STT_DIR="$HOME/.local/share/pi-voice-stt"
PI_VOICE_STT_BRANCH="feat/soniox-provider"

echo ""
echo "Installing pi-voice-stt (Soniox STT fork)..."

if [ -d "$PI_VOICE_STT_DIR/.git" ]; then
  echo "  Updating existing pi-voice-stt clone..."
  git -C "$PI_VOICE_STT_DIR" fetch --quiet origin "$PI_VOICE_STT_BRANCH" &&
    git -C "$PI_VOICE_STT_DIR" checkout --quiet "$PI_VOICE_STT_BRANCH" &&
    git -C "$PI_VOICE_STT_DIR" merge --quiet --ff-only "origin/$PI_VOICE_STT_BRANCH"
else
  git clone --quiet --branch "$PI_VOICE_STT_BRANCH" \
    https://github.com/TomGrozev/pi-voice-stt.git "$PI_VOICE_STT_DIR"
fi

if command -v omp &>/dev/null; then
  omp plugin link "$PI_VOICE_STT_DIR"
else
  echo "  omp not found — cloned to $PI_VOICE_STT_DIR; run 'omp plugin link $PI_VOICE_STT_DIR' once omp is installed"
fi

# --- Download Zellij WASM plugins ---
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
  plugin_path="$ZELLIJ_PLUGIN_DIR/$plugin_name"

  if [ -f "$plugin_path" ]; then
    echo "  $plugin_name already downloaded, skipping"
  else
    echo "  Downloading $plugin_name..."
    curl -fL --progress-bar -o "$plugin_path" "${ZELLIJ_PLUGIN_URLS[$i]}" || {
      echo "    Warning: Failed to download $plugin_name"
    }
  fi
done

# --- Install codebase-memory-mcp ---
echo ""
echo "Installing codebase-memory-mcp..."

CODEBASE_MEMORY_MCP_BIN="$LOCAL_BIN/codebase-memory-mcp"

if [ -x "$CODEBASE_MEMORY_MCP_BIN" ]; then
  echo "  codebase-memory-mcp already installed, skipping"
else
  # Map host platform → upstream archive naming.
  case "$UNAME_OS" in
  darwin) OS_PART="darwin" ;;
  linux) OS_PART="linux" ;;
  *)
    echo "    Error: unsupported OS '$UNAME_OS' (only darwin and linux are supported)" >&2
    exit 1
    ;;
  esac

  case "$UNAME_ARCH" in
  arm64 | aarch64) ARCH_PART="arm64" ;;
  x86_64 | amd64) ARCH_PART="amd64" ;;
  *)
    echo "    Error: unsupported architecture '$UNAME_ARCH'" >&2
    exit 1
    ;;
  esac

  # Upstream naming convention: Linux uses the -portable archive variant.
  if [ "$OS_PART" = "linux" ]; then
    ARCHIVE_NAME="codebase-memory-mcp-${OS_PART}-${ARCH_PART}-portable.tar.gz"
  else
    ARCHIVE_NAME="codebase-memory-mcp-${OS_PART}-${ARCH_PART}.tar.gz"
  fi

  RELEASE_BASE="https://github.com/DeusData/codebase-memory-mcp/releases/latest/download"
  ARCHIVE_URL="$RELEASE_BASE/$ARCHIVE_NAME"
  CHECKSUMS_URL="$RELEASE_BASE/checksums.txt"

  # Subshell-local temp dir + EXIT trap: nothing leaks on failure under set -e,
  # and the trap stays scoped to this block instead of lingering script-wide.
  (
    set -e
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

    tar -xzf "$ARCHIVE_PATH" -C "$TMPDIR"
    if [ ! -f "$TMPDIR/codebase-memory-mcp" ]; then
      echo "    Error: archive did not contain a 'codebase-memory-mcp' binary" >&2
      exit 1
    fi
    mv "$TMPDIR/codebase-memory-mcp" "$CODEBASE_MEMORY_MCP_BIN"
    chmod +x "$CODEBASE_MEMORY_MCP_BIN"
  )

  echo "  codebase-memory-mcp installed to ~/.local/bin/codebase-memory-mcp"
fi

# --- Install captain-miao (coding agent session manager) ---
# Installs the `miao` dashboard binary. The `miao-server` daemon is a separate
# release asset and ships in the devcontainer image. Release assets embed the
# version in their filename (miao-bundled-all-server-v0.6.0-<triple>.tar.gz),
# so the tag is resolved from the GitHub API rather than /latest/download/.
# Upstream ships no checksums file, so this block does not verify a digest.
echo ""
echo "Installing captain-miao..."

MIAO_BIN="$LOCAL_BIN/miao"

# Resolve the latest release tag first — it drives both the up-to-date check
# below and the download URL.
echo "  Resolving latest captain-miao release..."
MIAO_TAG="$(curl -fsSL https://api.github.com/repos/hyperlogue/captain-miao/releases/latest |
  grep -m1 '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')"
if [ -z "$MIAO_TAG" ]; then
  echo "    Error: could not resolve latest captain-miao release tag" >&2
  exit 1
fi

# --- Up-to-date check ---
# `miao -V` prints the bare SemVer (no leading "v", e.g. "0.8.0"), while the
# GitHub tag carries a "v" prefix (e.g. "v0.8.0") — strip it before comparing.
# The -V output format varies with the clap version miao was built with: newer
# builds print just "0.8.0", older ones print "miao 0.8.0", so we extract the
# trailing SemVer rather than doing exact-string equality.
# Query the binary we own in ~/.local/bin, else whatever is on PATH (e.g. the
# devcontainer image's miao). Reinstall only when the installed version differs
# from the latest release.
if [ -x "$MIAO_BIN" ]; then
  MIAO_VERSION_CMD="$MIAO_BIN"
elif command -v miao >/dev/null 2>&1; then
  MIAO_VERSION_CMD="$(command -v miao)"
else
  MIAO_VERSION_CMD=""
fi

INSTALL_MIAO=0
if [ -n "$MIAO_VERSION_CMD" ]; then
  INSTALLED_VERSION="$("$MIAO_VERSION_CMD" -V 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n1)"
  LATEST_VERSION="${MIAO_TAG#v}"
  if [ -n "$INSTALLED_VERSION" ] && [ "$INSTALLED_VERSION" = "$LATEST_VERSION" ]; then
    echo "  captain-miao already up to date ($INSTALLED_VERSION), skipping"
  else
    if [ -n "$INSTALLED_VERSION" ]; then
      echo "  captain-miao $INSTALLED_VERSION installed, latest is $LATEST_VERSION — updating..."
    else
      echo "  No installed captain-miao version detected, installing $LATEST_VERSION..."
    fi
    INSTALL_MIAO=1
  fi
else
  INSTALL_MIAO=1
fi

# --- Install / update ---
if [ "$INSTALL_MIAO" = "1" ]; then
  # Detect OS → target-triple OS/vendor segment
  case "$UNAME_OS" in
  darwin) OS_PART="apple-darwin" ;;
  linux) OS_PART="unknown-linux-gnu" ;;
  *)
    echo "    Error: unsupported OS '$UNAME_OS' (only darwin and linux are supported)" >&2
    exit 1
    ;;
  esac

  case "$UNAME_ARCH" in
  arm64 | aarch64) ARCH_PART="aarch64" ;;
  x86_64 | amd64) ARCH_PART="x86_64" ;;
  *)
    echo "    Error: unsupported architecture '$UNAME_ARCH'" >&2
    exit 1
    ;;
  esac

  ARCHIVE_NAME="miao-bundled-all-server-${MIAO_TAG}-${ARCH_PART}-${OS_PART}.tar.gz"
  ARCHIVE_URL="https://github.com/hyperlogue/captain-miao/releases/download/${MIAO_TAG}/${ARCHIVE_NAME}"

  # Subshell-local temp dir + EXIT trap: nothing leaks on failure under set -e.
  (
    set -e
    TMPDIR="$(mktemp -d)"
    trap 'rm -rf "$TMPDIR"' EXIT
    ARCHIVE_PATH="$TMPDIR/$ARCHIVE_NAME"

    echo "  Downloading captain-miao ${MIAO_TAG}..."
    curl -fL --progress-bar -o "$ARCHIVE_PATH" "$ARCHIVE_URL"

    # Archive layout: miao-bundled-all-server-<tag>-<triple>/miao
    tar -xzf "$ARCHIVE_PATH" -C "$TMPDIR"
    EXTRACTED_BIN="$TMPDIR/miao-bundled-all-server-${MIAO_TAG}-${ARCH_PART}-${OS_PART}/miao"
    if [ ! -f "$EXTRACTED_BIN" ]; then
      echo "    Error: archive did not contain the miao binary at expected path" >&2
      exit 1
    fi
    mv "$EXTRACTED_BIN" "$MIAO_BIN"
    chmod +x "$MIAO_BIN"
  )

  echo "  captain-miao installed to ~/.local/bin/miao"
fi

# --- Clean up Plannotator (replaced by r3) ---
if [ -f "$LOCAL_BIN/plannotator" ]; then
  echo ""
  echo "Removing old Plannotator (replaced by r3)..."
  rm -f "$LOCAL_BIN/plannotator"
  echo "  plannotator removed"
fi

# --- Install r3 (review tool) ---
# r3 ships no CLI version flag, so the installed version is read from its npm
# package.json and compared against the latest published version; reinstall
# only when they differ.
echo ""
echo "Installing r3..."

R3_INSTALLED_VERSION="$(grep -oE '"version"[[:space:]]*:[[:space:]]*"[^"]+"' \
  "$HOME/.local/lib/node_modules/@hyperlogue/r3/package.json" 2>/dev/null |
  head -n1 | sed -E 's/.*"([^"]+)".*/\1/')"
R3_LATEST_VERSION="$(npm view @hyperlogue/r3 version 2>/dev/null)"

if [ -z "$R3_LATEST_VERSION" ]; then
  echo "  Could not resolve latest r3 version; leaving installed version as-is"
elif [ -n "$R3_INSTALLED_VERSION" ] && [ "$R3_INSTALLED_VERSION" = "$R3_LATEST_VERSION" ]; then
  echo "  r3 already up to date ($R3_INSTALLED_VERSION), skipping"
else
  if [ -n "$R3_INSTALLED_VERSION" ]; then
    echo "  r3 $R3_INSTALLED_VERSION installed, latest is $R3_LATEST_VERSION — updating..."
  else
    echo "  No installed r3 version detected, installing $R3_LATEST_VERSION..."
  fi
  npm install -g --prefix "$HOME/.local" @hyperlogue/r3
  echo "  r3 installed (${R3_LATEST_VERSION}) to ~/.local/bin/r3"
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

# --- Install opencode npm dependencies ---
echo ""
echo "Installing opencode npm dependencies..."

if [ ! -f "$DOTFILES_DIR/.config/opencode/package.json" ]; then
  echo "  No package.json in .config/opencode, skipping"
elif command -v npm &>/dev/null; then
  (cd "$DOTFILES_DIR/.config/opencode" && npm install --production)
  echo "  opencode dependencies installed"
else
  echo "  npm not found. Install Node.js to get opencode plugin dependencies."
fi

# --- Install agent skills (shared by opencode and omp) ---
# Skills install into ~/.agents/skills/, which omp exposes via its
# config.yml `skills.customDirectories` and opencode reads natively.
# `skills add -a universal` targets that shared directory agent-agnostically.
# Matt Pocock engineering skills
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

if command -v npm &>/dev/null; then
  echo ""
  echo "Installing skills..."
  echo "  Remove all existing skills..."
  rm -rf "$HOME/.agents/skills/" || true

  echo "  Installing Matt Pocock engineering skills..."
  matt_pocock_skill_args=()
  for skill in "${MATT_POCOCK_SKILLS[@]}"; do
    matt_pocock_skill_args+=(-s "$skill")
  done
  npx skills add mattpocock/skills "${matt_pocock_skill_args[@]}" -a universal -y -g

  echo "  Installing conventional-commit skill..."
  npx skills add https://github.com/github/awesome-copilot --skill conventional-commit -a universal -y -g

  echo "  Installing frontend-design skill..."
  npx skills add https://github.com/anthropics/skills --skill frontend-design -a universal -y -g
else
  echo "  npm not found. Install Node.js to install agent skills."
fi

echo ""
echo "✅ Done! Restart your shell or run: source ~/.zshrc"
