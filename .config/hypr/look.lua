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

        -- Inner glow marks the focused window. It draws inside the frame, so it
        -- lies over the content and neither replaces the border nor adds to the
        -- shadow. color_inactive must be set by hand: when it is unset Hyprland
        -- falls back to color, which would glow every tile. Alpha 00 keeps
        -- inactive windows dark. The gradient is the same Nord8 -> Nord10 as
        -- the active border, so the two read as one object.
        --
        -- The shader fades the colour out as pow(1 - distance/range, power), so
        -- both the alpha and the range set how far the halo reaches. At alpha 40
        -- with range 12 it reached only about 3 px and the 2 px border hid the
        -- rest. Alpha 66 with range 16 gives a measurable edge of about 25 to 40
        -- levels at 2 px that fades out by 14 px.
        glow = {
            enabled        = true,
            range          = 16,
            render_power   = 2,
            color          = { colors = { "#88C0D066", "#5E81AC66" }, angle = 45 },
            color_inactive = { colors = { "#2E344000" }, angle = 45 },
        },

        -- Motion blur removes the stepping of fast moves on a 60Hz panel. It
        -- costs frames only while a window moves or resizes. samples 5 is the
        -- lowest value that still looks smooth on this GPU; 7 costs a third
        -- more.
        motion_blur = {
            enabled = true,
            samples = 5,
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
