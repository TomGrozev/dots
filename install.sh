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

# AGENT_POD=true selects the lean profile for an agent pod: a disposable
# container that clones this repo at runtime and runs
# `AGENT_POD=true bash install.sh` from the clone (kelos_entrypoint.sh in
# TomGrozev/devcontainers). The pod's image already carries omp, node/npm, git,
# gh, zsh and the CLI tools (miao, miao-server, zellij, d2, nvim, yazi, …), so
# the sections that install a shell (oh-my-zsh, p10k) or the interactive
# workspace wiring (dotfile and ~/.config symlinks, Zellij WASM plugins, r3,
# the captain-miao dashboard) are skipped here: the
# clone exists only to supply the authored agent config under ~/.omp/agent.
# Binary installs the image does NOT ship still run — each is guarded by its own
# presence check, so one install path serves the laptop, the devcontainer and
# the pod. The image ships no omp config of its own — no PI_CONFIG_FILES
# overlay, no config.yml, no APPEND_SYSTEM.md — so everything unattended-
# specific arrives from this clone: this mode bakes .omp/config-agent-pod.yml
# into config.yml (same mechanism as the devcontainer bake below, different
# overlay) and links .omp/APPEND_SYSTEM-agent-pod.md as the append-to-system-
# prompt file omp auto-discovers. Unset, or any value other than "true", keeps
# the full install below unchanged.
AGENT_POD="${AGENT_POD:-false}"

mkdir -p "$OMP_AGENT_DIR" "$LOCAL_BIN"
# ~/.config only ever receives the symlinks and installs the lean profile skips,
# so it does not create it. ~/.local/bin is different: the pod still gets the
# codebase-memory-mcp binary and the `diagram` link there.
if [ "$AGENT_POD" != "true" ]; then
  mkdir -p "$HOME/.config"
fi

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
  mkdir -p "$(dirname "$target")"
  if [ -e "$target" ] && [ ! -L "$target" ]; then
    echo "  Backing up existing $label → ${label}.bak"
    mv "$target" "${target}.bak"
  fi
  ln -sfn "$source" "$target"
  echo "  Linked $label"
}

# --- Arch Linux system packages ---
# Runs first because everything below assumes git, curl and zsh exist. Only on
# Arch hosts: the Mac, the devcontainers and the agent pods get their tools
# elsewhere (Homebrew / the image). --needed makes re-runs skip installed packages.
if [ -f /etc/arch-release ] && [ "$AGENT_POD" != "true" ]; then
  echo ""
  echo "Installing Arch packages..."
  sudo pacman -S --needed --noconfirm - < "$DOTFILES_DIR/packages/arch.txt"

  # AUR packages go through yay; bootstrap it from the prebuilt yay-bin when absent.
  if ! command -v yay &>/dev/null; then
    echo "  Bootstrapping yay..."
    yay_build="$(mktemp -d)"
    git clone --quiet --depth=1 https://aur.archlinux.org/yay-bin.git "$yay_build"
    (cd "$yay_build" && makepkg -si --noconfirm)
    rm -rf "$yay_build"
  fi
  yay -S --needed --noconfirm - < "$DOTFILES_DIR/packages/aur.txt"
fi

# --- GTK / icon theming (Arch desktop only) ---
# Same guards as the other desktop-only blocks: macOS, devcontainers, agent
# pods and headless hosts have no GTK session to theme. gsettings writes the
# user's dconf database; xsettings portals and GTK apps pick the values up.
if [ -f /etc/arch-release ] &&
  [ "${DEVCONTAINER:-}" != "true" ] &&
  [ "$AGENT_POD" != "true" ] &&
  [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ] &&
  command -v gsettings >/dev/null 2>&1; then
  echo ""
  echo "Applying Nord GTK theme..."

  gsettings set org.gnome.desktop.interface gtk-theme Nordic
  gsettings set org.gnome.desktop.interface icon-theme Papirus-Dark
  gsettings set org.gnome.desktop.interface cursor-theme Nordzy-cursors
  gsettings set org.gnome.desktop.interface color-scheme prefer-dark
  gsettings set org.gnome.desktop.interface font-name 'FiraCode Nerd Font 11'

  # Papirus-Dark is the icon theme the bar and launcher use; nordic folders
  # keep its directory icons in the same palette.
  if command -v papirus-folders >/dev/null 2>&1; then
    papirus-folders -C nordic --theme Papirus-Dark
  fi
fi

# --- OpenWhispr + Soniox proxy (Linux desktop only) ---
# Soniox ships no Linux desktop app (its installers are macOS/Windows only), so
# the dictation UI here is OpenWhispr. OpenWhispr's Custom provider speaks the
# OpenAI /v1/audio/transcriptions shape, while Soniox's API is job-based async
# (upload → create → poll → fetch); openwhispr-soniox-proxy translates between
# the two on localhost. Skipped on macOS (official Soniox app), in devcontainers
# and agent pods (no audio stack), and on headless Linux hosts.
if [ "$UNAME_OS" = "linux" ] &&
  [ "${DEVCONTAINER:-}" != "true" ] &&
  [ "$AGENT_POD" != "true" ] &&
  [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
  echo ""
  echo "Installing OpenWhispr + Soniox proxy..."

  if [ -f /etc/arch-release ]; then
    # AUR-only package: yay was bootstrapped by the Arch block above.
    yay -S --needed --noconfirm openwhispr-bin

    # Proxy source lives in this repo. Link it before starting the unit so its
    # %h/.config WorkingDirectory resolves; the generic .config link loop runs
    # later, after this service has already restarted.
    link_entry "$DOTFILES_DIR/.config/openwhispr-soniox-proxy" \
      "$HOME/.config/openwhispr-soniox-proxy" ".config/openwhispr-soniox-proxy"

    # User unit: starts with the session and restarts on failure. The Soniox key
    # stays out of the unit — the proxy forwards each request's Bearer token.
    link_entry "$DOTFILES_DIR/.config/systemd/user/openwhispr-soniox-proxy.service" \
      "$HOME/.config/systemd/user/openwhispr-soniox-proxy.service" \
      ".config/systemd/user/openwhispr-soniox-proxy.service"
    if command -v systemctl >/dev/null 2>&1; then
      systemctl --user daemon-reload
      systemctl --user enable openwhispr-soniox-proxy.service
      # Restart (not just start) so a re-run picks up source edits.
      systemctl --user restart openwhispr-soniox-proxy.service
      echo "  Proxy listening on http://127.0.0.1:8788"
    else
      echo "  WARNING: systemctl not found; start the proxy manually with:"
      echo "    (cd \"$HOME/.config/openwhispr-soniox-proxy\" && bun run src/server.ts)"
    fi
  else
    echo "  Skipping OpenWhispr + Soniox proxy: only the Arch package is automated"
  fi
fi

# --- Install Oh My Zsh ---
# Skipped in AGENT_POD mode: the pod's image ships its own shell.
if [ "$AGENT_POD" != "true" ]; then
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
fi # AGENT_POD guard: shell installs (oh-my-zsh, its plugins, p10k)

# --- Remove targets dropped from the dotfiles ---
# A commit that removes a dotfile or an install step leaves the previously
# installed copy behind: symlinks dangle (their source is gone) and non-symlink
# artifacts (git clones, plugin links) linger. Clean these before re-linking so
# removals propagate to existing installs, not only to fresh ones.
echo ""
echo "Removing stale targets..."

# (a) Symlinks in the managed roots that point into the repo but whose source no
# longer exists. Any entry dropped from the arrays below self-cleans here.
for root in "$HOME" "$HOME/.config" "$OMP_AGENT_DIR" "$LOCAL_BIN"; do
  find "$root" -maxdepth 1 -type l 2>/dev/null | while read -r link; do
    case "$(readlink "$link")" in
    "$DOTFILES_DIR"/*)
      if [ ! -e "$link" ]; then
        echo "  Removing stale link $link (source gone)"
        rm -f "$link"
      fi
      ;;
    esac
  done
done

# (b) Paths created by install steps that have since been removed from this
# script. When you delete an install block, add the paths it created here.
obsolete_paths=(
  "$HOME/.pi/agent/stt.json"                                 # pi-voice-stt Soniox STT config (removed 6f153196)
  "$HOME/.local/share/pi-voice-stt"                          # pi-voice-stt git clone
  "$HOME/.omp/plugins/node_modules/pi-voice-stt"             # pi-voice-stt omp plugin link
  "$HOME/.omp/plugins/node_modules/@mikefreno/omp-neuralwatt" # published neuralwatt port, superseded by the fork spec (see OMP_PLUGINS)
)
# omp plugins whose install block has been replaced: deregister each so omp
# prunes its own state (node_modules link + omp-plugins.lock.json); the
# filesystem removals below are the fallback. `uninstall` exits 1 when the
# plugin is already gone, hence the swallowed status.
obsolete_plugins=(
  pi-voice-stt                # removed 6f153196
  "@mikefreno/omp-neuralwatt" # superseded by the TomGrozev fork spec (see OMP_PLUGINS)
)
if command -v omp &>/dev/null; then
  for plugin in "${obsolete_plugins[@]}"; do
    omp plugin uninstall "$plugin" &>/dev/null || true
  done
fi
for path in "${obsolete_paths[@]}"; do
  if [ -e "$path" ] || [ -L "$path" ]; then
    echo "  Removing obsolete $path"
    rm -rf "$path"
  fi
done
# Prune directories the removals above emptied.
rmdir "$HOME/.pi/agent" "$HOME/.pi" 2>/dev/null || true
rmdir "$HOME/.omp/plugins/node_modules/@mikefreno" 2>/dev/null || true

# --- Symlink dotfiles ---
# Skipped in AGENT_POD mode: the pod's image owns the shell/dotfile wiring, and
# the pod must not take this repo's git identity. `.gitconfig` carries the
# human's user.name/user.email and `commit.gpgsign = true` against a signing key
# that exists only on the laptop. The pod's identity, signing key and token come
# from the git-bot-identity extension instead, which composes them per call and
# shadows the global config (GIT_CONFIG_GLOBAL → its own deny-gitconfig).
if [ "$AGENT_POD" != "true" ]; then
echo ""
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
  link_entry "$DOTFILES_DIR/$file" "$HOME/$file" "$file"
done

# --- Symlink .config subdirectories ---
echo ""
echo "Creating .config symlinks..."

config_dirs=(gh ghostty nvim cortexkit yaji zellij)

# The Polar Hyprland desktop only exists on Arch desktops; macOS,
# devcontainers, agent pods and headless hosts get none of its configs or
# scripts. Same guards as the GTK theming block above.
if [ -f /etc/arch-release ] &&
  [ "${DEVCONTAINER:-}" != "true" ] &&
  [ "$AGENT_POD" != "true" ] &&
  [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
  polar_desktop=true
  config_dirs+=(hypr ironbar mako fuzzel polar)
else
  polar_desktop=false
fi

for dir in "${config_dirs[@]}"; do
  link_entry "$DOTFILES_DIR/.config/$dir" "$HOME/.config/$dir" ".config/$dir"
done

# Polar desktop scripts. The glob picks up new scripts without touching this
# list; Hyprland's config puts ~/.local/bin on PATH so binds call them bare.
if [ "$polar_desktop" = true ]; then
  for script in "$DOTFILES_DIR"/bin/polar-*; do
    [ -e "$script" ] || continue
    link_entry "$script" "$LOCAL_BIN/$(basename "$script")" "~/.local/bin/$(basename "$script")"
  done
fi

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
fi # AGENT_POD guard: dotfile, .config and captain-miao symlinks

# --- Link omp (Oh My Pi) config ---
# ~/.omp/agent/ holds runtime state (agent.db, sessions/, memories/) alongside
# authored config, so individual entries are linked rather than the directory.
# merge-config.py is deliberately absent: install.sh invokes it from
# $DOTFILES_DIR, and omp never reads it from the agent dir.
echo ""
echo "Linking omp config..."

# The overlay this mode bakes into config.yml, if any (see the block after this
# loop). Only the devcontainer and the agent pod ship one; everywhere else
# config.yml is linked like any other entry. The agent image deliberately ships
# no omp config overlay of its own, so the pod's comes from this clone.
CONFIG_OVERLAY=""
if [ "$AGENT_POD" = "true" ] && [ -f "$DOTFILES_DIR/.omp/config-agent-pod.yml" ]; then
  CONFIG_OVERLAY="$DOTFILES_DIR/.omp/config-agent-pod.yml"
elif [ "$AGENT_POD" != "true" ] && [ "${DEVCONTAINER:-}" = "true" ] && [ -f "$DOTFILES_DIR/.omp/config-devcontainer.yml" ]; then
  CONFIG_OVERLAY="$DOTFILES_DIR/.omp/config-devcontainer.yml"
fi

# The lean agent-pod profile links only the authored config the pod runs on:
# WATCHDOG.md, config-devcontainer.yml and hooks belong to the laptop and
# devcontainer installs, and skills/ is narrowed to the pairing-workflow skills
# linked after the loop. mcp.json is linked in both modes: the codebase-memory
# server is how the pod's agent learns the ticket's repo, and the other two are
# hosted.
if [ "$AGENT_POD" = "true" ]; then
  omp_entries=(config.yml mcp.json AGENTS.md RULES.md agents extensions rules)
else
  omp_entries=(config.yml config-devcontainer.yml mcp.json AGENTS.md RULES.md WATCHDOG.md agents extensions rules hooks skills)
fi

for entry in "${omp_entries[@]}"; do
  # config.yml is baked with this mode's overlay merged in, not symlinked (see
  # the block after this loop): the devcontainer merges config-devcontainer.yml,
  # the agent pod config-agent-pod.yml.
  if [ "$entry" = "config.yml" ] && [ -n "$CONFIG_OVERLAY" ]; then
    continue
  fi
  link_entry "$DOTFILES_DIR/.omp/$entry" "$OMP_AGENT_DIR/$entry" "~/.omp/agent/$entry"
done

# The pod's agent-tier config names only the three pairing-workflow skills, so
# the lean profile links those individually instead of the whole skills/ dir.
if [ "$AGENT_POD" = "true" ]; then
  for skill in implement walkthrough land; do
    link_entry "$DOTFILES_DIR/.omp/skills/$skill" "$OMP_AGENT_DIR/skills/$skill" "~/.omp/agent/skills/$skill"
  done
fi

# Fixed path to the workflow map, independent of where the repo is cloned, so
# the agent's instructions can point at it.
link_entry "$DOTFILES_DIR/docs/pairing-workflow.html" "$OMP_AGENT_DIR/pairing-workflow.html" "~/.omp/agent/pairing-workflow.html"

# --- Bake the mode's overlay into config.yml ---
# A PI_CONFIG_FILES env var could select an overlay dynamically for shells that
# source it - but two of the modes that need one never run a shell at all: the
# devcontainer's captain-miao remote/pooled session spawn (miao-server launches
# the agent binary directly with a hardcoded minimal env) and the agent pod's
# kelos_entrypoint.sh (a single `omp -p` process). So neither can rely on an env
# var, and the pod's image deliberately ships no overlay of its own. Deep-merge
# the overlay into config.yml itself at install time instead, so the file omp
# loads by default already has it - no env var required. Arrays replace wholesale
# (documented in the overlays' own headers), matching PI_CONFIG_FILES's merge
# semantics exactly (verified: both routes resolve tools.approvalMode to "yolo"
# identically). Falls back to a plain symlink of the base config.yml if
# python3/pip/pyyaml is unavailable - that fails safe (restrictive approvalMode)
# rather than silently leaving no config.yml at all.
#
# pyyaml is acquired by import first, install second: it is often already
# importable (in which case no network is touched), and the two pip spellings
# cover the distros whose pip predates --break-system-packages (it needs
# pip >= 23.0.1, and macOS's system python3 has an older one - without the
# fallback the pod would silently lose its whole overlay).
if [ -n "$CONFIG_OVERLAY" ]; then
  echo ""
  echo "Baking $(basename "$CONFIG_OVERLAY") into config.yml..."
  if command -v python3 >/dev/null 2>&1 &&
    { python3 -c "import yaml" >/dev/null 2>&1 ||
      python3 -m pip install --quiet --user --break-system-packages pyyaml >/dev/null 2>&1 ||
      python3 -m pip install --quiet --user pyyaml >/dev/null 2>&1; } &&
    python3 "$DOTFILES_DIR/.omp/merge-config.py" \
      "$DOTFILES_DIR/.omp/config.yml" \
      "$CONFIG_OVERLAY" \
      "$OMP_AGENT_DIR/config.yml"; then
    echo "  Wrote merged config.yml"
  else
    echo "  WARNING: merge failed (python3/pyyaml unavailable?) - falling back to plain config.yml symlink"
    echo "  ($(basename "$CONFIG_OVERLAY") will NOT apply - approvalMode stays restrictive until python3/pyyaml"
    echo "  is available and install.sh is re-run)"
    link_entry "$DOTFILES_DIR/.omp/config.yml" "$OMP_AGENT_DIR/config.yml" "~/.omp/agent/config.yml"
  fi
fi

# --- Link the unattended system-prompt addendum (agent pod only) ---
# omp appends ~/.omp/agent/APPEND_SYSTEM.md to the main session's system prompt
# when --append-system-prompt is absent (omp 18.8.7 resolves the append file by
# auto-discovery: <agentDir>/APPEND_SYSTEM.md), so the addendum is installed
# under the discovered name rather than passed on the pod's command line - the
# image passes none. Linked, not copied: it is authored config.
if [ "$AGENT_POD" = "true" ]; then
  link_entry "$DOTFILES_DIR/.omp/APPEND_SYSTEM-agent-pod.md" "$OMP_AGENT_DIR/APPEND_SYSTEM.md" "~/.omp/agent/APPEND_SYSTEM.md"
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

# --- Install omp (Linux) ---
# The devcontainer and pod images ship omp; a bare Linux host (e.g. Arch) does
# not. Presence-checked, so it is a no-op wherever omp already exists. Updates
# afterwards are omp's own job, so this only fetches the latest release once.
if [ "$UNAME_OS" = "linux" ] && ! command -v omp &>/dev/null; then
  case "$UNAME_ARCH" in
    x86_64) omp_arch="x64" ;;
    aarch64|arm64) omp_arch="arm64" ;;
    *) omp_arch="" ;;
  esac
  if [ -n "$omp_arch" ]; then
    echo ""
    echo "Installing omp..."
    curl -fsSL -o "$LOCAL_BIN/omp" \
      "https://github.com/can1357/oh-my-pi/releases/latest/download/omp-linux-$omp_arch"
    chmod +x "$LOCAL_BIN/omp"
    export PATH="$LOCAL_BIN:$PATH"
  else
    echo "  Skipping omp: unsupported arch $UNAME_ARCH"
  fi
fi

# --- Install omp plugins ---
# omp npm plugins installed into ~/.omp/plugins/. omp's plugin state is runtime-
# managed (package.json + omp-plugins.lock.json), so we run the installer rather than
# committing a manifest. Idempotent: re-running on an already-installed plugin is a no-op.
# cc-safety-net: PreToolUse hook blocking destructive commands (rm -rf, git reset --hard,
# git push --force, etc.) and secret-file reads (~/.ssh/*, .env, ~/.aws, …). Strict
# preset: set CC_SAFETY_NET_LEVEL=strict in the environment (e.g. .zshenv) — check the
# cc-safety-net docs for the canonical pinning method before adding it.
# neuralwatt: our fork (TomGrozev/fork-pi-neuralwatt) of @aliou/pi-neuralwatt — the
# feat/omp-support branch carries the omp adaptations (sub-bar status line, host
# compat). Pin branch + URL so a fresh install lands on the fork, not the published
# @mikefreno/omp-neuralwatt port, which lags upstream.
OMP_PLUGINS=(cc-safety-net "https://github.com/TomGrozev/fork-pi-neuralwatt#feat/omp-support")

if command -v omp &>/dev/null; then
  for plugin in "${OMP_PLUGINS[@]}"; do
    echo ""
    echo "Installing $plugin plugin for omp..."
    omp install "$plugin"
  done
fi

# --- Download Zellij WASM plugins ---
# Skipped in AGENT_POD mode: the pod runs `omp -p`, a single headless process
# with no terminal, so it never starts zellij. The base image ships the zellij
# binary but not these plugin WASMs, and they only ever land in
# ~/.config/zellij — which the pod does not link either.
if [ "$AGENT_POD" != "true" ]; then
echo ""
echo "Downloading Zellij plugins..."

ZELLIJ_PLUGIN_DIR="$HOME/.config/zellij/plugins"
mkdir -p "$ZELLIJ_PLUGIN_DIR"

# Plugin WASM assets keep the same filename across releases, so the installed
# copy carries no version — stamp the resolved release tag next to each file
# at download time (.<name>.tag) and compare against the latest release on
# later runs, mirroring the miao/r3 update checks above.
ZELLIJ_PLUGIN_NAMES=("zjstatus.wasm" "zjframes.wasm" "zjstatus-hints.wasm" "zellij-autolock.wasm")
ZELLIJ_PLUGIN_URLS=(
  "https://github.com/dj95/zjstatus/releases/latest/download/zjstatus.wasm"
  "https://github.com/dj95/zjstatus/releases/latest/download/zjframes.wasm"
  "https://github.com/b0o/zjstatus-hints/releases/latest/download/zjstatus-hints.wasm"
  "https://github.com/fresh2dev/zellij-autolock/releases/latest/download/zellij-autolock.wasm"
)

for i in "${!ZELLIJ_PLUGIN_NAMES[@]}"; do
  plugin_name="${ZELLIJ_PLUGIN_NAMES[$i]}"
  plugin_path="$ZELLIJ_PLUGIN_DIR/$plugin_name"
  plugin_stamp="$ZELLIJ_PLUGIN_DIR/.$plugin_name.tag"
  # ${url%/releases/*} → https://github.com/<owner>/<repo>
  plugin_repo="${ZELLIJ_PLUGIN_URLS[$i]%/releases/*}"

  # The latest-download URL 302s to releases/download/<tag>/... — the resolved
  # tag drives the up-to-date check. Fall back to the GitHub API if the
  # redirect probe fails.
  plugin_tag="$(curl -fsSI -o /dev/null -w '%{redirect_url}' "${ZELLIJ_PLUGIN_URLS[$i]}" 2>/dev/null |
    sed -nE 's#.*/releases/download/([^/]+)/.*#\1#p')"
  if [ -z "$plugin_tag" ] && command -v jq >/dev/null 2>&1; then
    plugin_tag="$(curl -fsSL "https://api.github.com/repos/${plugin_repo#https://github.com/}/releases/latest" |
      jq -r '.tag_name // empty' 2>/dev/null)"
  fi

  if [ -f "$plugin_path" ] && [ -f "$plugin_stamp" ] && [ -n "$plugin_tag" ] &&
    [ "$(cat "$plugin_stamp" 2>/dev/null)" = "$plugin_tag" ]; then
    echo "  $plugin_name already up to date ($plugin_tag), skipping"
    continue
  fi

  if [ -f "$plugin_path" ] && [ -n "$plugin_tag" ]; then
    echo "  $plugin_name installed, latest is $plugin_tag — updating..."
  else
    echo "  Downloading $plugin_name..."
  fi

  # Download to a temp file and only replace on success, so a failed update
  # never leaves a truncated/trashed plugin behind.
  tmp_plugin="$(mktemp "${plugin_path}.XXXXXX")"
  if curl -fsSL --progress-bar -o "$tmp_plugin" "${ZELLIJ_PLUGIN_URLS[$i]}"; then
    mv "$tmp_plugin" "$plugin_path"
    chmod 644 "$plugin_path"
    printf '%s\n' "$plugin_tag" >"$plugin_stamp"
  else
    echo "    Warning: Failed to download $plugin_name"
    rm -f "$tmp_plugin"
  fi
done
fi # AGENT_POD guard: Zellij WASM plugins

# --- Install codebase-memory-mcp ---
# Runs in every mode, AGENT_POD included: the pod's image ships neither the
# binary nor an index, and the pod's mcp.json names it. The presence check below
# is what makes that safe — the laptop and the devcontainer already have it, so
# this is a no-op there.
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
# Skipped in AGENT_POD mode, together with the up-to-date check and the
# install/update block below: the pod's image ships both binaries, and an
# unattended run never launches the dashboard.
if [ "$AGENT_POD" != "true" ]; then
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
fi # AGENT_POD guard: captain-miao, its up-to-date check and install/update

# --- Link the diagram helper ---
# Unguarded: the pod's AGENTS.md tells the agent to draw flows with
# `diagram <name>.d2`, and the helper degrades on its own where images cannot be
# shown (it prints "no images: use mermaid"), so the pod wants this link too.
# The base image ships d2, which the helper calls.
link_entry "$DOTFILES_DIR/bin/diagram" "$LOCAL_BIN/diagram" "~/.local/bin/diagram"

# --- Clean up Plannotator (replaced by r3) ---
# Skipped in AGENT_POD mode, with the r3 blocks below: the pod runs none of
# these tools.
if [ "$AGENT_POD" != "true" ]; then
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

fi # AGENT_POD guard: Plannotator cleanup, r3

# --- Install agent skills (omp) ---
# Skills install into ~/.agents/skills/, which omp exposes via its
# config.yml `skills.customDirectories`.
# `skills add -a universal` targets that shared directory agent-agnostically.
# Matt Pocock engineering skills. `implement` and `to-tickets` are excluded from
# MATT_POCOCK_SKILLS because pairing-workflow variants of both live in .omp/skills
# (→ ~/.omp/agent/skills). Even so, `skills add` pulls the whole mattpocock/skills
# repo, which also ships implement/ and to-tickets/; they would shadow the local
# variants, so they are removed after the install (see below).
MATT_POCOCK_SKILLS=(
  code-review
  codebase-design
  diagnosing-bugs
  domain-modeling
  grill-me
  grill-with-docs
  grilling
  handoff
  implement-spec
  improve-codebase-architecture
  pr
  prototype
  research
  retro
  setup-matt-pocock-skills
  tdd
  teach
  to-questionnaire
  to-spec
  triage
  wait-what
  wayfinder
  wizard
  writing-for-agents
)

# Lean agent-pod profile: of the Matt Pocock skills, only tdd and code-review are
# named by the pod's agent-tier config (its skills.includeSkills allowlist); the
# rest are laptop-side work skills. The two design skills below come from other
# repos and are installed in both modes.
if [ "$AGENT_POD" = "true" ]; then
  MATT_POCOCK_SKILLS=(tdd code-review)
fi

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

  echo "  Removing bundled upstream implement and to-tickets (local variants shadow them)..."
  rm -rf "$HOME/.agents/skills/implement" "$HOME/.agents/skills/to-tickets" || true
  if [ -d "$HOME/.agents/skills/implement" ] || [ -d "$HOME/.agents/skills/to-tickets" ]; then
    echo "  WARNING: failed to remove upstream implement/to-tickets; local variants may be shadowed"
  fi

  echo "  Installing conventional-commit skill..."
  npx skills add https://github.com/github/awesome-copilot --skill conventional-commit -a universal -y -g

  # Installed in AGENT_POD mode too: a pod handed a UI ticket should be able to
  # reach them. They stay invisible in the pod until the agent image's own
  # skills.includeSkills allowlist (TomGrozev/devcontainers,
  # images/agent/agent.yml) names them.
  echo "  Installing frontend-design skill..."
  npx skills add https://github.com/anthropics/skills --skill frontend-design -a universal -y -g

  echo "  Installing apple-design skill..."
  npx skills add https://github.com/emilkowalski/skills --skill apple-design -a universal -y -g
else
  echo "  npm not found. Install Node.js to install agent skills."
fi

echo ""
echo "✅ Done! Restart your shell or run: source ~/.zshrc"
