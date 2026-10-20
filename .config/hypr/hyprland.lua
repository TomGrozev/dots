-- Polar: a Nord-themed Hyprland desktop.
-- This file only wires the modules together; behaviour lives in them.
-- Module order matters: look/motion install config, state defines the global
-- `Polar` table, then rules/modes/keys/binds use it, autostart comes last.

hl.monitor({
    output   = "",
    mode     = "preferred",
    position = "auto",
    scale    = "auto",
})

require("env")
require("look")
require("motion")
require("rules")
require("state")
require("modes")
require("keys")
require("binds")
require("autostart")

-- Input is the one thing that must match the physical keyboard, so it stays in
-- the entry file where a new user will look for it.
hl.config({
    input = {
        kb_layout    = "us",
        kb_variant   = "",
        kb_model     = "",
        kb_options   = "",
        kb_rules     = "",
        follow_mouse = 1,
        sensitivity  = 0,
        touchpad     = { natural_scroll = false },
    },
})

hl.gesture({
    fingers   = 3,
    direction = "horizontal",
    action    = "workspace",
})
pcall(require, "/home/user/.config/hypr/openwhispr-binds.lua")
