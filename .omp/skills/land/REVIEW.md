# Review, tidy, then commit

The steps run in this order.

## Review

Run one round through a worker (`skill://r3-review`): dispatch `sonic` for a diff, `task` when it must draw a page or diagram. It writes the artifacts, runs `r3 publish` and returns the URLs. Its result auto-delivers, so end the turn instead of polling.

You write the card, notes and threads, never the page HTML. A review carries the card first, then each note as a comment on its line. Files go in reading order: entry point first, down the call path, tests beside the code they cover. That text is public: gate it with `skill://writing-prose` before the worker publishes.

A thread opens with its choice:

```
<the choice or question, one line>
<what the code does now, one sentence>
<what the other option would cost, one line>
```

You also write the decisions. Revise until the user archives the artifact. On hitl, the commit comes after this review, never before it.

**Done when** the user archived the round.

## File the conventions

Propose what the annotations teach, one line each, filed by `FILING.md`. Write only the lines the user accepts, gated by `writing-prose`.

**Done when** each accepted line is written, or none is accepted.

## Tidy

Offered once, after the review. Ask whether the user wants to refactor or delete anything where taste matters. If yes, the user edits; you review the edit as a pair (pushback, one insight) and edit their code only when asked.

**Done when** the user declined or said done, and the pair review happened.

## Checks again

When the review or the tidy changed code, one `sonic` worker re-runs the checks in `CHECKS.md` order; else the hand-over pass line stands. **Done when** they pass on the code being committed.

Then follow `COMMIT.md`.
