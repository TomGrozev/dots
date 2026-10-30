-- Shared by the bar graphs: Nord colours as cairo RGB and the tooltip file.
-- Loaded with dofile, so each graph gets its own copy and a hot reload of one
-- script does not depend on the other.

local function hex(h)
    return {
        tonumber(h:sub(2, 3), 16) / 255,
        tonumber(h:sub(4, 5), 16) / 255,
        tonumber(h:sub(6, 7), 16) / 255,
    }
end

local M = {
    nord3 = hex("#4c566a"),
    nord4 = hex("#d8dee9"),
    nord8 = hex("#88c0d0"),
    nord9 = hex("#81a1c1"),
    nord11 = hex("#bf616a"),
    nord12 = hex("#d08770"),
    nord13 = hex("#ebcb8b"),
}

function M.source(cr, colour, alpha)
    cr:set_source_rgba(colour[1], colour[2], colour[3], alpha or 1)
end

-- Load colour: the frost accent at rest, Aurora only when the value needs
-- attention, so a calm machine shows a calm bar.
function M.load(percent, rest)
    if percent >= 90 then
        return M.nord11
    elseif percent >= 75 then
        return M.nord12
    end
    return rest
end

-- The tooltip polls this file; $XDG_RUNTIME_DIR is a tmpfs, so the write
-- never touches the disk.
local runtime = os.getenv("XDG_RUNTIME_DIR") or "/tmp"

function M.publish(name, text)
    local f = io.open(runtime .. "/polar-bar-" .. name, "w")
    if f then
        f:write(text)
        f:close()
    end
end

-- Cairo calls a draw for every frame GTK repaints (hover, popups), not only
-- on the timer. Sampling is rate-limited so a repaint never shortens the
-- interval the graph shows.
function M.due(state, seconds)
    local now = ironbar:unixtime().secs
    if state.last and now - state.last < seconds then
        return false
    end
    state.last = now
    return true
end

return M
