-- Optional plugins, built by hyprpm from install.sh against the running
-- Hyprland. They can be missing (fresh install, or a Hyprland upgrade that
-- invalidated the build), so every block is guarded by the plugin namespace and
-- the config loads without them.
--
-- Plugin options can only be set once the plugin has registered them, so the
-- guard is also what keeps the config free of "unknown option" errors. Plugins
-- load after the config is read, hence the reload below.

-- hyprpm stores which plugins should load; the .so files enter the compositor
-- only when `hyprpm reload` runs. The check skips the work when the plugins are
-- already loaded, so a config reload does not spawn another hyprpm process.
-- The trailing hyprctl reload re-reads this file with the plugins present,
-- which lets the option blocks below register; it runs once per login.
hl.on("hyprland.start", function()
    if #hl.get_loaded_plugins() > 0 then
        return
    end
    hl.exec_cmd("sh -c 'command -v hyprpm >/dev/null && hyprpm reload && hyprctl reload'")
end)

-- Overview tiles use the desktop's own rounding and Nord palette, so the grid
-- reads as the same desktop scaled down rather than a separate surface.
if hl.plugin.hyprexpo ~= nil then
    hl.config({
        plugin = {
            hyprexpo = {
                columns              = 3,
                tile_rounding        = 8,
                gaps_in              = 8,
                gaps_out             = 8,
                bg_col               = "rgb(2E3440)",
                border_width         = 2,
                border_color         = "rgb(3B4252)",
                border_color_current = "rgb(88C0D0)",
                border_color_focus   = "rgb(EBCB8B)",
                border_color_hover   = "rgb(81A1C1)",
                keynav_enable        = 1,
                label_enable         = 1,
                show_cursor          = 1,
            },
        },
    })
end

-- A tilted cursor follows the hand. `full` (degrees at full tilt) and `limit`
-- (px/s that reaches it) are both milder than the defaults, so the pointer
-- leans during fast moves and stays upright for precision work. Nvidia lacks
-- hardware cursor support here and the plugin falls back to software cursors,
-- which costs one draw per frame while the pointer moves.
if hl.plugin.dynamic_cursors ~= nil then
    hl.config({
        plugin = {
            dynamic_cursors = {
                enabled = true,
                mode    = "tilt",
                tilt    = {
                    limit      = 8000,
                    activation = "linear",
                    full       = 15,
                },
            },
        },
    })
end

--- Toggle colour inversion on the focused window.
-- The plugin's dispatcher toggles when the same shader is already applied, so
-- one call inverts and the next call restores the window.
function Polar.invert_window()
    if hl.plugin.darkwindow == nil then
        hl.notification.create({
            text    = "Window invert needs the Hypr-DarkWindow plugin. Run install.sh.",
            timeout = 3000,
        })
        return
    end
    hl.dispatch(hl.plugin.darkwindow.dsp_shade({ shader = "invert" }))
end

-- Only the invert shader is loaded: tint, chromakey and scanner would each
-- compile and cost memory for effects Polar never uses.
if hl.plugin.darkwindow ~= nil then
    hl.config({
        plugin = {
            darkwindow = {
                load_shaders = "invert",
            },
        },
    })
end

-- Focus feedback is already carried by the border and glow turn in motion.lua,
-- so the plugin only shrinks. Keyboard focus moves shrink; mouse focus and
-- group changes stay still, and floating windows are left alone so the
-- drop-down TUIs do not wobble when they take focus. The two plugin leaves
-- reuse the Polar springs.
if hl.plugin.hyprfocus ~= nil then
    hl.config({
        plugin = {
            hyprfocus = {
                enable                   = true,
                animate_floating         = false,
                only_on_monitor_change   = false,
                keyboard_focus_animation = "shrink",
                mouse_focus_animation    = "none",
                group_focus_animation    = "none",
                shrink_percentage        = 0.97,
            },
        },
    })
    hl.animation({ leaf = "hyprfocusIn", enabled = true, speed = 4.5, spring = "polar" })
    hl.animation({ leaf = "hyprfocusOut", enabled = true, speed = 3, spring = "polarOut" })
end

-- hyprglass trial on the GTX 1060. The plugin stays globally off and rules.lua
-- tags the drop-down TUIs and floating windows with hyprglass_enabled, so the
-- tiled desktop keeps Hyprland's cheap no-blur path. manage_window_blur makes
-- the plugin set no_blur on glassed windows: its glass replaces Hyprland's
-- blur rather than stacking a second pass on the same pixels. Layer glass is
-- off because the bar and launcher already blur through rules.lua.
--
-- The effect multiplies the window's own alpha. A window made translucent by a
-- Hyprland `opacity` rule therefore shows weak or broken glass (hyprglass
-- issue 18); Ghostty uses client-side background-opacity, which is the kind
-- that works. Turn the whole trial off with `hyprpm disable hyprglass`.
if hl.plugin.hyprglass ~= nil then
    local hg = hl.plugin.hyprglass

    hg.config({
        enabled             = false,
        manage_window_blur  = true,
        skip_opaque_windows = true,
        blur_fold           = true,
        default_preset      = "polar",
        layers              = { enabled = false },
        windows             = {
            background_cache  = true,
            live_resample     = true,
            live_resample_fps = 30,
        },
    })

    -- Clear and cheap: one blur pass, no grain, no lens, no frost, and a light
    -- Nord tint. The 1060 has no headroom for the default three-pass blur on top
    -- of the glow, shadow and motion blur already running.
    hg.preset("polar", {
        inherits             = "clear",
        blur_strength        = 1.0,
        blur_iterations      = 1,
        noise_strength       = 0.0,
        refraction_strength  = 0.25,
        chromatic_aberration = 0.15,
        fresnel_strength     = 0.2,
        specular_strength    = 0.25,
        glass_opacity        = 0.85,
        tint_color           = 0x2E344026,
    })
end
