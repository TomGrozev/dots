-- Keymaps are automatically loaded on the VeryLazy event
-- Default keymaps that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/keymaps.lua
-- Add any additional keymaps here

-- ── Focus navigation across layers: nvim split → zellij pane → Hyprland ──
-- Move the split first; only at the edge hand off to `polar-nav`, which moves
-- the zellij pane and finally the Hyprland window. `--from-nvim` keeps it from
-- bouncing the chord back into the editor. Replaces zellij-nav.nvim, whose
-- move-focus-or-tab wrapped into another tab instead of leaving the window.
for key, dir in pairs({ h = "left", j = "down", k = "up", l = "right" }) do
  vim.keymap.set("n", "<C-" .. key .. ">", function()
    local before = vim.fn.win_getid()
    vim.cmd("wincmd " .. key)
    if vim.fn.win_getid() ~= before then
      return
    end
    if vim.fn.executable("polar-nav") == 1 then
      vim.fn.system({ "polar-nav", dir, "--from-nvim" })
    end
  end, { silent = true, desc = "Focus " .. dir .. " (split, zellij pane, window)" })
end
