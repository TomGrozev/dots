-- Runtime state shared with the polar-* scripts through `hyprctl eval`.
-- The active border is the mode indicator, so every state that owns the desktop
-- funnels through refresh() rather than writing colours in several places.

local flags = { focus = false, recording = false, dnd = false }
local urgent = false

-- Defaults restored when focus mode ends; kept in sync with look.lua.
local FOCUS_ON  = { gaps_in = 0, gaps_out = 0, border_size = 1 }
local FOCUS_OFF = { gaps_in = 4, gaps_out = 8, border_size = 2 }

local TUIS = {
    -- ~/.zshrc auto-attaches the `main` zellij session, which is wrong inside the
    -- drop-down; the env opt-out skips it (the .zshrc guard reads ZELLIJ_AUTOATTACH).
    term  = "ghostty --class=polar.tui.term -e env ZELLIJ_AUTOATTACH=0 zsh",
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

local function tui_window(name)
    local class = "polar.tui." .. name
    for _, win in ipairs(hl.get_windows()) do
        if win.class == class then return win end
    end
end

--- Toggle a drop-down TUI on its own special workspace.
-- The app lives for one window: quitting it (q in btop, exiting lazygit)
-- resets `launched`, so the next shortcut starts a fresh instance.
function Polar.tui(name)
    local cmd = TUIS[name]
    if not cmd then
        error("Polar.tui: unknown scratchpad '" .. tostring(name) .. "'")
    end

    local special = hl.get_active_special_workspace()
    local showing = special ~= nil and special.name == "special:" .. name

    -- A running app: the shortcut only shows or hides its scratchpad.
    if tui_window(name) then
        hl.dispatch(hl.dsp.workspace.toggle_special(name))
        return
    end

    -- No window (the user quit the app): relaunch it. Show the workspace
    -- before the app maps, unless it is already up -- toggling there would
    -- hide it and the new window would open behind the previous workspace.
    -- An already-visible special gets focused by the window.open handler.
    if not showing then
        hl.dispatch(hl.dsp.workspace.toggle_special(name))
    end

    if not launched[name] then
        launched[name] = true
        hl.exec_cmd(cmd)
    end
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

-- A scratchpad launched while its special workspace is already showing maps
-- unfocused (Hyprland leaves focus on the previous window), so the first
-- keystrokes land behind the overlay. Take focus as soon as it appears.
hl.on("window.open", function(win)
    local special = hl.get_active_special_workspace()
    if not special or not win.workspace then return end
    if win.workspace.name ~= special.name then return end
    if not win.class:match("^polar%.tui%.") then return end
    hl.dispatch(hl.dsp.focus({ window = win }))
end)

-- Quitting a TUI must clear its launch state, or the shortcut would only
-- reveal an empty scratchpad for the rest of the session. close carries the
-- class; destroy's Window has none by the time it fires.
hl.on("window.close", function(win)
    local name = win.class:match("^polar%.tui%.(.+)$")
    if name then launched[name] = nil end
end)
