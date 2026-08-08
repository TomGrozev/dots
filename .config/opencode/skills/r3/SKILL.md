---
name: r3
description: Push a diff for human review via r3 and manage the review workflow — creating reviews, watching for annotations, replying to feedback, and reanchoring. Use when pushing complex or high-impact changes for user annotation and approval, or when r3, code review, or human review workflow comes up.
---

# r3 — Human Review Workflow

r3 pushes diffs to a web UI for human annotation before you proceed with high-impact changes.

Run `r3 guide` to get the current, authoritative workflow reference — the CLI evolves, so always defer to its live output rather than any cached description here.

Typical shape of the workflow (confirm exact commands via `r3 guide`):
1. Create a review of the current diff.
2. Watch for the user's annotations.
3. Reply to feedback and iterate until the user approves.

Do not continue with further code changes until the review is resolved.
