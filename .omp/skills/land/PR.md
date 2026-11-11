# PR

PR means a pull request on GitHub or a merge request on GitLab. Use the forge the `origin` remote points at, through its CLI (`gh` or `glab`).

## Branch and commit

Take a branch named `feat/…`, `fix/…` or `chore/…`, cut from the current base.

Write the commit as `COMMIT.md` § Message says.

An `implement-spec` hand-off carries one extra commit: what the final self-review and checks fixed.

On an attended PR, accepted conventions are filed by `FILING.md` before the commit.

**Done when** the branch holds the checked code.

## Publish

Dispatch a worker: `sonic` for a diff, `task` when it must draw a page or diagram. It writes the artifacts, runs `r3 publish` and returns the URLs. Its result auto-delivers, so end the turn instead of polling. You write the card and notes, never the page HTML, and gate that text with `skill://writing-prose`.

Open the PR with the forge CLI and write the body in `skill://pr`'s shape; for an existing PR, replace its body. Start with the card, then the reading order as a list of paths, then:

- **Defaults**: each choice made without asking the user, one line each, 5 at most, with the alternative as a question. Collect them from the workers' `defaults`, plus `summary`, `issues` and `surface_additions` where one explains a default, and your own choices.

A claim with no other proof on the PR (a command and its output, or a link) goes in the card; there is no separate claims block.

A See it run result (screenshot, recording, or real command output) goes in the body too: the PR is where that result gets judged.

When the **Pages** rule (AGENTS.md § Pages) calls for a page, link it from the body.

Post each note as a review comment on its line of the diff, through the forge CLI or its API.

**Done when** the PR carries the card, notes and defaults, and its URL is in hand.

## Close the tickets

`Closes #N` per tracker ticket in the body closes it on merge. A local ticket goes to `**Status:**` `in-review (#<n>)`: it is not done and not on the frontier. The next `implement` or `implement-spec` run sets it to `done`, naming the PR.

## Hand-offs

- **Open PR made by someone else**: publish the card and notes to it as above, ask nothing.
- **Unattended run**: keep a proposed convention as a PR note.
- **After publication**: the PR waits for the user's review before it merges. That review is the hitl review, so `land` ends at publication.
- The user's tidy is their own commits on the branch, covered by CI.
- The repo needs a required CI check on the default branch before merge; `onboard` offers to turn it on.

Report: the card, then `PR: <url>`.
