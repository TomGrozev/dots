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

-- Tiled windows get no shadow: with blur.xray on, a shadow on every tile is
-- pure GPU cost on the 1060 and doubles the dark seam the gaps already draw.
hl.window_rule({
    name      = "no-shadow-tiled",
    match     = { float = false },
    no_shadow = true,
})

-- Ghostty is the glass: the terminal and its five drop-down TUIs are translucent
-- (background-opacity 0.94) and rely on the compositor to blur behind them.
-- This rule must stay after no-blur-windows, which it overrides.
hl.window_rule({
    name    = "ghostty-glass",
    match   = { class = "^(com\\.mitchellh\\.ghostty|polar\\.tui\\.(term|files|top|audio|git))$" },
    no_blur = false,
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
-- blur.xray is on globally, but these layers sit over real windows, so xray is
-- turned back off per layer: they must blur what is actually behind them.
-- Motion is per layer, reusing the polar curves: the launcher pops from its
-- centre, notifications slide in from the right edge (mako is anchored there),
-- and the bar drops in from the top. The bar used to hold still as permanent
-- furniture; it now earns the same entrance as the other surfaces, and the
-- slide doubles as the return from focus mode, which hides the bar and shows
-- it again. A layer rule can only name the style: the curve and speed come
-- from layersIn/layersOut in motion.lua, which is the polarFade curve.
hl.layer_rule({
    name         = "polar-bar",
    match        = { namespace = "^ironbar$" },
    blur         = true,
    ignore_alpha = 0.5,
    xray         = false,
    animation    = "slide top",
})

hl.layer_rule({
    name         = "polar-launcher",
    match        = { namespace = "^launcher$" },
    blur         = true,
    ignore_alpha = 0.5,
    xray         = false,
    animation    = "popin 90%",
})

hl.layer_rule({
    name         = "polar-notifications",
    match        = { namespace = "^notifications$" },
    blur         = true,
    ignore_alpha = 0.5,
    xray         = false,
    animation    = "slide right",
})

hl.layer_rule({
    name         = "polar-which-key",
    match        = { namespace = "^wlr_which_key$" },
    blur         = true,
    ignore_alpha = 0.5,
    xray         = false,
})
