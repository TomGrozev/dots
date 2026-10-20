-- Everything that must exist once per session. uwsm owns the processes so they
-- die with the session and appear under the same app scope as the rest of the
-- desktop. Wallpaper and tip come last: both wait for the session to settle.
hl.on("hyprland.start", function()
    for _, cmd in ipairs({
        "awww-daemon",
        "ironbar",
        "mako",
        "wl-paste --watch cliphist store",
        "wl-clip-persist --clipboard regular",
        "hypridle",
        "polar-wall restore",
        "polar-tip --login",
    }) do
        hl.exec_cmd("uwsm app -- " .. cmd)
    end
end)
