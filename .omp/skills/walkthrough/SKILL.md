---
name: walkthrough
description: "Final step of every task that changed files: ask whether to run an r3 review, hand the change over as a walkthrough, then commit it or open a PR."
---

# Walkthrough

The `walkthrough` hands a finished change to the human so they understand it and land it — that is its purpose, distinct from the blind code review, which reads the code. It runs for every task in every repo, dotfiles included; no trivial exemption.

It runs whether or not the work went through `implement`. When it did, the exit steps are already done (blind review, `## Gate` output shown). When it did not (an ad-hoc change, a config tweak, a chore), run the Gate first if the repo has one and show its output; then continue here.

## End-of-Task Flow

### 1. Ask first: r3 pass?
ONE `ask` before the walkthrough is delivered — **r3 pass, or straight to commit/PR?** — recommending the r3 pass, with a one-line summary of the change. A one-word answer skips the review.
- r3 is offered at every size and works in local-only repos (no remote/commit required).

### 2. Deliver the walkthrough (format below), in one of two forms
- **r3 yes — walkthrough as r3 comments**: each reading-order stop becomes an anchored `r3 feedback add <id> -m "…" --file <f> --line <a-b>` comment on the relevant lines. The non-line parts — Explain it back, Skeleton amendments, Conventions, Gate — go in ONE review-level comment (`r3 feedback add <id> -m "…"`, no `--file`; if a non-anchored comment is impossible, anchor it at the first changed line of the most central file). Exact commands: `skill://r3`. Then `r3 watch <id>` and revise live, replying per item, until the review resolves. Once r3 is initiated there are no further edits except revisions answering annotations.
- **r3 no/skipped — walkthrough in chat**: print the walkthrough in the chat.

### 3. Ask: Commit or PR?
Only after the walkthrough is delivered and any r3 review has resolved, use the `ask` tool — **Commit or PR?** — whose recommended option is the size-based landing choice from *Landing Recommendation* below. A one-word answer skips it.

**For multi-ticket `afk` runs (from `implement`)**: one walkthrough section per ticket/commit; those commits were already made per ticket without asking. The end-of-task flow above runs ONCE for the batch — one r3 question, walkthrough sections for every commit, then the landing `ask` ("land on the default branch, or open a PR?").

## The Walkthrough Format
The report must follow this exact order:

1. **The change, in reading order**: Explain the change in the order it should be read (not filesystem order). Each point must have a `file:line` pointer. Strong-style puzzles come first; for ping-pong puzzles, recap the review points instead of re-explaining the user's own code. Keep this to ~10 lines total for normal tickets. Voice: flag parts you are least sure about, and every finding from the blind review, as "where I'd want your eyes".
2. **Explain it back**: one sentence naming the single mechanism in this change the user should be able to explain without the AI (a mechanism, not a structure summary). Skip only when the change has no mechanism (typo, config value, rename).
3. **Skeleton amendments**: list any (file:line + why), or "none".
4. **Conventions**: conventions followed that matter, and any new ones proposed.
5. **Gate**: the gate command and its pass line, from the exit steps.

## Landing Recommendation
The AI must provide a size-based recommendation:
- **Small/Contained** (reviewable in one sitting): Recommend one conventional commit on the current/default branch. Never a PR for small work unless the user asks for an async record.
- **Larger/Cross-cutting** (multi-file, behavioural, config, infra): Recommend a work branch named `feat/…`, `fix/…`, or `chore/…` + PR.

**Landing Execution**:
- **Commit**: Use the `conventional-commit` skill for a single conventional commit.
- **PR**: Use `gh pr create` with the walkthrough as the PR body. Surface the PR URL and **END THE TURN**. Do not wait for review latency; feedback is picked up by a fresh session.
