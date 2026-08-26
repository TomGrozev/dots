# POSIX login-shell profile — sourced by `sh -l`. `.zshrc`/`.zshenv` never run
# here; zsh has its own login file (`.zprofile`), and `sh` doesn't read it.
#
# This path exists for captain-miao: pooled/remote coding-agent sessions are
# spawned as `sh -lc '... exec "$@"'` on the target host (see `.agent-env.sh`
# for the full explanation), so anything a devcontainer session needs — right
# now, PI_CONFIG_FILES and OPENCODE_CONFIG — has to be set from here too, not
# just from `.zshenv`.
[ -f "$HOME/.agent-env.sh" ] && . "$HOME/.agent-env.sh"
