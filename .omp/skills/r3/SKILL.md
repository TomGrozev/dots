---
name: r3
description: "Publish a diff or files to r3 for human review and work the feedback loop. Use for the skeleton review in implement, when the user picks r3 at the walkthrough, or when the user asks for r3."
---

# r3

r3 publishes immutable versions of an artifact (a diff, files, or HTML) for the user to annotate, and returns their feedback to you.

Run `r3 guide` once per session, and `r3 guide <kind>` before first publishing that kind: the CLI evolves, so its live output is the authority on commands and exit codes.

The loop:
1. Create the artifact and share the URL.
2. Watch for feedback.
3. For each item: revise, republish, and reply.
4. Repeat until the review resolves; the work it gates continues after that.
