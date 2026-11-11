---
name: land
description: "Ends the work on a finished change: checks, notes, end card, then one of four landings: review then commit, commit, a PR, or leave it. Runs after any finished file change, and when the user asks to land work."
---

# Land

Ends a finished change: the user sees what changed, reviews where it matters, then it lands.

**Inputs** from the conversation or hand-over: ticket references, mode, start commit, checks command and pass line, r3 artifact id, open PR, note points. Derive a missing one (start commit: `git merge-base <default> HEAD`). No ticket or no mode means hitl; one spec's tickets in one session go through `implement-spec`.

## Readable output

Every human output opens with the answer or choice, then what changed in plain words, then what the user does next. Lists stop at 3. Say a mode or gate as plain words ("review this before merge"), not a label.

```
<one sentence: what changed and why, in words the user can repeat; skip for a typo, config value or rename>
<only when checks fail: ✗ <command>: <what failed>>

<one visual: a screenshot link for a UI change; else a `part | change` table, 5 rows at most; nothing for a one-part change>

Look at:
- `path:line`: what to check there and why it matters, e.g. what breaks if it is wrong (3 at most; drop the section when none)

Notes:
- a risk to know before merge, or another way to do it, when it has no code line; one line each, 2 at most; the user asks for more (drop the section when none)
```

Where notes go:
- A note about one line of code becomes a comment on that line in r3 or the PR. It names the choice made and asks about the other option, for example `src/session.ts:88`: lock only the write instead? With no r3 or PR, these print in chat.
- The 3 most important code notes also appear in the card as Look at.
- A note with no code line goes in the card's Notes block.

**Final report** after landing: the card, then `Committed <sha>`, `PR: <url>` or `Left uncommitted`.

**Unattended run**: no user, so no chat card or question; the run takes the PR path and the card goes in the PR body.

## The run

**Check**. Reuse the hand-over pass line if no file changed since. Else one `sonic` worker runs the checks in `CHECKS.md` order, reporting the command and pass line or the failing tests. **Done when** the pass line is in hand, or its absence is stated.

**Write the notes**. Build them from the workers' `summary`, `issues`, `defaults` and `surface_additions`, `git diff --stat` since the start commit, and the commit messages; a `scout` reads the full diff and returns candidates as `file:line`. A note is a risk to know before merge, or another way to do it. One or two sentences, 25 words at most, nothing the diff shows. **Done when** every note is written, or there are none.

**Show the card**. Print the card. About 15 lines, no paragraphs. The same card is the r3 summary and the PR body. **Done when** the card is printed.

**Ask how to land**. One `ask`: the recommendation in plain words first, then only the options the situation allows, for example, for an afk typo, "I'd commit this: commit, review first, or PR?". The publish question follows AGENTS.md § Ask before you act. **Done when** one option is chosen.

Read the file for the chosen option and follow only it.

- **review, tidy, then commit**: `REVIEW.md`. For hitl and afk behavioural or multi-file work. Hitl commits after the review.
- **commit**: `COMMIT.md`. For an afk typo, config value or rename.
- **PR**: `PR.md`. For an `implement-spec` hand-off, an unattended run, and an afk change with a note that spans several files.
- **leave it**: no file. The work stays uncommitted; report the card and `Left uncommitted`.

Hitl, which includes no ticket, offers only review then commit and PR. Afk behavioural or multi-file work adds leave it and drops plain commit: recommend PR when the change has a note and spans several files, else review. An open PR made by someone else, or an unattended run, asks nothing and goes to `PR.md`, which carries the card and notes and surfaces the URL.

**After the landing**: when the repo is onboarded, not a fork, and not unattended, run `retro` when the ticket just landed was its spec's last open ticket; skip it when the run had no friction. Suggest `calibrate` when the last `Date` row of `docs/agents/calibration.md` is at least 30 days old and 3 specs have closed since.
