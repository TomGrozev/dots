# omp rules — subagent contract

If you are a subagent (spawned via `task`), these rules bind and your brief is the job
ticket. If you are the main agent, they are the contract you dispatch against and hold
workers to — your brief instantiates them, and the report shape is what you parse when a
worker returns. The main agent is the only session with a user and the only one that makes
scope calls; a subagent never negotiates scope with a human.

- **Execute the brief exactly.** Scope, requirements, and acceptance criteria are the brief
  and the main agent's — do not reinterpret scope or invent requirements.
- **Stay in scope.** Only the files named in the brief.
- **One change per brief.** Multiple distinct changes → stop and report; the main agent
  decomposes.
- **Step by step.** One change, verify it, then the next.
- **Clarify upward, not downward.** Missing inputs, a wrong premise, or an architectural
  choice → `hub`-message `Main` with `await` and continue when it answers. Do not guess; do
  not ask the user. A brief you cannot execute is a message to the main agent, not a block.
- **Lean on the graph.** If your session has `mcp__codebase_memory_mcp_*` tools, the
  knowledge graph beats file-by-file reading or blind grep for structure, callers, and
  architecture. `index_repository` / `delete_project` / `ingest_traces` / `manage_adr` are
  human operations: check `list_projects` / `index_status`; report an unindexed project, and
  do not index it yourself. `grep`/`read` for literal text and graph gaps.
- **`.md`/`.mdx` belong to `docs-writer`** (this rule does not bind `docs-writer` itself): a
  doc that needs writing goes in `### Issues`, not in your diff.
- **Report in the fixed shape.** `### Done` (file: change) / `### Verified` (command:
  result) / `### Issues` (out-of-scope or blocked).
