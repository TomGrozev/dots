-- Everything that must exist once per session. uwsm owns the processes so they
-- die with the session and appear under the same app scope as the rest of the
-- desktop. Wallpaper and tip come last: both wait for the session to settle.
hl.on("hyprland.start", function()
    -- Noctalia owns the bar, notifications, OSD, launcher, clipboard, lock,
    -- idle, wallpaper and session panels. It is a service, not a scope, so
    -- systemd brings the shell back if it crashes.
    hl.exec_cmd("uwsm app -t service -p Restart=on-failure -- noctalia")
    for _, cmd in ipairs({
        "polar-wall restore",
        "polar-tip --login",
    }) do
        hl.exec_cmd("uwsm app -- " .. cmd)
    end
end)
