# uv
export PATH="$HOME/.local/bin:$PATH"

# opencode permission tiers: 'restrictive' on local, 'permissive' inside
# dev containers. Override explicitly with `OPENCODE_PERMISSION=permissive|restrictive`.
# Leaves OPENCODE_CONFIG untouched if already set (e.g. by a project's .envrc).
opencode_permission=${OPENCODE_PERMISSION:-auto}
if [[ "$opencode_permission" == "auto" ]]; then
  if [[ -n "$REMOTE_CONTAINERS" || -n "$DEVCONTAINER" || -f /.dockerenv || -f /.containerenv ]]; then
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

if [[ "$(uname)" == "Darwin" ]]; then
  export NEURALWATT_API_KEY="$(security find-generic-password -s "neuralwatt-api-key" -w)"
fi
