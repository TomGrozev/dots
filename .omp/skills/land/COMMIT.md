# Commit

## Message

The message is text a person reads later: write it to `skill://writing-prose` with that skill's gate run, in the shape `skill://conventional-commit` sets.

- **afk**: make the conventional commit.
- **hitl**: stage the files, then call `commit_as_me` with that message. If it errors (user declined, no UI), show the returned `git commit -F <file>` command for the user to run.

Accepted conventions are filed by `FILING.md` before the commit.

The commit cites the ticket.

**Done when** the commit exists and the checks passed on the code it holds.

## Close the tickets

A local ticket lives beside its spec in `.scratch/<slug>/`.

- Direct commit: set `**Status:**` to `done`, or close the tracker issue.
- PR: `PR.md` sets it `in-review (#<n>)`.

**Done when** every ticket is closed or marked for review.

Report: the card, then `Committed <sha>`.
