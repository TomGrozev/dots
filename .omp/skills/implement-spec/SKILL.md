---
name: implement-spec
description: "Implement all open tickets of one spec in a single session: afk and hitl, one integration branch, one land."
disable-model-invocation: true
---

# Implement a spec

Implement every open ticket of one spec in a single session. Use it when the user wants many tickets done at once. For one ticket, use `implement` instead.

You orchestrate from the main session, the only session with the user. `task` workers build.

## Steps

1. **Load**. Read the spec and its open tickets. They form a task graph with blockers; the **frontier** is the tickets whose blockers are all done. Create the integration branch from the default branch. At Load, merge the default branch into the integration branch, so that work is in place before building tickets it blocks, and record the start commit (`git merge-base <default> HEAD`) against that state. Running this skill is the user's consent to commit on the local integration branch; publishing still asks once, in `land`.
2. **Work the frontier**. For each frontier ticket, in a fresh worktree based on the integration branch, run `implement`'s per-ticket steps:
   - Claim the ticket when its build starts: set it `in-progress` and remove `ready-for-agent`, so no other session takes it. A ticket already in progress elsewhere or on an open PR is a blocker that is not done: leave it, and wait for its PR to merge.
   - `implement` step 0. Load (read the ticket and its spec sections).
   - `implement` step 1. Shape review, for a ticket with a `before build` gate (HITL.md § Shape review). Run it here in the main session when the ticket reaches the frontier, while afk builds continue. The ticket builds only after the user approves. If the user is away, tickets with a `before build` gate wait and the others go on.
   - `implement` step 2. Build. Dispatch `task` workers; each worker works in the ticket's worktree.
   - `implement` step 3. See it run, for a ticket with an `after build` gate (HITL.md § See it run). It runs after the ticket's build merges to the integration branch.
   - Skip `implement` steps 4, 5 and 6: self-review, checks and `land` run once for the whole spec, at the end.
3. **Merge**. When a worker finishes, squash its worktree changes into one commit on the integration branch, written by `land` § Landing rules for that ticket's mode (afk: a conventional commit; hitl: `commit_as_me`). Fixes from the See it run step go in one follow-up commit for that ticket. A merge moves the frontier; start the new tickets.
4. **Surface needs mid-build** (from workers' `### Surface additions`): a worker cannot ask the user. On a ticket with a `before build` gate, bring the need to the main session and run a shape review for it (HITL.md § Shape review), as in `implement` § Surface needs found mid-build. On an afk ticket, make the smallest change that works and record an ADR (`domain-modeling` format), as in `implement` § Surface needs found mid-build.
5. **Self-review**. When all tickets are done, run `implement` step 4. Self-review once, over the integration branch, against the spec and all its tickets. Diff against `git merge-base <default> HEAD` when later default-branch merges landed after the start commit.
6. **Checks**. Run `implement` step 5 once. Keep the checks command; `land` reuses it.
7. **Land**. Hand over to `land` (read `skill://land`) once, passing: every ticket reference, each ticket's mode, the start commit, the checks command, and the note points. `land` commits the final fixes, asks once to publish, and opens one PR. The PR body carries the end card and says `Closes #N` for each ticket.

A stuck worker triggers HITL.md § Take the pen, in any mode.

**Done when** every open ticket of the spec is implemented, reviewed, checked, and handed to `land`.
