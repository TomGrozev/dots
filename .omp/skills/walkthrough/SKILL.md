---
name: walkthrough
description: "Final step of every task that changed files, in every repo: Gate, hand the change over as a walkthrough, then one question on how to land it."
---

# Walkthrough

Hands a finished change to the user so they understand it and decide how it lands. Confidence that a change is right is not evidence that it is: state what changed and why, point out where you are least sure, and hand over the review.

## Steps

### 1. Gate
If `implement` already ran it, reuse its result. Otherwise run the Gate (the command in the agent file's `## Gate` section; if absent, the repo's test + lint commands, or nothing when the repo has none, said so).

**Done when** the Gate command and its pass line are in hand, or its absence is stated.

### 2. Deliver
Get the change across in the fewest words. Print in chat, in this order, leaving out any part that is empty:
1. **What and why**: one or two sentences. Name the mechanism the user should be able to explain without the AI; skip that for a typo, config value or rename.
2. **Diagram**: one large diagram when the change alters a flow, a state or a structure (AGENTS.md § Talking to the user).
3. **Where I'd want your eyes**: up to 3 points, each a `file:line` and one line: code-review findings left open and the parts you are least sure of.
4. **For veto**: one line each: surface additions made mid-build, the approach behind each non-obvious piece of logic, edits to later tickets, assumptions, proposed conventions.
5. **Gate**: the command and its pass line.

**Done when** every non-empty part is printed.

### 3. Ask
One `ask` with four options; the recommended one is the size-based choice:
- **commit**: land as a commit (see Landing rules), citing the ticket. Recommended for small, contained work reviewable in one sitting.
- **r3 then commit**: publish the change as a `diff` artifact (commands: `skill://r3`) with the walkthrough as its summary, diagram as a mermaid block; revise and reply until the user archives the review, then land as a commit.
- **PR**: a `feat/…`, `fix/…` or `chore/…` branch, land as a commit, then read `skill://pr` and write the PR body in its shape, with the walkthrough as the content and the diagram as a mermaid block, and run `gh pr create` with that body. Recommended for multi-file, behavioural, config or infra change. Surface the URL and end the turn.
- **leave it**: the change stays uncommitted.

Then, if the ticket just landed was the last open ticket of its spec (check the tracker), the repo is onboarded (`CODING_STANDARDS.md` exists) and it is not a fork, end with one line suggesting the user run `calibrate` in a fresh session.

**Done when** the chosen option is carried out, plus the calibrate line when it applies.

## Landing rules
Commits in Step 3 depend on mode:
- **afk**: conventional commit: read `skill://conventional-commit` and write the message to it.
- **hitl or ad-hoc**: stage files, then call `commit_as_me` with the conventional-commit message. If it errors (user declined/no UI), show the returned `git commit -F <file>` command and wait; never commit yourself.
