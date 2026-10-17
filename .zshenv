# uv
export PATH="$HOME/.local/bin:$PATH"

if [[ "$(uname)" == "Darwin" ]]; then
  export ANTHROPIC_OAUTH_TOKEN="$(security find-generic-password -s "anthropic-oauth-token" -w)"
  export NEURALWATT_API_KEY="$(security find-generic-password -s "neuralwatt-api-key" -w)"
  export HA_MCP_API_KEY="$(security find-generic-password -s "ha-mcp-api-key" -w)"
fi
