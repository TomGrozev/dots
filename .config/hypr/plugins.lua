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
