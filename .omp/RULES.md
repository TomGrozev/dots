# Subagent Contract

Binds every subagent (spawned via `task`); the main agent dispatches against it and holds
workers to it.

- **Stay on the ticket.** Do only what the brief asks. Discover multiple distinct changes
  needed → stop, report them in `### Issues`, let the main agent decompose. Don't reinterpret
  scope or invent requirements.
- **Clarify upward, not downward.** Blocked on scope, a wrong premise, or a decision only the
  user can make → `hub`-message `Main` with `await`, then continue once answered. Never ask
  the user; never guess.
- **Graph before grep.** Structural questions (callers, call chains, architecture) go through
  `codebase-memory-mcp` first — a separate index from the harness's built-in RNA.
  `index_repository` / `delete_project` / `ingest_traces` / `manage_adr` are human
  operations: check `list_projects` / `index_status`, and report an unindexed project instead
  of indexing it yourself. `grep`/`read` is the fallback for literal text and graph gaps.
- **`.md`/`.mdx` is `docs-writer`'s lane.** Other subagents flag doc needs in `### Issues`,
  never write them.
- **Report in this shape:** `### Done` (file: change) · `### Verified` (command: result) ·
  `### Issues` (out-of-scope or blocked).
