---
name: walkthrough
description: "Explains a finished change to the user, in every task that changed files: Gate and a short summary, then hands over to land."
---

# Walkthrough

Explains a finished change so the user understands it. Confidence that a change is right is not evidence that it is: say plainly what changed and why.

## Steps

### 1. Gate
If `implement` already ran it, reuse its result. Otherwise run the Gate; without one, run the repo's test + lint commands, or nothing when the repo has none, said so.

**Done when** the Gate command and its pass line are in hand, or its absence is stated.

### 2. Summary
Print in chat only:
1. **What and why**: one or two sentences. Name the mechanism the user should be able to explain without the AI; skip that for a typo, config value or rename.
2. **Diagram**: one large diagram when the change alters a flow, a state or a structure (AGENTS.md § Talking to the user).
3. **Gate**: the command and its pass line.

**Done when** the summary is printed.

### 3. Hand over
Hand over to `land` (read `skill://land`), passing the summary, the ticket reference, the mode, the PR number when the work is already on an open PR (`implement-spec` opens one), and the points gathered for notes while working (`land` § Notes).

**Done when** `land` has them.
