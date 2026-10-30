-- Memory ring: the used share of RAM as an arc, clockwise from 12 o'clock.
-- "Used" is MemTotal minus MemAvailable, the same figure `free` shows, so the
-- page cache the kernel can drop does not count.

local nord = dofile(ironbar.config_dir .. "/graphs/nord.lua")

local state = {}
local percent

local function sample()
    local f = io.open("/proc/meminfo", "r")
    if not f then
        return
    end
    local total, available
    for line in f:lines() do
        local key, kib = line:match("^(%w+):%s+(%d+)")
        if key == "MemTotal" then
            total = tonumber(kib)
        elseif key == "MemAvailable" then
            available = tonumber(kib)
        end
        if total and available then
            break
        end
    end
    f:close()
    if not (total and available) then
        return
    end
    local used = total - available
    percent = used / total * 100
    local gib = 1024 * 1024
    nord.publish("ram", string.format("Memory %.1f of %.1f GiB (%.0f%%)",
        used / gib, total / gib, percent))
end

return function(cr, width, height)
    if nord.due(state, 1.9) then
        sample()
    end

    local line = 2.5
    local cx, cy = width / 2, height / 2
    local r = math.min(width, height) / 2 - line / 2

    nord.source(cr, nord.nord3, 0.6)
    cr:set_line_width(line)
    cr:arc(cx, cy, r, 0, 2 * math.pi)
    cr:stroke()

    if not percent then
        return
    end
    local start = -math.pi / 2
    nord.source(cr, nord.load(percent, nord.nord9), 1)
    cr:set_line_cap("ROUND")
    cr:arc(cx, cy, r, start, start + 2 * math.pi * percent / 100)
    cr:stroke()
end
