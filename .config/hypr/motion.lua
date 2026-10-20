-- One motion language for the whole desktop: everything settles with the same
-- spring, popups overshoot slightly, windows leave faster than they arrive.
-- borderangle is deliberately absent: a looping border animation costs a frame
-- every tick on a 3GB GTX 1060 for no information.
hl.curve("polar", { type = "spring", mass = 1, stiffness = 260, dampening = 21 })
hl.curve("polarOut", { type = "spring", mass = 1, stiffness = 300, dampening = 27 })
hl.curve("polarFade", { type = "bezier", points = { { 0.22, 0.61 }, { 0.36, 1 } } })

hl.animation({ leaf = "global", enabled = true, speed = 8, bezier = "polarFade" })

hl.animation({ leaf = "windows", enabled = true, speed = 5, spring = "polar" })
hl.animation({ leaf = "windowsIn", enabled = true, speed = 4.2, spring = "polar", style = "popin 90%" })
hl.animation({ leaf = "windowsOut", enabled = true, speed = 2.6, spring = "polarOut", style = "popin 90%" })
hl.animation({ leaf = "windowsMove", enabled = true, speed = 5, spring = "polar" })

hl.animation({ leaf = "layers", enabled = true, speed = 3.6, bezier = "polarFade" })
hl.animation({ leaf = "layersIn", enabled = true, speed = 3.4, bezier = "polarFade", style = "slidefade 20%" })
hl.animation({ leaf = "layersOut", enabled = true, speed = 2.2, bezier = "polarFade", style = "fade" })

hl.animation({ leaf = "fade", enabled = true, speed = 3.5, bezier = "polarFade" })
hl.animation({ leaf = "fadeIn", enabled = true, speed = 3.5, bezier = "polarFade" })
hl.animation({ leaf = "fadeOut", enabled = true, speed = 2.5, bezier = "polarFade" })
hl.animation({ leaf = "fadeSwitch", enabled = true, speed = 3, bezier = "polarFade" })
hl.animation({ leaf = "fadeShadow", enabled = true, speed = 3, bezier = "polarFade" })
hl.animation({ leaf = "fadeDim", enabled = true, speed = 3, bezier = "polarFade" })
hl.animation({ leaf = "fadeLayers", enabled = true, speed = 3, bezier = "polarFade" })
hl.animation({ leaf = "fadeLayersIn", enabled = true, speed = 3, bezier = "polarFade" })
hl.animation({ leaf = "fadeLayersOut", enabled = true, speed = 2.5, bezier = "polarFade" })
hl.animation({ leaf = "fadePopups", enabled = true, speed = 3, bezier = "polarFade" })
hl.animation({ leaf = "fadePopupsIn", enabled = true, speed = 3, bezier = "polarFade" })
hl.animation({ leaf = "fadePopupsOut", enabled = true, speed = 2.5, bezier = "polarFade" })

hl.animation({ leaf = "workspaces", enabled = true, speed = 4.5, spring = "polar", style = "slidefade 15%" })
hl.animation({ leaf = "workspacesIn", enabled = true, speed = 4.5, spring = "polar", style = "slidefade 15%" })
hl.animation({ leaf = "workspacesOut", enabled = true, speed = 3.8, spring = "polarOut", style = "slidefade 15%" })

-- Scratchpads drop in from the top edge, matching Polar.tui().
hl.animation({ leaf = "specialWorkspace", enabled = true, speed = 4.5, spring = "polar", style = "slidevert" })
hl.animation({ leaf = "specialWorkspaceIn", enabled = true, speed = 4.5, spring = "polar", style = "slidevert" })
hl.animation({ leaf = "specialWorkspaceOut", enabled = true, speed = 3.5, spring = "polarOut", style = "slidevert" })

hl.animation({ leaf = "border", enabled = true, speed = 6, bezier = "polarFade" })
hl.animation({ leaf = "zoomFactor", enabled = true, speed = 4, bezier = "polarFade" })
