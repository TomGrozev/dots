---
name: implement-spec
description: "Implement all open tickets of one spec in a single session: afk and hitl, one integration branch, one land."
disable-model-invocation: true
---

# Implement a spec

Implement every open ticket of one spec in a single session. Use it when the user wants many tickets done at once. For one ticket, use `implement` instead.

This skill is a thin wrapper. `task` workers build each ticket with `skill://tdd`. You
orchestrate from the main session, the only session with the user. Keep one todo item per
ticket plus landing, never one per sub-step.

After a dispatch, do any other work you have. When none remains, end the turn: a finished
worker's result arrives as a new message and starts your next turn. Do not poll (`wait` in a
loop, `read proc://<id>`); call `wait` once only when the answer blocks you and you cannot end
the turn. Read one field with `agent://<id>/<field>`.

Keep the `context_notes` notebook as the run's decision
log, not a transcript: the digest path, the active tickets with their worker ids, landed
commits, blocked tickets with their question, next actions. Write it after the first dispatch
and rewrite it after each landing; the first write in a new session can be rejected once
(omp issue #12316), so retry it. Past about 120k tokens, call `new_context` at a ticket
boundary instead of waiting for the automatic rollover at the threshold.

## Steps

1. **Load**. First check the in-review tickets: for each local ticket at `in-review (#n)`, check PR #n and set the ticket `done` when merged, naming the PR. Dispatch one `task` worker to read the spec, its open tickets, `CODING_STANDARDS.md`, `GLOSSARY.md` and the ADRs in the area, and write a one-screen digest to `local://spec-<spec number>.md`: ticket list with status, acceptance criteria per ticket, decisions, integration branch name, start commit, checks command. It creates the integration branch from the default branch, merges the default branch into it, and records the start commit (`git merge-base <default> HEAD`); that commit stays the review base for the whole spec. Read the digest only; after a compaction, re-read only the digest. Publishing still asks once, in `land`.
2. **Work the frontier**. The frontier is the tickets whose blockers are all done. For each frontier ticket:
   - Claim it when its build starts: set it `in-progress` and remove `ready-for-agent`. A ticket in progress elsewhere or at `in-review` blocks; leave it and report it in the end card.
   - Dispatch one worker per ticket with a fresh context. Its `context` carries the shared background once, rendered into each child: spec purpose, digest path, standards and glossary paths, integration branch. Its brief carries the ticket path and mode, and the worker reads the details itself. Its `outputSchema` holds `summary`, `issues` (each with options), `defaults`, `surface_additions`, `commit` and `checks`.
   - The worker sets up its own worktree and branch from the integration tip (`git worktree add -b <ticket-branch> <path> <integration tip>`), or reuses the Shape review's worktree, and builds with `skill://tdd`. Before it reports, it reviews its diff against the ticket's acceptance criteria with `skill://code-review` and fixes what it finds. It merges the current default branch and integration tip into its ticket branch, resolves the conflicts, runs its checks and reports the command with the pass line; failing output stays in its context. It squashes its work into one commit on the current integration tip and reports that commit hash; the message follows `skill://conventional-commit` and `skill://writing-prose`, with that skill's gate run before the commit. A hitl ticket with an `after build` gate keeps its worktree: the worker stays alive until the gate ends, then amends its squash commit and reports the new hash. A rebase request re-creates the worktree.
   - Land the commit with one quiet fast-forward: `git merge --ff-only -q <hash>` on the integration branch, then delete the ticket branch (`git branch -q -D <ticket-branch>`). When the fast-forward fails because another ticket landed first, send the worker back (`write agent://<id>`) to rebase on the new tip, re-run its checks and report again. You resolve no conflicts. A merge moves the frontier; start the new tickets.
   - A hitl ticket's Shape review runs before its worker starts (`skill://implement/HITL.md`): a `task` worker cuts the ticket worktree from the integration tip, writes and commits the skeleton, and publishes its diff while the other frontier tickets keep building. The build worker then builds in that worktree. A See it run gate runs after the worker reports and before the landing: the publisher runs in that worktree, and objections go back with `write agent://<id>` so the worker amends its squash commit and reports the new hash before landing.
3. **Surface needs mid-build**: handle each worker's `surface_additions` by `implement` § Surface needs found mid-build.
4. **Self-review**. When all tickets are done, run one self-review over the integration branch, diffed against the start commit. Its spec input is the spec path and each ticket path, never the digest; the digest is for you alone.
5. **Checks**. Dispatch one `sonic` worker to run the checks once on the integration branch. It reports the command and the pass line, or the failing tests. Keep the command and pass line for `land`.
6. **Land**. Read `skill://land` here, once. Hand over: every ticket reference, each mode, the start commit, the checks command and pass line, the r3 artifact ids, and the note points. `land` commits the final fixes, asks once to publish, and opens one PR whose body carries the end card and `Closes #N` per ticket.

A stuck worker in any mode: hand the question to the user with the repro and the ruled-out hypotheses.

**Done when** every open ticket of the spec is implemented, reviewed, checked, and handed to `land`.

At the end, the PR body shows every ticket with its mode, its gates and its blockers, as a ticket graph (AGENTS.md § Pages).
