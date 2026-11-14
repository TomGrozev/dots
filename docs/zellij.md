# Zellij

Ghostty is the terminal; Zellij runs inside it and owns the panes. `.zshrc`
auto-attaches to the `main` session (or creates it), `layouts/nord.kdl` gives
every tab one zjstatus bar at the bottom, and `config.kdl` holds the keymap.
The config is symlinked from this repo, so edits land in git.

| File | Role |
|---|---|
| `.config/zellij/config.kdl` | Theme, keybinds (`clear-defaults=true`), plugins, kitty graphics |
| `.config/zellij/layouts/nord.kdl` | Tab template, the zjstatus bar, swap layouts, tab 1 dashboard |
| `.config/zellij/plugins/` | zjstatus, autolock and forgot WASMs plus their release tags |
| `.config/zellij/scripts/miao-dashboard` | Tab 1 (`Alt x`) session dashboard |

Because the keybinds clear the defaults, every key below is set explicitly in
`config.kdl`; nothing comes from Zellij's own preset.

## Agent attention

`omp` reports its own state (`working`, `blocked`, `done`, `failed`) over
OSC 7501, and Zellij 0.46 collects that into an inbox covering every pane in
every session. Nothing needs turning on.

| Key | What it does |
|---|---|
| `Ctrl o` `i` | Open the inbox. `Tab` switches to the session list, `Enter` jumps to the pane, clicking the live view types straight into it (`Alt Enter` gives the keys back), `n` watches the pane, `m` mutes it, `c` marks it seen |
| `Ctrl o` `n` | Jump to the next pane that needs attention, in any session |
| `Ctrl p` `v` | Watch the focused pane: every finished command, its exit and its output going quiet all count as needing you |
| `Ctrl p` `g` | Ignore only the "new output" note for the pane, keeping failures and finished commands |
| `Ctrl p` `u`, `Ctrl t` `u`, `Ctrl o` `u` | Mute the pane, tab or whole session |
| Right-click a pane | The 0.46 context menu includes watch, mute and close |

Two of the usual attention surfaces are off in this setup. Frames are hidden
(`pane_frames false`), so frame markers never draw, and zjstatus replaces the
built-in tab bar and status bar, so tab markers and the session indicator
(`◉ 2 need you`) are not shown either. The inbox, the startup session card,
`Ctrl o` `n` and `Ctrl p` `v` are the surfaces that matter here; showing the
markers in the bar would take a zjstatus change, and its newest release still
targets 0.45.

From a script, `zellij action go-to-next-attention` and
`zellij action mark-all-seen --this-session` expose the same thing without a
keypress.

## Other 0.46 features in use

- **Session previews**: the session manager (`Ctrl o` `w`) shows a live view
  of the selected session; `←` `→` walks its tabs and panes, and clicking the
  view types into that pane without switching to it. `Esc` closes it.
- **Horizontal stacks**: `Ctrl p` `Shift s` flips the focused stack's titles
  from a column to a row, the horizontal stack layout that lets you move
  across the stack without changing focus. `Ctrl p` `s` still creates a stack.
- **Right-click menu**: on by default and configurable through the
  `context_menu` block. Ctrl+dragging in a tab creates a floating pane at the
  pointer, which pairs with `Alt f`.
- **Settings screen**: `Ctrl o` `c` opens it with categories for appearance,
  keyboard, mouse, attention and plugins, plus a theme editor with contrast
  checks. Changes apply immediately; `Ctrl a` saves them to `config.kdl`.
  That file is this repo's symlink, so save deliberately and check
  `git diff` afterwards. Zellij keeps comments and formatting, and offers
  to reload if the file changed underneath it. Built-in themes such as `nord`
  are read-only in the editor; copy the theme file and point `theme` at the
  copy.

## Not adopted

- **Built-in terminal** (`zellij terminal`): it would replace Ghostty, which
  Polar ties into the desktop (drop-down scratchpad, translucency and blur,
  `SUPER+hjkl` crossing between windows and panes, and the systemd drop-in
  that stops a stalled shutdown). Its session manager entry (`Alt w`, "open in
  Zellij terminal") and `zellij terminal --inbox` open a separate Zellij
  window; use them only when a second window for the inbox is what you want.
- **Distributions** (Zellij as a Rust library) and the macOS/Windows terminal
  work: nothing here embeds or ships Zellij.

## Upgrading

A running session keeps the server version it started with, even after the
package updates. `zellij --version` inside a session reports that server, so
it can lag `pacman -Q zellij`. New features appear only in a new session;
`main` resurrects its layout and commands but not running processes, so start
it when no agent is mid-run.

Checklist for a Zellij release:

1. `zellij setup --check` after editing `config.kdl`. It validates the
   keybinds, which a running session will not do until it restarts.
2. **Plugins**: `install.sh` pins the newest zjstatus, autolock and forgot
   releases. zjstatus 0.25.0 targets 0.45 and has no 0.46 build yet; watch for
   flicker in the bar after a restart and for tab-marker support.
3. **zjframes and zjstatus-hints** stay unloaded. Both leaked server memory on
   0.45.1 (0.3 MB per tab switch, and 11 kB per pane render that grew to
   18 GB); retest on 0.46, which reduces plugin memory, before enabling either.
4. **autolock 0.3.0** still runs on this block's `triggers` list, which 0.3
   wraps as a regex and deprecates. `reaction_seconds` is ignored by 0.3 (the
   delay is fixed at 0.3 s). Moving to `lock_regex`/`ignore_regex` matches the
   new defaults, where every program locks except shells and prompt tooling.
5. **Kitty graphics**: `support_kitty_graphics_protocol true` stays pinned.
   `PI_NO_KITTY_PLACEHOLDERS=1` stays because Zellij 0.46 still rejects
   Unicode-placeholder (`U=1`) placements; drop it when the upstream fix
   (zellij#5531, ported as #5878) ships.
