---
name: r3-review
description: "Runs one human review round on r3 from omp: publish the diff, wait for comments, reply, until the user archives. Use when a hitl gate or land asks for an r3 review, and when the user says there is feedback on r3."
---

# r3 review rounds

A round is one human review on r3. Run `r3 guide` once per session for replies, restore and
watch; the publishing worker runs `r3 guide diff` itself. This skill adds only what this
workflow and omp need.

Publishing is a worker's job. Dispatch `sonic` for a diff or a new version of one, `task` when
it must draw a page or diagram. Give it the
artifact id, the base, the order file and your summary text. It writes the page and the diff
artifact, runs `r3 publish` and returns the URLs; its result auto-delivers, so end the turn
after dispatch and do not poll it (`wait` in a loop, `read proc://<id>`). You write the summary
and thread text, never the page HTML.

## The artifact

Each ticket gets one `diff` artifact (ad-hoc work: one per task). The first round of the ticket
creates it, whichever gate that is; each later round publishes the current diff to it as a new
version. The user archives the artifact at the end of each round, so a later round, or a chat
answer copied to a thread after the archive, starts with `r3 restore <id>`. The id goes in the
hand-over to `land`.

The worker publishes the patch in reading order: entry point first, then down the call path,
with tests beside the code they cover. List the paths in an order file and pass it to git:

```sh
git add -N <new files>   # untracked files reach `git diff` only as intent-to-add
git diff -O<order file> <base> | r3 publish <id> --stdin-diff --summary '<summary>'
```

The summary renders markdown, but not mermaid.

r3 writes need `R3_AGENT_SESSION`; the `r3-agent-session` extension sets it. Never pass `--human`.

## A page

A page that the **Pages** rule calls for is a separate `html` artifact. The worker builds it and
links it from the diff's summary. Decisions and answers stay in threads on the diff.

## Waiting

omp gets no r3 notifications. Start a watch for each artifact of the round, give the user the
links, and end the turn:

```
bash {command: "r3 watch <id> --timeout 0", async: true, timeout: 0}
```

Its output wakes the session when the user acts; never poll. Handle the exit as the guide says,
then watch again. Exit 0 means the user archived the diff: the round ends, and you archive the
page.

A watch dies when the session restarts. When the user says there is feedback, or when you
resume a round with no watch running, run `r3 comment fetch <id>` first.

The user may answer in chat. Treat that answer as a thread reply, and copy it to its thread.
