# uv
export PATH="$HOME/.local/bin:$PATH"

# Agent config env (OPENCODE_CONFIG): container detection and opencode's
# permission tier. Shared with `.profile` (POSIX sh) so captain-miao's
# pooled/remote session spawn — which runs `sh -lc ...` and never reads this
# file — gets the same behaviour. Edit `.agent-env.sh`, not this block, to
# change the logic. (omp's devcontainer config is baked into config.yml at
# install time instead — see install.sh — no env var needed for it.)
[[ -f "$HOME/.agent-env.sh" ]] && source "$HOME/.agent-env.sh"

# Diagnostic helper, zsh-only: dash (the `sh` `.profile` sources) rejects
# hyphens in function names, so this stays out of `.agent-env.sh`. Reads
# $opencode_permission/$OPENCODE_CONFIG left behind by that sourced file.
opencode-perm() {
  echo "opencode tier: $opencode_permission${OPENCODE_CONFIG:+ ($OPENCODE_CONFIG)}"
}

if [[ "$(uname)" == "Darwin" ]]; then
  export NEURALWATT_API_KEY="$(security find-generic-password -s "neuralwatt-api-key" -w)"
  export SONIOX_API_KEY="$(security find-generic-password -s "soniox-api-key" -w)"
fi
