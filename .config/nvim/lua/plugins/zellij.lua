-- ── Zellij integration for Neovim ────────────────────────────────────────

return {
  -- Seamless navigation between nvim splits and zellij panes
  "swaits/zellij-nav.nvim",
  lazy = true,
  event = "VeryLazy",
  keys = {
    { "<c-h>", "<cmd>ZellijNavigateLeftTab<cr>",  { silent = true, desc = "Navigate left (or previous tab)" } },
    { "<c-j>", "<cmd>ZellijNavigateDown<cr>",      { silent = true, desc = "Navigate down" } },
    { "<c-k>", "<cmd>ZellijNavigateUp<cr>",         { silent = true, desc = "Navigate up" } },
    { "<c-l>", "<cmd>ZellijNavigateRightTab<cr>",   { silent = true, desc = "Navigate right (or next tab)" } },
  },
  config = function()
    -- Zellij mode cleanup on VimLeave
    vim.api.nvim_create_autocmd("VimLeave", {
      pattern = "*",
      command = "silent !zellij action switch-mode locked",
    })
  end,
}
