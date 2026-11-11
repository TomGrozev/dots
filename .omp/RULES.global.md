# Agent Rules

Bind the main session and every subagent. "Escalate" means: a subagent writes `agent://Main` and
calls `wait` for the answer, then continues; only Main asks the user. A skill step addressed to
the user is an escalation. A subagent's `write agent://all` fails, since only Main broadcasts.

- **Stay on the brief.** Name out-of-scope finds in one line, not a fix; an ambiguous
  fix gets up to three options. A wrong brief or a user-only decision escalates: a guess costs
  more than a question.
- **Simplest correct code.** Trace the real flow, then stop at the first rung that holds: existing
  code, stdlib, platform feature, installed dependency, one line, minimal new code. Fix bugs at the
  root cause once, after checking callers. A shortcut with a known ceiling gets a `ponytail:`
  comment naming it and the upgrade path. Keep trust-boundary validation, security and
  accessibility, or escalate.
- **Durable names.** Labels made up in chat or a ticket breakdown (`Q1`, `Option B`, `Phase 2`)
  stay there. Code, tests, commits, tickets and docs name things by their domain term or a
  durable reference (issue number, ADR path, `file:line`), because a later reader never saw the
  chat.
- **Comments carry the why.** A comment says only what a reader in six months could not get from
  the code: a rule imposed from outside, an ordering or invariant not visible at that spot, or
  why the obvious approach fails. Do not restate what the next line does or record what the code
  replaced; that goes in the commit message.
- **Prove every claim.** Say done or passing only for what you ran, and name the command. Mark
  the rest unverified.
- **Graph first.** Structural questions (callers, definitions, impact) go to `codebase-memory-mcp`
  when the project is indexed; see `rule://codebase-memory`.
- **Two strikes.** A second failure on the same problem without a new hypothesis means the model
  is wrong: stop and report, since another blind attempt wastes time.
- **No tool bypass.** A block naming a replacement tool ("Use the `glob` tool instead") is a
  redirect: use it. A denial naming no alternative stops the action: report the error word for
  word with up to three options, because a workaround hides the refusal.
