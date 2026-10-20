-- Runtime state shared with the polar-* scripts through `hyprctl eval`.
-- The active border is the mode indicator, so every state that owns the desktop
-- funnels through refresh() rather than writing colours in several places.

local flags = { focus = false, recording = false, dnd = false }
local urgent = false

-- Defaults restored when focus mode ends; kept in sync with look.lua.
local FOCUS_ON  = { gaps_in = 0, gaps_out = 0, border_size = 1 }
local FOCUS_OFF = { gaps_in = 4, gaps_out = 8, border_size = 2 }

local TUIS = {
    term  = "ghostty --class=polar.tui.term",
    files = "ghostty --class=polar.tui.files -e yazi",
    top   = "ghostty --class=polar.tui.top -e btop",
    audio = "ghostty --class=polar.tui.audio -e wiremix",
    git   = "ghostty --class=polar.tui.git -e lazygit",
}
local launched = {}

local function in_mode()
    local submap = hl.get_current_submap()
    return submap ~= "" and submap ~= "default"
end

-- Precedence is a contract with the scripts and the bar: recording wins over
-- resize mode, which wins over an urgent window, which wins over a focused
-- scratchpad, which wins over the normal Nord gradient.
local function active_border()
    if flags.recording then return "#BF616A" end
    if in_mode() then return "#EBCB8B" end
    if urgent then return "#D08770" end
    if hl.get_active_special_workspace() then return "#B48EAD" end
    return { colors = { "#88C0D0", "#5E81AC" }, angle = 45 }
end

local function refresh()
    hl.config({ general = { col = { active_border = active_border() } } })
    hl.exec_scheduled_prop_refresh_immediately()
end

Polar = {}

--- Toggle a drop-down TUI on its own special workspace.
-- Launched once per boot; afterwards the app keeps its state and only the
-- workspace visibility changes.
function Polar.tui(name)
    local cmd = TUIS[name]
    if not cmd then
        error("Polar.tui: unknown scratchpad '" .. tostring(name) .. "'")
    end

    if not launched[name] then
        launched[name] = true
        hl.exec_cmd(cmd)
    end

    hl.dispatch(hl.dsp.workspace.toggle_special(name))
end

--- Set a boolean desktop state; `focus` also changes gaps, border and dimming.
function Polar.set_state(name, on)
    if flags[name] == nil then
        error("Polar.set_state: unknown state '" .. tostring(name) .. "'")
    end
    on = on and true or false
    if flags[name] == on then return end
    flags[name] = on

    if name == "focus" then
        hl.config({
            general     = on and FOCUS_ON or FOCUS_OFF,
            decoration  = { dim_inactive = not on },
        })
    end

    refresh()
end

hl.on("keybinds.submap", refresh)
hl.on("workspace.special_active", refresh)
hl.on("workspace.active", refresh)

-- Urgent windows are announced with Nord11 until focus reaches them.
hl.on("window.urgent", function()
    urgent = true
    refresh()
end)

hl.on("window.active", function()
    if urgent then
        urgent = false
        refresh()
    end
end)
