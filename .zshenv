# uv
export PATH="$HOME/.local/bin:$PATH"

# Agent config env (PI_CONFIG_FILES / OPENCODE_CONFIG): container detection,
# opencode permission tier, and the omp devcontainer overlay. Shared with
# `.profile` (POSIX sh) so captain-miao's pooled/remote session spawn — which
# runs `sh -lc ...` and never reads this file — gets the same behaviour. Edit
# `.agent-env.sh`, not this block, to change the logic.
[[ -f "$HOME/.agent-env.sh" ]] && source "$HOME/.agent-env.sh"

# Diagnostic helper, zsh-only: dash (the `sh` `.profile` sources) rejects
# hyphens in function names, so this stays out of `.agent-env.sh`. Reads
# $opencode_permission/$OPENCODE_CONFIG left behind by that sourced file.
opencode-perm() {
  echo "opencode tier: $opencode_permission${OPENCODE_CONFIG:+ ($OPENCODE_CONFIG)}"
}

if [[ "$(uname)" == "Darwin" ]]; then
  export NEURALWATT_API_KEY="$(security find-generic-password -s "neuralwatt-api-key" -w)"
fi
