---
name: r3
description: "Publish a diff or files to r3 for human review and work the feedback loop. Use for the skeleton review in implement, when the user picks r3 at the walkthrough, or when the user asks for r3."
---

# r3

r3 publishes immutable versions of an artifact (a diff, files, or HTML) for the user to annotate, and returns their feedback to you.

Run `r3 guide` once per session, and `r3 guide <kind>` before first publishing that kind: the CLI evolves, so its live output is the authority on commands, waiting and exit codes.

The loop:
1. Create the artifact, share the URL, and tell the user the review is over when they archive it in r3 (optionally with a closing message) or say so in chat.
2. Wait for feedback, in the background when your harness allows, and end your turn.
3. For each new comment: revise, republish, and reply. Then wait again before ending your turn.
4. Done when the artifact is archived or the user says the review is over: act on any closing message, then start the work the review gates (commit, build, the next step).

Archived is the only end. Every other event, a thread marked resolved included, means wait again.
