# uv
export PATH="$HOME/.local/bin:$PATH"

# Keys come from the login keyring, which needs D-Bus: inside a sandbox (or a
# devcontainer) there is no session bus, and secret-tool fails loudly. A failed
# lookup must not clobber a key the caller already exported: a sandboxed omp
# resolves the secrets on the host and passes them in.
_lookup_key() {
  command -v secret-tool >/dev/null 2>&1 || return 1
  [ -n "${DBUS_SESSION_BUS_ADDRESS:-}" ] || return 1
  secret-tool lookup service "$1" 2>/dev/null
}

if [[ "$(uname)" == "Darwin" ]]; then
  key=$(security find-generic-password -s anthropic-oauth-token -w 2>/dev/null) &&
    export ANTHROPIC_OAUTH_TOKEN="$key"
  key=$(security find-generic-password -s neuralwatt-api-key -w 2>/dev/null) &&
    export NEURALWATT_API_KEY="$key"
else
  key=$(_lookup_key anthropic-oauth-token) && [ -n "$key" ] &&
    export ANTHROPIC_OAUTH_TOKEN="$key"
  key=$(_lookup_key neuralwatt-api-key) && [ -n "$key" ] &&
    export NEURALWATT_API_KEY="$key"
fi
unset key
unset -f _lookup_key
