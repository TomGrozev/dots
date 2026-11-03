---
name: implement-spec
description: "Implement all open tickets of one spec in a single session: afk and hitl, one integration branch, one land."
disable-model-invocation: true
---

# Implement a spec

Implement every open ticket of one spec in a single session. Use it when the user wants many tickets done at once. For one ticket, use `implement` instead.

This skill is a thin wrapper. `task` workers build each ticket with `skill://tdd`. You
orchestrate from the main session, the only session with the user.

## Steps

1. **Load**. Read the spec and its open tickets. For each local ticket whose `**Status:**` is `in-review (#n)`, check PR #n; if it has merged, set the ticket's Status to `done`. They form a task graph with blockers; the **frontier** is the tickets whose blockers are all done. Create the integration branch from the default branch and merge the default branch into it, so that work is in place before building tickets it blocks. Record the start commit (`git merge-base <default> HEAD`) against that state; it stays the review base for the whole spec. Publishing still asks once, in `land`.
2. **Work the frontier**. For each frontier ticket:
   - Claim the ticket when its build starts: set it `in-progress` and remove `ready-for-agent`, so no other session takes it. A ticket already in progress elsewhere or on an open PR (its `**Status:**` says `in-review`) is a blocker that is not done. Leave it and report it as an open blocker in the end card. Do not wait.
   - Start one worker per ticket with a fresh context window, in its own worktree based on the integration branch. The worktree holds its files only. The worker builds the ticket with `skill://tdd`. Its brief carries an `outputSchema` with the same fields as the build brief in `implement`: `summary`, `issues` (each with options), `defaults`, and `surface_additions`.
   - Before a worker reports, it reviews its own diff against the ticket's acceptance
     criteria with `skill://code-review`, and fixes what it finds. Then it merges the
     integration tip into its worktree and runs the tests for its own files. It resolves
     conflicts in its own files.
   - Run a hitl ticket's gates in the main session when it reaches the frontier. Read
     `skill://implement/HITL.md` for them: § Shape review before the build starts, § See it run after the build
     ends and before the worker's self-review. The ticket builds only after the user
     approves. If the user is away, tickets with a `before build` gate wait and the
     others go on.
   - Squash each finished ticket into one commit on the integration branch, by `land` § Landing rules for its mode. Fixes from the See it run step go in one follow-up commit for that ticket.
   - Merge the default branch into the integration branch before each ticket merge, so the branch does not drift from the default.
   - A merge moves the frontier; start the new tickets.

   Checks and `land` run once for the whole spec, at the end (this skill's Checks and
   Land steps), so each ticket skips them.
3. **Surface needs mid-build**: handle each worker's `surface_additions` by `implement` § Surface needs found mid-build.
4. **Self-review**. When all tickets are done, run one self-review over the integration branch, against the spec and all its tickets. Diff against the start commit from the Load step.
5. **Checks**. Run the checks once. Keep the checks command; `land` reuses it.
6. **Land**. Hand over to `land` (read `skill://land`) once, passing: every ticket reference, each ticket's mode, the start commit, the checks command, and the note points. `land` commits the final fixes, asks once to publish, and opens one PR. The PR body carries the end card and says `Closes #N` for each ticket. After `land` returns, remove each ticket worktree with `git worktree remove` and delete its branch.

A stuck worker in any mode: hand the question to the user with the repro and the ruled-out hypotheses.

**Done when** every open ticket of the spec is implemented, reviewed, checked, and handed to `land`.

At the end, publish one map of all tickets and what each changed, when the **Pages** rule in AGENTS.md applies. The page holds each ticket, its mode, and what its diff changed.
