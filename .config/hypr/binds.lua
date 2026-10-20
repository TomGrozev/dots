-- Register every direct bind from keys.lua. Descriptions are mandatory:
-- hyprctl binds -j exposes them and the cheat sheet relies on them.
local keys = require("keys")

for _, bind in ipairs(keys.direct) do
    local opts = { description = bind.desc }
    if bind.opts then
        for key, value in pairs(bind.opts) do
            opts[key] = value
        end
    end
    hl.bind(bind.chord, bind.action, opts)
end
