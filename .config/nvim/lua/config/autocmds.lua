-- Autocmds are automatically loaded on the VeryLazy event
-- Default autocmds that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/autocmds.lua
--
-- Add any additional autocmds here
-- with `vim.api.nvim_create_autocmd`
--
-- Or remove existing autocmds by their group name (which is prefixed with `lazyvim_` for the defaults)
-- e.g. vim.api.nvim_del_augroup_by_name("lazyvim_wrap_spell")

-- zellij-autolock locks the session while nvim is the pane command; hand the
-- pane back in a usable mode on exit. The ZELLIJ guard matters: `zellij action`
-- outside a session would target the single live one.
vim.api.nvim_create_autocmd("VimLeave", {
  pattern = "*",
  callback = function()
    if vim.env.ZELLIJ then
      vim.fn.system({ "zellij", "action", "switch-mode", "locked" })
    end
  end,
})
