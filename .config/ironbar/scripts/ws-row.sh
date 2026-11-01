#!/usr/bin/env bash
# Renders the workspace row for the bar.
#
# Why this exists: Hyprland 0.57 changed the workspace IPC data. Special and
# named workspaces now carry a name instead of a numeric id, in both the JSON
# and the socket2 events. ironbar 0.19.1 reads that data through
# hyprland-rs 0.4.0-beta.3, which needs a numeric id. The workspace module
# therefore gets no data at all, and its event listener stops on the first
# special-workspace event. This script reads the same state with hyprctl and
# prints one Pango markup line, so the row keeps working until ironbar reads
# the 0.57 data.
#
# The row has three marks: a bright dot for an occupied workspace, a small and
# dim dot for an empty one, and a capsule for the focused one. The capsule is
# built from two Nerd Font powerline caps with the digit between them, because
# Pango can fill a text background but cannot round its corners.
#
# Pitch is the type, not padding: the row is monospace at 10px in style.css,
# so one glyph plus one space is 12px. The `letter_spacing` on the small dot
# gives back the 1px that the smaller glyph loses, so every slot stays 12px.
# The extra two spaces after workspace 5 split the row into two clusters of
# five, which is how a slot is found without counting.
set -euo pipefail

readonly FAVOURITES=(1 2 3 4 5 6 7 8 9 10)
readonly DOT_ON="#c6cfdd"
readonly DOT_OFF="#4c566a"
readonly CAP_BG="#88c0d0"
readonly CAP_FG="#2e3440"
readonly CAP_L=$'\ue0b6'
readonly CAP_R=$'\ue0b4'

active=$(hyprctl monitors -j | jq -r 'first(.[] | select(.focused) | .activeWorkspace.name) // ""')
occupied=$(hyprctl workspaces -j | jq -r '.[] | select(.name | startswith("special:") | not) | select(.windows > 0) | .name')

row=""
for ws in "${FAVOURITES[@]}"; do
    if [[ $ws == "$active" ]]; then
        row+="<span foreground='${CAP_BG}'>${CAP_L}</span>"
        row+="<span background='${CAP_BG}' foreground='${CAP_FG}' weight='bold'> ${ws} </span>"
        row+="<span foreground='${CAP_BG}'>${CAP_R}</span> "
    elif grep -qxF -- "$ws" <<<"$occupied"; then
        row+="<span foreground='${DOT_ON}'>●</span> "
    else
        row+="<span size='small' letter_spacing='768' foreground='${DOT_OFF}'>●</span> "
    fi
    # 12px between the clusters: two spaces on top of the slot's own space.
    [[ $ws == 5 ]] && row+="  "
done

printf '%s\n' "$row"
