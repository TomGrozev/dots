-- CPU sparkline: the last 40 seconds of total CPU load, newest on the right.
-- /proc/stat holds cumulative jiffies, so a load needs two readings; the
-- first draw only primes the counters.

-- config_dir has no trailing slash.
local nord = dofile(ironbar.config_dir .. "/graphs/nord.lua")

-- 2s samples (config.toml `frequency`) across a 40px canvas: 2px per sample.
local SAMPLES = 21
local history = {}
local state = {}
local prev_total, prev_idle

local function read_cpu()
    local f = io.open("/proc/stat", "r")
    if not f then
        return nil
    end
    local line = f:read("*l")
    f:close()
    local total, idle, i = 0, 0, 0
    for n in line:gmatch("%d+") do
        i = i + 1
        n = tonumber(n)
        -- Fields 9 and 10 (guest time) are already inside user and nice.
        if i <= 8 then
            total = total + n
        end
        -- idle and iowait: the CPU had nothing to run.
        if i == 4 or i == 5 then
            idle = idle + n
        end
    end
    return total, idle
end

local function sample()
    local total, idle = read_cpu()
    if not total then
        return
    end
    if prev_total and total > prev_total then
        local busy = 1 - (idle - prev_idle) / (total - prev_total)
        table.insert(history, math.max(0, math.min(100, busy * 100)))
        if #history > SAMPLES then
            table.remove(history, 1)
        end
        local peak = 0
        for _, v in ipairs(history) do
            peak = math.max(peak, v)
        end
        nord.publish("cpu", string.format("CPU %.0f%%, peak %.0f%% in the last %ds",
            history[#history], peak, (#history - 1) * 2))
    end
    prev_total, prev_idle = total, idle
end

return function(cr, width, height)
    if nord.due(state, 1.9) then
        sample()
    end

    -- Resting baseline, so an idle machine still shows where the graph lives.
    nord.source(cr, nord.nord3, 0.6)
    cr:set_line_width(1)
    cr:move_to(0, height - 0.5)
    cr:line_to(width, height - 0.5)
    cr:stroke()

    local n = #history
    if n < 2 then
        return
    end

    local step = width / (SAMPLES - 1)
    local x0 = width - (n - 1) * step
    -- 1.5px headroom keeps a 100% line inside the canvas.
    local function y(v)
        return height - 1 - (height - 2.5) * v / 100
    end

    local colour = nord.load(history[n], nord.nord8)

    cr:move_to(x0, y(history[1]))
    for i = 2, n do
        cr:line_to(x0 + (i - 1) * step, y(history[i]))
    end
    -- Fill first from a copy of the path, then stroke the line on top.
    local line = cr:copy_path()
    cr:line_to(width, height)
    cr:line_to(x0, height)
    cr:close_path()
    nord.source(cr, colour, 0.18)
    cr:fill()

    cr:append_path(line)
    nord.source(cr, colour, 1)
    cr:set_line_width(1.5)
    cr:set_line_join("ROUND")
    cr:set_line_cap("ROUND")
    cr:stroke()
end
