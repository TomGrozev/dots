# Shared POSIX-sh logic for the OPENCODE_CONFIG env var.
#
# Sourced from both `.zshenv` (interactive/login zsh shells: terminals, plain
# `ssh host cmd`) and `.profile` (POSIX login shells). The second path matters
# because captain-miao's pooled/remote session spawn never touches zsh at all:
# it wraps the launch command as `sh -lc '... exec "$@"'` (crates/cm-server/src/
# server_pool.rs) — a login `sh`, which per its own docs "sources /etc/profile
# (and the user profile)" and nothing else. `.zshenv`/`.zshrc`/`.bashrc` are
# never read on that path, so a devcontainer session launched by captain-miao
# got no OPENCODE_CONFIG until this file existed.
#
# omp used to get its devcontainer overlay the same way (PI_CONFIG_FILES),
# but that never actually reached captain-miao's *direct* (non-pooled) spawn
# path either — it launches the agent binary via a bare fork+exec with a
# hardcoded minimal env, no shell involved at all, so no env var set here
# could reach it. omp's devcontainer config is now baked into config.yml at
# install time instead (see install.sh + .omp/merge-config.py) — no env var
# needed for it on any spawn path. OPENCODE_CONFIG is kept here for now;
# verify it actually reaches a captain-miao-spawned opencode session before
# assuming it doesn't have the same gap.
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

unset dotfiles_in_container
