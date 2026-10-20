-- Window and layer rules. Geometry of the Polar.tui() scratchpads lives here
-- (not in the exec call) so the same rule applies on restore after a reload.

hl.window_rule({
    name  = "suppress-maximize-events",
    match = { class = ".*" },
    suppress_event = "maximize",
})

hl.window_rule({
    name  = "fix-xwayland-drags",
    match = {
        class      = "^$",
        title      = "^$",
        xwayland   = true,
        float      = true,
        fullscreen = false,
        pin        = false,
    },
    no_focus = true,
})

hl.window_rule({
    name  = "move-hyprland-run",
    match = { class = "hyprland-run" },
    move  = "20 monitor_h-120",
    float = true,
})

-- Blur is off for normal windows (layers get it from the layer rules below);
-- the global switch in look.lua must stay on for layer blur to work.
hl.window_rule({
    name  = "no-blur-windows",
    match = { class = ".*" },
    no_blur = true,
})

-- Drop-down TUIs: one class per scratchpad, mapped to its special workspace.
-- size/center are monitor-relative so the scratchpad looks the same on any output.
-- The size must be hwlang expressions: Hyprland 0.56 silently ignores `%` sizes
-- and the window then falls back to the app's requested 800x600 default. It stays
-- at 80% so btop gets well over its 80x24 cell minimum.
for _, name in ipairs({ "term", "files", "top", "audio", "git" }) do
    hl.window_rule({
        name      = "polar-tui-" .. name,
        match     = { class = "^polar\\.tui\\." .. name .. "$" },
        float     = true,
        center    = true,
        size      = "(monitor_w*0.8) (monitor_h*0.8)",
        workspace = "special:" .. name,
        animation = "popin 90%",
    })
end

-- Settings and dialogs should not be tiled.
hl.window_rule({
    name  = "polar-pavucontrol",
    match = { class = "^pavucontrol$" },
    float = true,
    center = true,
})

hl.window_rule({
    name  = "polar-mission-center",
    match = { class = "^(missioncenter|io\\.missioncenter\\.MissionCenter)$" },
    float = true,
    center = true,
})

-- Thunar spawns its copy/rename/properties dialogs as separate toplevels.
hl.window_rule({
    name  = "polar-thunar-dialogs",
    match = { class = "^thunar$", title = "^(Rename|Copy|Move|Delete|Create|Properties|Confirm|File Operation)" },
    float = true,
    center = true,
})

-- GTK file pickers (xdg-desktop-portal-gtk and GTK's own chooser).
hl.window_rule({
    name  = "polar-file-pickers",
    match = { class = "^(xdg-desktop-portal-gtk|GtkFileChooserDialog)$" },
    float = true,
    center = true,
})

hl.window_rule({
    name  = "polar-satty",
    match = { class = "^(satty|com\\.grenfeldt\\.satty)$" },
    float = true,
    center = true,
})

-- Layer surfaces: the bar, launcher, notifications and the which-key popup are
-- translucent Nord surfaces, so they get the blur the windows opt out of.
-- wlr-which-key 1.3.0 has no namespace option; it creates `wlr_which_key`.
for _, namespace in ipairs({ "^ironbar$", "^launcher$", "^notifications$", "^wlr_which_key$" }) do
    hl.layer_rule({
        name  = "polar-blur-" .. namespace,
        match = { namespace = namespace },
        blur  = true,
        ignore_alpha = 0.5,
    })
end
