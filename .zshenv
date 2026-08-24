# uv
export PATH="$HOME/.local/bin:$PATH"

# --- Container detection (one test, reused below) ---
# True inside devcontainers / Docker / Podman, nested or not. Evaluated once and
# consumed by both the opencode and omp tiers below.
dotfiles_in_container=0
if [[ -n "$REMOTE_CONTAINERS" || -n "$DEVCONTAINER" || -f /.dockerenv || -f /.containerenv ]]; then
  dotfiles_in_container=1
fi

# opencode permission tiers: 'restrictive' on local, 'permissive' inside
# dev containers. Override explicitly with `OPENCODE_PERMISSION=permissive|restrictive`.
# Leaves OPENCODE_CONFIG untouched if already set (e.g. by a project's .envrc).
opencode_permission=${OPENCODE_PERMISSION:-auto}
if [[ "$opencode_permission" == "auto" ]]; then
  if (( dotfiles_in_container )); then
    opencode_permission=permissive
  else
    opencode_permission=restrictive
  fi
fi
if [[ "$opencode_permission" == "permissive" && -z "$OPENCODE_CONFIG" ]]; then
  export OPENCODE_CONFIG="$HOME/.config/opencode/opencode-devcontainer.jsonc"
fi
opencode-perm() {
  echo "opencode tier: $opencode_permission${OPENCODE_CONFIG:+ ($OPENCODE_CONFIG)}"
}

# omp yolo overlay inside containers: the overlay sets approvalMode=yolo plus explicit
# credential denies. PI_CONFIG_FILES is strict — a missing path is a hard omp startup
# error — so we only append when the overlay actually exists, and we append with ':'
# rather than clobbering any pre-existing value. `.zshenv` runs for every zsh (including
# nested subshells that already inherited the var), so skip when already present.
# Opt out without editing dotfiles: `OMP_DEVCONTAINER_YOLO=0`.
omp_overlay="$HOME/.omp/agent/config-devcontainer.yml"
if (( dotfiles_in_container )) && [[ "$OMP_DEVCONTAINER_YOLO" != "0" ]] && [[ -f "$omp_overlay" ]]; then
  if [[ -n "$PI_CONFIG_FILES" ]] && [[ ":${PI_CONFIG_FILES}:" != *":${omp_overlay}:"* ]]; then
    export PI_CONFIG_FILES="$PI_CONFIG_FILES:$omp_overlay"
  elif [[ -z "$PI_CONFIG_FILES" ]]; then
    export PI_CONFIG_FILES="$omp_overlay"
  fi
fi
unset omp_overlay dotfiles_in_container

if [[ "$(uname)" == "Darwin" ]]; then
  export NEURALWATT_API_KEY="$(security find-generic-password -s "neuralwatt-api-key" -w)"
fi
