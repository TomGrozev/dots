# uv
export PATH="$HOME/.local/bin:$PATH"

# Agent config env (PI_CONFIG_FILES / OPENCODE_CONFIG): container detection,
# opencode permission tier, and the omp devcontainer overlay. Shared with
# `.profile` (POSIX sh) so captain-miao's pooled/remote session spawn — which
# runs `sh -lc ...` and never reads this file — gets the same behaviour. Edit
# `.agent-env.sh`, not this block, to change the logic.
[[ -f "$HOME/.agent-env.sh" ]] && source "$HOME/.agent-env.sh"

if [[ "$(uname)" == "Darwin" ]]; then
  export NEURALWATT_API_KEY="$(security find-generic-password -s "neuralwatt-api-key" -w)"
fi
