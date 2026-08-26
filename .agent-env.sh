# Shared POSIX-sh logic for agent config env vars (PI_CONFIG_FILES, OPENCODE_CONFIG).
#
# Sourced from both `.zshenv` (interactive/login zsh shells: terminals, plain
# `ssh host cmd`) and `.profile` (POSIX login shells). The second path matters
# because captain-miao's pooled/remote session spawn never touches zsh at all:
# it wraps the launch command as `sh -lc '... exec "$@"'` (crates/cm-server/src/
# server_pool.rs) — a login `sh`, which per its own docs "sources /etc/profile
# (and the user profile)" and nothing else. `.zshenv`/`.zshrc`/`.bashrc` are
# never read on that path, so a devcontainer session launched by captain-miao
# got neither PI_CONFIG_FILES nor OPENCODE_CONFIG until this file existed.
#
# Written for POSIX `sh` on purpose — no `[[ ]]`, `(( ))`, or bash/zsh-only
# syntax — so dash (the usual `/bin/sh` on Linux devcontainers) and zsh parse
# it identically. Edit this file, not the two that source it, to change the
# actual logic.

# --- Container detection (one test, reused below) ---
# True inside devcontainers / Docker / Podman, nested or not. File checks
# survive even where captain-miao's pooled spawn strips the environment down
# to a minimal set (TERM/DISPLAY/LANG/SSH_AUTH_SOCK) before it ever reaches
# this script, so REMOTE_CONTAINERS/DEVCONTAINER are a fallback, not the
# primary signal.
dotfiles_in_container=0
if [ -n "$REMOTE_CONTAINERS" ] || [ -n "$DEVCONTAINER" ] || [ -f /.dockerenv ] || [ -f /.containerenv ]; then
  dotfiles_in_container=1
fi

# opencode permission tiers: 'restrictive' on local, 'permissive' inside
# dev containers. Override explicitly with `OPENCODE_PERMISSION=permissive|restrictive`.
# Leaves OPENCODE_CONFIG untouched if already set (e.g. by a project's .envrc).
opencode_permission=${OPENCODE_PERMISSION:-auto}
if [ "$opencode_permission" = "auto" ]; then
  if [ "$dotfiles_in_container" = 1 ]; then
    opencode_permission=permissive
  else
    opencode_permission=restrictive
  fi
fi
if [ "$opencode_permission" = "permissive" ] && [ -z "$OPENCODE_CONFIG" ]; then
  export OPENCODE_CONFIG="$HOME/.config/opencode/opencode-devcontainer.jsonc"
fi

# omp yolo overlay inside containers: the overlay sets approvalMode=yolo plus explicit
# credential denies. PI_CONFIG_FILES is strict — a missing path is a hard omp startup
# error — so we only append when the overlay actually exists, and we append with ':'
# rather than clobbering any pre-existing value. This file is sourced on every shell
# invocation that reaches it (including nested subshells that already inherited the
# var), so skip when already present. Opt out without editing dotfiles:
# `OMP_DEVCONTAINER_YOLO=0`.
omp_overlay="$HOME/.omp/agent/config-devcontainer.yml"
if [ "$dotfiles_in_container" = 1 ] && [ "$OMP_DEVCONTAINER_YOLO" != "0" ] && [ -f "$omp_overlay" ]; then
  case ":${PI_CONFIG_FILES}:" in
    *":${omp_overlay}:"*) ;; # already present, no-op
    *)
      if [ -n "$PI_CONFIG_FILES" ]; then
        export PI_CONFIG_FILES="$PI_CONFIG_FILES:$omp_overlay"
      else
        export PI_CONFIG_FILES="$omp_overlay"
      fi
      ;;
  esac
fi
unset omp_overlay dotfiles_in_container
