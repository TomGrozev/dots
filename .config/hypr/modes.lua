-- Resize mode: entered from the leader (m r) or any bind that dispatches the
-- "resize" submap. No auto-reset, so keys can be pressed repeatedly; Esc/Return
-- leave. The active border turns amber while the submap is active (state.lua).
hl.define_submap("resize", function()
    local steps = {
        { "h", -50, 0, "Narrower" },
        { "j", 0, 50, "Taller" },
        { "k", 0, -50, "Shorter" },
        { "l", 50, 0, "Wider" },
        { "left", -50, 0, "Narrower" },
        { "down", 0, 50, "Taller" },
        { "up", 0, -50, "Shorter" },
        { "right", 50, 0, "Wider" },
    }

    for _, step in ipairs(steps) do
        hl.bind(step[1], hl.dsp.window.resize({ x = step[2], y = step[3], relative = true }), {
            description = "Resize window: " .. step[4],
            repeating   = true,
        })
    end

    hl.bind("escape", hl.dsp.submap("reset"), { description = "Exit resize mode" })
    hl.bind("return", hl.dsp.submap("reset"), { description = "Exit resize mode" })
end)
