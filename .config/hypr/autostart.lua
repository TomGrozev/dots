-- Everything that must exist once per session. uwsm owns the processes so they
-- die with the session and appear under the same app scope as the rest of the
-- desktop. Wallpaper and tip come last: both wait for the session to settle.
hl.on("hyprland.start", function()
    -- Noctalia owns the bar, notifications, OSD, launcher, clipboard, lock,
    -- idle, wallpaper and session panels. It is a service, not a scope, so
    -- systemd brings the shell back if it crashes.
    hl.exec_cmd("uwsm app -t service -p Restart=on-failure -- noctalia")
    for _, cmd in ipairs({
        -- hyprsunset exits if hyprland-ctm-control-v1 is not up yet, and its user
        -- unit only waits for WAYLAND_DISPLAY/graphical-session.target. Starting
        -- it from hyprland.start guarantees the protocol global exists first.
        "hyprsunset",
        "polar-wall restore",
        "polar-tip --login",
    }) do
        hl.exec_cmd("uwsm app -- " .. cmd)
    end
end)
