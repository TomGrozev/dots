-- Options are automatically loaded before lazy.nvim startup
-- Default options that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/options.lua
-- Add any additional options here

-- vim.g.mapleader = ","
-- vim.g.maplocalleader = ","

vim.opt.textwidth = 80

vim.api.nvim_create_autocmd("FileType", {
  pattern = "avante",
  callback = function()
    require("oklch-color-picker").highlight.disable()
  end,
})
