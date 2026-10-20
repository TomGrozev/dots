-- Visual identity: Nord, 8px corners, tight gaps, 2px borders.
-- Colours are the Nord palette used consistently by the bar, mako and fuzzel.
hl.config({
    general = {
        gaps_in     = 4,
        gaps_out    = 8,
        border_size = 2,

        col = {
            -- Nord8 -> Nord10, the "normal" state; state.lua replaces this at
            -- runtime when a mode or a special workspace takes over.
            active_border   = { colors = { "#88C0D0", "#5E81AC" }, angle = 45 },
            inactive_border = "#3B4252",
        },

        -- Border drag matches the mouse binds in keys.lua.
        resize_on_border = true,
        layout           = "dwindle",
    },

    decoration = {
        rounding       = 8,
        rounding_power = 2,

        active_opacity   = 1.0,
        inactive_opacity = 1.0,
        dim_inactive     = true,
        dim_strength     = 0.12,
        dim_special      = 0.35,

        -- Tiled windows get no shadow (rules.lua); floating glass needs the
        -- larger, softer shadow to read against the wallpaper. render_power 3
        -- with range 20 is the most a 3GB GTX 1060 should render per window.
        shadow = {
            enabled        = true,
            range          = 20,
            render_power   = 3,
            color          = 0x991E232C,
            color_inactive = 0x551E232C,
        },

        -- Blur is enabled globally because layer rules are the only way to blur
        -- layer-shell surfaces; windows opt out through rules.lua's no_blur rule.
        -- xray blurs the wallpaper layer only, so the glass costs the same
        -- whatever is underneath; surfaces that float over real windows (bar,
        -- launcher, notifications, which-key) turn it back off in rules.lua.
        blur = {
            enabled           = true,
            size              = 5,
            passes            = 2,
            ignore_opacity    = true,
            new_optimizations = true,
            popups            = true,
            xray              = true,
        },
    },

    dwindle = {
        preserve_split = true,
    },

    master = {
        new_status = "master",
    },

    misc = {
        disable_hyprland_logo   = true,
        disable_splash_rendering = true,
        force_default_wallpaper = 0,
        focus_on_activate       = false,
        -- Nord0 rather than the default near-black, so the frame before the
        -- wallpaper paints is the same colour as every other surface.
        background_color        = "#2E3440",
    },

    -- The cursor is a pointer, not a decoration; it gets out of the way as
    -- soon as a key is pressed and comes back on the next mouse move.
    cursor = {
        hide_on_key_press = true,
    },
})
