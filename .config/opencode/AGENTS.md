# Global OpenCode Rules

You are operating as a coding agent for an experienced developer.

## Agent Role Separation

Subagent IDs match definitions in `~/.config/opencode/agents/<id>.md`. Invoke with Task tool.

**Strict role separation:**

- `explorer` - reads codebase, locates patterns, maps architecture. Read-only. Never writes.
- `code-executor` - writes files AND runs shells/tests. For tasks that need code editing. Never reviews.
- `bash-executor` - executes shell commands only. Small, fast model. No file edits. Use for pure command tasks.
- `code-reviewer` - reviews code for quality and style. Read-only.
- `docs-reviewer` - reviews documentation. Read-only.
- `security-reviewer` - audits for vulnerabilities. Read-only.
- `docs-writer` - writes .md files only. Never edits code.
- `test-verifier` - runs tests, linters, builds. Read + bash only.
- `api-docs-researcher` - fetches external library/API docs via MCP tools. This is the ONLY agent with access to documentation MCP tools.

**Typical orchestration flow:**

`explorer` (find context) -> `api-docs-researcher` (if external docs needed) -> `code-executor` (implement) -> `test-verifier` (verify) -> `code-reviewer` (review)

Use `bash-executor` instead of `code-executor` when the task is pure command execution with no file edits needed (e.g., "run this command", "check git status", "list processes").

Use `security-reviewer` when changes touch auth, crypto, file handling, or tenant boundaries.

## Documentation Research

If you need information about an unfamiliar library, framework, or API:

- Delegate to `api-docs-researcher` subagent via Task tool
- Do NOT call documentation MCP tools directly from other agents

## Efficiency Rules

- Batch independent operations
- Read only what is needed; stop when answer is supported
- Run smallest validation step first

## Safety Rules

- Follow least privilege; never expose secrets
- Ask before destructive, long-running, or networked actions
- Keep changes tightly scoped

## Skills

Skills in `~/.agents/skills/` are invoked manually via `/skill<name>`. Key skills: `diagnose`, `tdd`, `triage`, `grill-with-docs`, `improve-codebase-architecture`, `setup-matt-pocock-skills`.
