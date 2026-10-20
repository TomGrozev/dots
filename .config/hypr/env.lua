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

-- Dark GTK/Qt for apps that do not read the colour scheme from the compositor.
hl.env("GTK_THEME", "Adwaita:dark")
hl.env("QT_QPA_PLATFORMTHEME", "qt6ct")
hl.env("QT_QPA_PLATFORM", "wayland;xcb")

-- GTX 1060: force the proprietary driver's backends; the NVD direct backend
-- avoids the known flicker with the default EGLStream path.
hl.env("LIBVA_DRIVER_NAME", "nvidia")
hl.env("__GLX_VENDOR_LIBRARY_NAME", "nvidia")
hl.env("NVD_BACKEND", "direct")
