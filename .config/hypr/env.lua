-- Environment for every child of the compositor.
-- PATH must contain ~/.local/bin because binds and the leader call the
-- polar-* scripts by bare name.
local home = assert(os.getenv("HOME"), "HOME is not set")

hl.env("PATH", home .. "/.local/bin:" .. (os.getenv("PATH") or "/usr/local/bin:/usr/bin:/bin"))

-- Nordzy cursors, sized 24 on both the Xcursor and Hyprland cursor paths.
hl.env("XCURSOR_THEME", "Nordzy-cursors")
hl.env("XCURSOR_SIZE", "24")
hl.env("HYPRCURSOR_THEME", "Nordzy-cursors")
hl.env("HYPRCURSOR_SIZE", "24")

-- GTK deliberately has no GTK_THEME here: install.sh sets the Nordic theme
-- through gsettings, and an env override would win over it for every GTK app.
-- Qt keeps its own theme engine; qt6ct reads the same Nord colours.
hl.env("QT_QPA_PLATFORMTHEME", "qt6ct")
hl.env("QT_QPA_PLATFORM", "wayland;xcb")

-- GTX 1060: force the proprietary driver's backends; the NVD direct backend
-- avoids the known flicker with the default EGLStream path.
hl.env("LIBVA_DRIVER_NAME", "nvidia")
hl.env("__GLX_VENDOR_LIBRARY_NAME", "nvidia")
hl.env("NVD_BACKEND", "direct")
