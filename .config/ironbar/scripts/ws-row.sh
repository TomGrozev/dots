#!/usr/bin/env bash
# Renders the workspace dot row for the bar.
#
# Why this exists: Hyprland 0.57 changed the workspace IPC data. Special and
# named workspaces now carry a name instead of a numeric id, in both the JSON
# and the socket2 events. ironbar 0.19.1 reads that data through
# hyprland-rs 0.4.0-beta.3, which needs a numeric id. The workspace module
# therefore gets no data at all, and its event listener stops on the first
# special-workspace event. This script reads the same state with hyprctl and
# prints one Pango markup line, so the pill row keeps working until ironbar
# reads the 0.57 data.
#
# The look mirrors the old module: a dim dot for an empty favourite, a bright
# dot for an occupied one, and the digit on a filled pill for the focused one.
set -euo pipefail

readonly FAVOURITES=(1 2 3 4 5 6 7 8 9 10)
readonly DOT_ON="#c6cfdd"
readonly DOT_OFF="#4c566a"
readonly PILL_BG="#88c0d0"
readonly PILL_FG="#2e3440"

active=$(hyprctl monitors -j | jq -r 'first(.[] | select(.focused) | .activeWorkspace.name) // ""')
occupied=$(hyprctl workspaces -j | jq -r '.[] | select(.name | startswith("special:") | not) | select(.windows > 0) | .name')

row=""
for ws in "${FAVOURITES[@]}"; do
    if [[ $ws == "$active" ]]; then
        row+="<span background='${PILL_BG}' foreground='${PILL_FG}'>  ${ws}  </span>  "
    elif grep -qxF -- "$ws" <<<"$occupied"; then
        row+="<span foreground='${DOT_ON}'>●</span>  "
    else
        row+="<span foreground='${DOT_OFF}'>●</span>  "
    fi
done

printf '%s\n' "$row"
