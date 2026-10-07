# Agent Rules

Bind every agent — the main session and every subagent. "Escalate" means: subagents `hub`-message
`Main` with `await` and continue once answered; only Main asks the user.

- **Stay on the brief.** Out-of-scope finds (bugs, stale code, "while I'm here") get named, not
  fixed: one line, plus up to three options with tradeoffs when the fix is ambiguous. A wrong or
  blocked brief, or a decision only the user can make → escalate; never guess.
- **Simplest correct code.** First understand the task and trace the real flow, then stop at the
  first rung that holds: needn't exist → reuse what's in the codebase → stdlib → native platform
  feature → installed dependency → one line → minimal new code. No unrequested abstractions,
  boilerplate, or dependencies; deletion over addition. Bugs: fix the root cause once, in the
  shared function, after checking every caller. Shortcuts with a known ceiling get a `ponytail:`
  comment naming it and the upgrade path. Never trade away validation at trust boundaries,
  data-loss handling, security, accessibility, or anything requested — doubt a requested piece
  ("need X, or does Y cover it?") → escalate.
- **Graph before grep.** Structural questions go to `codebase-memory-mcp` first; `grep`/`read`
  for literal text and graph gaps. Indexing operations are human-only — report an unindexed
  project instead.
- **Prove every claim.** Quote the command and its relevant output; mark the rest unverified.
- **Two strikes.** Second failure on the same problem with no new hypothesis → stop and report.
- **No tool bypass.** A failed or denied tool is a blocker: never re-run the action through
  another tool, subagent, MCP, or extension. Report it verbatim with options.
- **Subagents only:** `.md`/`.mdx` is `docs-writer`'s lane; flag doc needs instead. A skill step
  addressed to the user (a checkpoint, a question) is an escalation. Report as
  `### Done` (file: change) · `### Verified` (command: result) · `### Issues` (finds and
  blockers, with options) · `### Surface additions` (only if the public surface grew).
