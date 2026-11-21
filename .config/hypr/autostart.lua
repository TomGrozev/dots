-- Everything that must exist once per session. uwsm owns the processes so they
-- die with the session and appear under the same app scope as the rest of the
-- desktop. Wallpaper and tip come last: both wait for the session to settle.
hl.on("hyprland.start", function()
    -- A service, not a scope, so systemd brings the bar back when it crashes.
    -- ironbar has segfaulted inside the NVIDIA driver while GTK tore down a
    -- popup's Vulkan renderer (2026-11-21 coredump, driver 580.196.07).
    hl.exec_cmd("uwsm app -t service -p Restart=on-failure -- ironbar")
    for _, cmd in ipairs({
        "awww-daemon",
        "mako",
        "wl-paste --watch cliphist store",
        "wl-clip-persist --clipboard regular",
        "hypridle",
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
