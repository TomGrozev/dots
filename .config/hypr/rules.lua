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

-- Quick-use apps: opened to do one thing and closed again. They float centred
-- so the tiling layout underneath keeps its shape. Bitwarden is a vault
-- glance; nwg-look and qt6ct change one appearance setting. Add another class
-- when an app fits that shape. The float must be set before no-shadow-tiled,
-- which tests `float = false` and would otherwise flatten these windows.
hl.window_rule({
    name  = "polar-quick-float",
    match = { class = "^(Bitwarden|nwg-look|qt6ct)$" },
    float = true,
    center = true,
})

-- Bitwarden asks for nearly the full monitor height, which would read as a
-- workspace rather than a panel, so it gets a fixed size.
hl.window_rule({
    name  = "polar-bitwarden-size",
    match = { class = "^Bitwarden$" },
    size  = "(monitor_w*0.3) (monitor_h*0.65)",
})

-- Hypr-DarkWindow inverts the focused window on demand with SUPER+Space i.
-- An app that should always start inverted gets a rule here; the list stays
-- empty because no class has been checked yet. Read the real class from
-- `hyprctl clients` before adding one.
-- hl.window_rule({
--     name  = "polar-darkwindow",
--     match = { class = "^SomeApp$" },
--     ["darkwindow:shade"] = "invert",
-- })

-- Blur is off for normal windows (layers get it from the layer rules below);
-- the global switch in look.lua must stay on for layer blur to work.
hl.window_rule({
    name  = "no-blur-windows",
    match = { class = ".*" },
    no_blur = true,
})

-- Tiled windows get no shadow: with blur.xray on, a shadow on every tile is
-- pure GPU cost on the 1060 and doubles the dark seam the gaps already draw.
hl.window_rule({
    name      = "no-shadow-tiled",
    match     = { float = false },
    no_shadow = true,
})

-- Ghostty is the glass: the terminal and its seven drop-down TUIs are translucent
-- (background-opacity 0.85 in ghostty-glass.conf) and rely on the compositor to
-- blur behind them. This rule must stay after no-blur-windows, which it overrides.
hl.window_rule({
    name    = "ghostty-glass",
    match   = { class = "^(com\\.mitchellh\\.ghostty|polar\\.tui\\.(term|files|top|audio|git|bluetooth|dua))$" },
    no_blur = false,
})

-- Drop-down TUIs: one class per scratchpad, mapped to its special workspace.
-- size/center are monitor-relative so the scratchpad looks the same on any output.
-- The size must be hwlang expressions: Hyprland 0.56 silently ignores `%` sizes
-- and the window then falls back to the app's requested 800x600 default. It stays
-- at 80% so btop gets well over its 80x24 cell minimum.
for _, name in ipairs({ "term", "files", "top", "audio", "git", "bluetooth", "dua" }) do
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

-- Workspace 9 runs the scrolling layout as a trial next to the tiling
-- workspaces. Polar's window rules still apply and SUPER+hjkl moves focus
-- along the tape through the normal movefocus dispatcher. Two limits: with a
-- fullscreen window, directional focus looks for another monitor instead of
-- scrolling the tape (the layout's `focus` message is the way round it), and
-- SUPER+CTRL+hjkl still resizes in pixels rather than column widths.
hl.workspace_rule({
    workspace   = "9",
    layout      = "scrolling",
    layout_opts = { direction = "right" },
})

-- Keep 1..10 alive so Noctalia's workspace widget always shows a stable row of
-- ten targets.
for i = 1, 10 do
    hl.workspace_rule({ workspace = tostring(i), persistent = true })
end

-- hyprglass trial: only the drop-down TUIs and floating windows get glass.
-- The plugin block in plugins.lua keeps hyprglass globally off and lets these
-- tags opt in, so tiled windows keep Hyprland's cheap blur-free path. That
-- block's manage_window_blur sets no_blur on tagged windows, so glass replaces
-- Hyprland's blur on them instead of stacking a second blur on top.
hl.window_rule({
    name  = "polar-glass-tui",
    match = { class = "^(com\\.mitchellh\\.ghostty|polar\\.tui\\.(term|files|top|audio|git|bluetooth|dua))$" },
    tag   = "+hyprglass_enabled",
})

hl.window_rule({
    name  = "polar-glass-float",
    match = { float = true },
    tag   = "+hyprglass_enabled",
})

-- Settings and dialogs should not be tiled.
hl.window_rule({
    name  = "polar-pavucontrol",
    match = { class = "^pavucontrol$" },
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

-- Layer surfaces: the bar, launcher, notifications, OSD and the which-key
-- popup are translucent Nord surfaces, so they get the blur the windows opt
-- out of.
-- wlr-which-key 1.3.0 has no namespace option; it creates `wlr_which_key`.
-- blur.xray is on globally, but these layers sit over real windows, so xray is
-- turned back off per layer: they must blur what is actually behind them.
-- Noctalia animates its own surfaces, so Hyprland's layer animations are off
-- for every shell namespace. Without this, a panel reopened while closing tears
-- as both animations run. Blur is per layer because windows opt out.
hl.layer_rule({
    name  = "noctalia-no-anim",
    match = { namespace = "^noctalia-(bar-.+|notification|dock|panel|attached-panel|osd|window-switcher)$" },
    no_anim = true,
})

hl.layer_rule({
    name         = "noctalia-blur",
    match        = { namespace = "^noctalia-(bar-.+|notification|dock|panel|attached-panel|osd|window-switcher)$" },
    ignore_alpha = 0.5,
    blur         = true,
    blur_popups  = true,
    xray         = false,
})

-- wlr-which-key 1.3.0 has no namespace option; it creates `wlr_which_key`.
hl.layer_rule({
    name         = "polar-which-key",
    match        = { namespace = "^wlr_which_key$" },
    blur         = true,
    ignore_alpha = 0.5,
    xray         = false,
})

-- Noctalia's settings window is a utility panel, not a tile.
hl.window_rule({
    name  = "polar-noctalia-settings",
    match = { class = "^dev\\.noctalia\\.Noctalia$" },
    float = true,
    center = true,
    size  = "(monitor_w*0.5625) (monitor_h*0.85)",
})
