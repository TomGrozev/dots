-- Single source of truth for every user-facing action.
-- Leader tree -> wlr-which-key YAML; leader + direct binds -> cheatsheet.tsv.
-- Both files are regenerated on every config load, so they cannot drift.
--
-- Leader convention: lowercase key = TUI, Shift+key = GUI counterpart.

local home = assert(os.getenv("HOME"), "HOME is not set")
local cache = (os.getenv("XDG_CACHE_HOME") or home .. "/.cache") .. "/polar"

local function lua_cmd(expr)
    return "hyprctl eval '" .. expr .. "'"
end

local leader = {
    { key = "Return", group = "Apps", desc = "terminal", cmd = "ghostty" },
    { key = "space", group = "Apps", desc = "launcher (fuzzel)", cmd = "fuzzel" },
    { key = "t", group = "Apps", desc = "drop-down terminal", cmd = lua_cmd('Polar.tui("term")') },
    { key = "f", group = "Apps", desc = "files (yazi)", cmd = lua_cmd('Polar.tui("files")') },
    { key = "F", group = "Apps", desc = "Files (Thunar)", cmd = "thunar" },
    { key = "b", group = "Apps", desc = "btop", cmd = lua_cmd('Polar.tui("top")') },
    { key = "B", group = "Apps", desc = "Mission Center", cmd = "missioncenter" },
    { key = "a", group = "Apps", desc = "audio (wiremix)", cmd = lua_cmd('Polar.tui("audio")') },
    { key = "A", group = "Apps", desc = "Pavucontrol", cmd = "pavucontrol" },
    { key = "g", group = "Apps", desc = "lazygit", cmd = lua_cmd('Polar.tui("git")') },
    { key = "w", group = "Apps", desc = "Firefox", cmd = "firefox" },
    { key = "W", group = "Apps", desc = "Chromium", cmd = "chromium" },
    { key = "c", group = "Apps", desc = "clipboard", cmd = "polar-clip" },

    { key = "s", group = "Screenshot", desc = "screenshot", submenu = {
        { key = "r", desc = "region", cmd = "polar-shot region" },
        { key = "w", desc = "window", cmd = "polar-shot window" },
        { key = "s", desc = "screen", cmd = "polar-shot screen" },
    } },

    { key = "r", group = "Recording", desc = "record", submenu = {
        { key = "r", desc = "region", cmd = "polar-record region" },
        { key = "s", desc = "screen", cmd = "polar-record screen" },
        { key = "x", desc = "stop", cmd = "polar-record stop" },
    } },

    { key = "n", group = "Notifications", desc = "notifications", submenu = {
        { key = "d", desc = "do-not-disturb", cmd = "polar-dnd" },
        { key = "x", desc = "dismiss all", cmd = "makoctl dismiss --all" },
        { key = "h", desc = "restore last", cmd = "makoctl restore" },
    } },

    { key = "z", group = "Modes", desc = "focus mode", cmd = "polar-focus" },

    { key = "v", group = "Wallpaper", desc = "wallpaper", submenu = {
        { key = "n", desc = "next", cmd = "polar-wall next" },
    } },

    { key = "m", group = "Modes", desc = "modes", submenu = {
        { key = "r", desc = "resize windows", cmd = lua_cmd('hl.dispatch(hl.dsp.submap("resize"))') },
    } },

    { key = "p", group = "System", desc = "power", cmd = "polar-power" },
    { key = "?", group = "Help", desc = "cheat sheet", cmd = "polar-cheatsheet" },

    { key = "h", group = "Help", desc = "help", submenu = {
        { key = "t", desc = "tip now", cmd = "polar-tip --now" },
        { key = "o", desc = "tips off", cmd = "polar-tip --off" },
        { key = "O", desc = "tips on", cmd = "polar-tip --on" },
    } },
}

-- Direct binds. `action` feeds hl.bind; `cmd` is the equivalent shell command
-- used by the cheat sheet (Lua bind dispatchers are not readable from
-- hyprctl, so the shell form is written next to it).
local direct = {}

local function add(entry)
    direct[#direct + 1] = entry
end

local function focus(key, dir, label)
    add({
        chord  = "SUPER + " .. key,
        group  = "Navigation",
        desc   = "Focus " .. label,
        action = hl.dsp.focus({ direction = dir }),
        cmd    = lua_cmd('hl.dispatch(hl.dsp.focus({ direction = "' .. dir .. '" }))'),
    })
end

local function nav(key, dir, label)
    add({
        chord  = "SUPER + " .. key,
        group  = "Navigation",
        desc   = "Navigate " .. label .. " (windows, zellij, nvim)",
        action = hl.dsp.exec_cmd("polar-nav " .. dir),
        cmd    = "polar-nav " .. dir,
    })
end

local function move_window(key, dir, label)
    add({
        chord  = "SUPER + SHIFT + " .. key,
        group  = "Windows",
        desc   = "Move window " .. label,
        action = hl.dsp.window.move({ direction = dir }),
        cmd    = lua_cmd('hl.dispatch(hl.dsp.window.move({ direction = "' .. dir .. '" }))'),
    })
end

local function resize_window(key, label, x, y)
    add({
        chord  = "SUPER + CTRL + " .. key,
        group  = "Windows",
        desc   = "Resize window " .. label,
        action = hl.dsp.window.resize({ x = x, y = y, relative = true }),
        cmd    = lua_cmd("hl.dispatch(hl.dsp.window.resize({ x = " .. x .. ", y = " .. y .. ", relative = true }))"),
    })
end

-- Magnifier. Super + wheel zooms the whole screen around the cursor, which
-- makes a scroll wheel read as a magnifying glass. Factor 1 is off; 3 is the
-- point where the cursor path becomes hard to follow, and every step up costs
-- the GTX 1060 a full-resolution blit per frame.
local ZOOM_MIN, ZOOM_MAX, ZOOM_STEP = 1.0, 3.0, 0.25

local function set_zoom(factor)
    factor = math.min(ZOOM_MAX, math.max(ZOOM_MIN, factor))
    -- Two decimals keep repeated 0.25 steps from drifting, and stop the value
    -- from growing a long float tail in the cheat sheet output.
    factor = math.floor(factor * 100 + 0.5) / 100
    hl.config({ cursor = { zoom_factor = factor } })
    -- The zoom is a prop, not a live render state: refresh it in this call so
    -- the frame after the wheel tick is already scaled.
    hl.exec_scheduled_prop_refresh_immediately()
end

--- Zoom the screen by `step`, clamped to the readable range.
-- Global because the cheat sheet runs the action through `hyprctl eval`.
function Polar.zoom(step)
    local current = hl.get_config("cursor.zoom_factor")
    if type(current) ~= "number" then current = ZOOM_MIN end
    set_zoom(current + step)
end

--- Return the screen to 1:1.
function Polar.zoom_reset()
    set_zoom(ZOOM_MIN)
end

-- Apps
add({ chord = "SUPER + Return", group = "Apps", desc = "Open terminal", action = hl.dsp.exec_cmd("ghostty"), cmd = "ghostty" })
add({ chord = "SUPER + D", group = "Apps", desc = "Open launcher", action = hl.dsp.exec_cmd("fuzzel"), cmd = "fuzzel" })
add({
    chord  = "SUPER + Space",
    group  = "Apps",
    desc   = "Leader menu (which-key)",
    action = hl.dsp.exec_cmd("wlr-which-key " .. cache .. "/which-key.yaml"),
    cmd    = "wlr-which-key " .. cache .. "/which-key.yaml",
})
add({
    chord  = "SUPER + grave",
    group  = "Apps",
    desc   = "Toggle drop-down terminal",
    action = function() Polar.tui("term") end,
    cmd    = lua_cmd('Polar.tui("term")'),
})

-- Windows
add({ chord = "SUPER + Q", group = "Windows", desc = "Close window", action = hl.dsp.window.close(), cmd = lua_cmd("hl.dispatch(hl.dsp.window.close())") })
add({ chord = "SUPER + F", group = "Windows", desc = "Toggle fullscreen", action = hl.dsp.window.fullscreen(), cmd = lua_cmd("hl.dispatch(hl.dsp.window.fullscreen())") })
add({ chord = "SUPER + V", group = "Windows", desc = "Toggle floating", action = hl.dsp.window.float({ action = "toggle" }), cmd = lua_cmd('hl.dispatch(hl.dsp.window.float({ action = "toggle" }))') })
add({ chord = "SUPER + mouse:272", group = "Mouse", desc = "Drag window", action = hl.dsp.window.drag(), cmd = lua_cmd("hl.dispatch(hl.dsp.window.drag())") })
add({ chord = "SUPER + mouse:273", group = "Mouse", desc = "Resize window with mouse", action = hl.dsp.window.resize(), cmd = lua_cmd("hl.dispatch(hl.dsp.window.resize())") })

for _, d in ipairs({ { "H", "left" }, { "J", "down" }, { "K", "up" }, { "L", "right" } }) do
    move_window(d[1], d[2], d[2])
end

resize_window("H", "narrower", -50, 0)
resize_window("J", "taller", 0, 50)
resize_window("K", "shorter", 0, -50)
resize_window("L", "wider", 50, 0)

-- Navigation
for _, d in ipairs({ { "H", "left" }, { "J", "down" }, { "K", "up" }, { "L", "right" } }) do
    nav(d[1], d[2], d[2])
end
for _, dir in ipairs({ "left", "down", "up", "right" }) do
    focus(dir, dir, dir)
end

-- Workspace overview. The plugin is optional, so a missing build reports itself
-- instead of doing nothing on the keypress.
local function overview()
    if hl.plugin.hyprexpo == nil then
        hl.notification.create({ text = "Workspace overview needs the hyprexpo plugin. Run install.sh.", timeout = 3000 })
        return
    end
    hl.plugin.hyprexpo.expo("toggle")
end

add({
    chord  = "SUPER + Tab",
    group  = "Navigation",
    desc   = "Toggle workspace overview",
    action = overview,
    cmd    = "hyprctl dispatch hyprexpo:expo toggle",
})

-- Workspaces: 1..9 and 0 for the tenth.
for i = 1, 10 do
    local key = i % 10
    add({
        chord  = "SUPER + " .. key,
        group  = "Workspaces",
        desc   = "Switch to workspace " .. i,
        action = hl.dsp.focus({ workspace = i }),
        cmd    = lua_cmd("hl.dispatch(hl.dsp.focus({ workspace = " .. i .. " }))"),
    })
    add({
        chord  = "SUPER + SHIFT + " .. key,
        group  = "Workspaces",
        desc   = "Move window to workspace " .. i,
        action = hl.dsp.window.move({ workspace = i }),
        cmd    = lua_cmd("hl.dispatch(hl.dsp.window.move({ workspace = " .. i .. " }))"),
    })
end

-- System and help
add({ chord = "SUPER + slash", group = "Help", desc = "Search cheat sheet", action = hl.dsp.exec_cmd("polar-cheatsheet"), cmd = "polar-cheatsheet" })
add({ chord = "SUPER + Z", group = "Modes", desc = "Toggle focus mode", action = hl.dsp.exec_cmd("polar-focus"), cmd = "polar-focus" })
add({ chord = "SUPER + Escape", group = "System", desc = "Lock screen", action = hl.dsp.exec_cmd("hyprlock"), cmd = "hyprlock" })
add({ chord = "Print", group = "Screenshot", desc = "Screenshot region", action = hl.dsp.exec_cmd("polar-shot region"), cmd = "polar-shot region" })
add({ chord = "SUPER + C", group = "System", desc = "Pick colour from screen", action = hl.dsp.exec_cmd("polar-pick"), cmd = "polar-pick" })

-- Magnifier. Two wheel directions on the same modifier as window drag, which
-- the wheel does not use, so nothing competes for these chords.
add({ chord = "SUPER + mouse_down", group = "Zoom", desc = "Zoom in", action = function() Polar.zoom(ZOOM_STEP) end, cmd = lua_cmd("Polar.zoom(" .. ZOOM_STEP .. ")") })
add({ chord = "SUPER + mouse_up", group = "Zoom", desc = "Zoom out", action = function() Polar.zoom(-ZOOM_STEP) end, cmd = lua_cmd("Polar.zoom(-" .. ZOOM_STEP .. ")") })
add({ chord = "SUPER + SHIFT + Z", group = "Zoom", desc = "Reset zoom", action = Polar.zoom_reset, cmd = lua_cmd("Polar.zoom_reset()") })

-- Media keys. polar-volume drives wpctl, which follows the default sink/source,
-- so it also works when PipeWire moves the default device.
add({ chord = "XF86AudioRaiseVolume", group = "Media", desc = "Volume up", action = hl.dsp.exec_cmd("polar-volume up"), cmd = "polar-volume up", opts = { locked = true, repeating = true } })
add({ chord = "XF86AudioLowerVolume", group = "Media", desc = "Volume down", action = hl.dsp.exec_cmd("polar-volume down"), cmd = "polar-volume down", opts = { locked = true, repeating = true } })
add({ chord = "XF86AudioMute", group = "Media", desc = "Mute output", action = hl.dsp.exec_cmd("polar-volume mute"), cmd = "polar-volume mute", opts = { locked = true, repeating = true } })
add({ chord = "XF86AudioMicMute", group = "Media", desc = "Mute microphone", action = hl.dsp.exec_cmd("polar-volume mic-mute"), cmd = "polar-volume mic-mute", opts = { locked = true, repeating = true } })

-- Transport keys. polar-media picks Sidra first, then any playing MPRIS player,
-- so one set of keys keeps working when another player takes over. locked lets
-- them work on the lock screen; repeat is off because a held Play pauses and
-- resumes in a loop.
add({ chord = "XF86AudioPlay", group = "Media", desc = "Play or pause", action = hl.dsp.exec_cmd("polar-media play-pause"), cmd = "polar-media play-pause", opts = { locked = true } })
add({ chord = "XF86AudioPause", group = "Media", desc = "Pause", action = hl.dsp.exec_cmd("polar-media pause"), cmd = "polar-media pause", opts = { locked = true } })
add({ chord = "XF86AudioStop", group = "Media", desc = "Stop playback", action = hl.dsp.exec_cmd("polar-media stop"), cmd = "polar-media stop", opts = { locked = true } })
add({ chord = "XF86AudioNext", group = "Media", desc = "Next track", action = hl.dsp.exec_cmd("polar-media next"), cmd = "polar-media next", opts = { locked = true } })
add({ chord = "XF86AudioPrev", group = "Media", desc = "Previous track", action = hl.dsp.exec_cmd("polar-media previous"), cmd = "polar-media previous", opts = { locked = true } })

-- Generation ---------------------------------------------------------------

local function q(s)
    return '"' .. tostring(s):gsub("\\", "\\\\"):gsub('"', '\\"'):gsub("\n", "\\n") .. '"'
end

local function leader_rows()
    local rows = {}
    local function walk(nodes, prefix, group)
        for _, node in ipairs(nodes) do
            local chord = prefix == "" and node.key or (prefix .. " " .. node.key)
            local g = node.group or group
            if node.submenu then
                walk(node.submenu, chord, g)
            else
                rows[#rows + 1] = { g, "SUPER+Space " .. chord, node.desc, node.cmd }
            end
        end
    end
    walk(leader, "", nil)
    return rows
end

local function yaml_menu(nodes, indent)
    local out = {}
    for _, node in ipairs(nodes) do
        out[#out + 1] = indent .. "- key: " .. q(node.key)
        out[#out + 1] = indent .. "  desc: " .. q(node.desc)
        if node.submenu then
            out[#out + 1] = indent .. "  submenu:"
            for _, line in ipairs(yaml_menu(node.submenu, indent .. "    ")) do
                out[#out + 1] = line
            end
        else
            out[#out + 1] = indent .. "  cmd: " .. q(node.cmd)
        end
    end
    return out
end

local function which_key_yaml()
    local lines = {
        'font: "FiraCode Nerd Font 12"',
        'background: "#2E3440E6"',
        'color: "#D8DEE9"',
        'border: "#4C566A"',
        'separator: "  "',
        "border_width: 2",
        "corner_r: 8",
        "padding: 14",
        "rows_per_column: 8",
        "column_padding: 28",
        "anchor: center",
        "inhibit_compositor_keyboard_shortcuts: true",
        "menu:",
    }
    for _, line in ipairs(yaml_menu(leader, "  ")) do
        lines[#lines + 1] = line
    end
    return table.concat(lines, "\n") .. "\n"
end

local function human_chord(chord)
    return (chord:gsub("%s*%+%s*", "+")
        :gsub("SHIFT", "Shift")
        :gsub("CTRL", "Ctrl")
        :gsub("%+slash", "+/")
        :gsub("%+grave", "+`"))
end

local function cheatsheet_tsv()
    local rows = leader_rows()
    for _, bind in ipairs(direct) do
        rows[#rows + 1] = {
            bind.group,
            human_chord(bind.chord),
            bind.desc,
            bind.cmd,
        }
    end

    local lines = {}
    for _, row in ipairs(rows) do
        lines[#lines + 1] = table.concat(row, "\t")
    end
    return table.concat(lines, "\n") .. "\n"
end

local function write_file(path, data)
    local file = io.open(path, "w")
    if not file then return false end
    file:write(data)
    file:close()
    return true
end

-- os.execute is the only mkdir available to Lua; it runs once per reload.
os.execute("mkdir -p '" .. cache .. "'")
write_file(cache .. "/which-key.yaml", which_key_yaml())
write_file(cache .. "/cheatsheet.tsv", cheatsheet_tsv())

return { leader = leader, direct = direct }
