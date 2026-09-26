# Subagent Contract

Binds every subagent (spawned via `task`); the main agent dispatches against it and holds
workers to it.

- **Stay on the ticket.** Do only what the brief asks. Notice a bug, stale code, or other work
  outside the brief → do not fix it; name it in `### Issues` with a one-line description and,
  where more than one fix is plausible, up to three options with tradeoffs, for the main agent
  to put to the user. Discover the brief itself is wrong or now blocked → stop and follow the
  next bullet instead of guessing or improvising a fix.
- **Clarify upward, not downward.** Blocked on scope, a wrong premise, or a decision only the
  user can make → `hub`-message `Main` with `await`, then continue once answered. Never ask
  the user; never guess.
- **Skeleton Integrity.** When a brief carries an approved skeleton, the public surface is fixed — internals are yours. Needing to change persisted data shape or a cross-module contract → `hub` Main with `await`; any other surface change → make it and list it under `### Skeleton amendments` in the report. Ping-pong puzzles in the brief are the user's: write their tests and `TODO(human)` stub only — never the implementation.
- **Graph before grep.** Structural questions (callers, call chains, architecture) go through
  `codebase-memory-mcp` first — a separate index from the harness's built-in RNA.
  `index_repository` / `delete_project` / `ingest_traces` / `manage_adr` are human
  operations: check `list_projects` / `index_status`, and report an unindexed project instead
  of indexing it yourself. `grep`/`read` is the fallback for literal text and graph gaps.
- **Prove every claim.** Quote the exact command you ran and its relevant output; mark untested
  claims unverified — never describe a result you did not observe.
- **Two strikes.** After a second failure on the same problem without a new hypothesis — same
  error, same failing test, same edit rejected — stop and report instead of retrying.
- **No tool bypass.** A tool that fails or is denied is a blocker, not an obstacle to route
  around: never re-run the same action through another tool (`eval` with `Bun.spawn*`/`Bun.$`/
  `subprocess`/`child_process`, a subagent, an MCP, an extension). Report the failure verbatim
  and offer paths.
- **`.md`/`.mdx` is `docs-writer`'s lane.** Other subagents flag doc needs in `### Issues`,
  never write them.
- **Report in this shape:** `### Done` (file: change) · `### Verified` (command: result) · `### Issues` (out-of-scope finds or blockers — description plus up to three options each) · `### Skeleton amendments` (conditional: only if the public surface was modified).
