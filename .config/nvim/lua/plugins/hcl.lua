-- Disable semantic tokens for terraform-ls.
-- terraform-ls returns a huge `textDocument/semanticTokens/full`
-- response for files with multi-line heredocs containing `${...}`
-- interpolations (e.g. coder_agent.startup_script). nvim then runs
-- `vim.str_utfindex()` per token to convert byte/char offsets, which
-- pegs the event loop at 100% CPU and freezes the editor. Disabling
-- semantic tokens for this server only — other terraform-ls features
-- (diagnostics, hover, completion, formatting) are unaffected, and
-- other LSPs (rust-analyzer, ts_ls, etc.) keep full semantic tokens.
vim.api.nvim_create_autocmd("LspAttach", {
  group = vim.api.nvim_create_augroup("terraformls_no_semantic_tokens", { clear = true }),
  callback = function(ev)
    local client = vim.lsp.get_client_by_id(ev.data.client_id)
    if not client or client.name ~= "terraformls" then
      return
    end
    client.server_capabilities.semanticTokensProvider = nil
  end,
})

return {
  {
    "stevearc/conform.nvim",
    opts = {
      formatters_by_ft = {
        tf = { "tfmt" },
        terraform = { "tfmt" },
        hcl = { "tfmt" },
      },
      formatters = {
        tfmt = {
          -- Specify the command and its arguments for formatting
          command = "tofu",
          args = { "fmt", "-" },
          stdin = true,
        },
      },
    },
  },
  {
    "nathom/filetype.nvim",
    config = function()
      -- Setup overrides for file extensions
      require("filetype").setup({
        overrides = {
          extensions = {
            tf = "terraform",
            tfvars = "terraform",
            tfstate = "json",
          },
        },
      })
    end,
  },
}
