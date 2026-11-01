---
name: land
description: "Ends the work on a finished change: checks, notes, end card, then review, tidy and commit, or a PR. Runs after any finished file change, and when the user asks to land work."
---

# Land

Ends a finished change: the user sees what changed, reviews where it matters, and the change gets committed or put on a PR.

**Inputs**, each when it exists: the ticket reference(s), the mode (hitl or afk), the start commit, the checks command, an open PR, and points gathered for notes while working. Work with no ticket (ad-hoc, `calibrate`) lands as hitl.

## Steps

1. **Checks**. Reuse the checks command the caller passed. Otherwise run `implement` step 5. Checks' fallback rule. **Done when** the checks command and its pass line are in hand, or the absence is stated.
2. **Notes**. Read the diff since the start commit (or the uncommitted work) and write the notes, starting from the points passed in. A note about code sits on one line of code (`file:line`). A note with no code line (a tracker edit, an assumption or default, a convention you propose) goes in the end card's Notes block. A note covers a risk the user must know about before merge, or a spot they might reasonably want done another way. No status lines, no "all good", nothing the diff already shows plainly. One or two short sentences, at most 25 words: what you did, then the other option as a question. Good: "Retries use a fixed 1 s delay. Exponential backoff instead?" At most 3 notes in chat. Every note about code goes as a line comment on the r3 diff or PR. A note with no code line stays in the card's Notes block, which is omitted when empty. On a commit or "leave it" landing there is neither, so print every note in chat, one line each. Chat otherwise shows only the top 3 as the card's Look at bullets. **Done when** every note is written, or there are none.
3. **End card**. Print the card below in chat. The same card heads the r3 review summary and the PR body. An **unattended run** is a run with no user: the card goes in the PR body only, not chat. About 15 lines plus the visual; no paragraphs; do not repeat the ticket; no lines that only say "all good".

   ```
   <✓ or ✗> checks · <N> files · +<added> −<deleted>
   <one sentence: what changed and why, naming the mechanism the user can explain without the AI; skip that for a typo, config value or rename>

   <one visual: a mermaid diagram when a flow, a state or a structure changed; else a table `part | change`, 5 rows at most>

   Look at:
   - `path:line`: <12 words at most on why to look>   (3 bullets at most; omit the section if none)

   Notes:
   - <one line per note with no code line; a risk to know before merge or another way to do it; omit the section when none>
   ```

   **Done when** the card is printed.
4. **Landing question**. On an `implement-spec` hand-off, each ticket already has its commit on the integration branch: commit what the final self-review and the checks fixed in one extra commit, ask once whether to publish (the ask-before-publish rule in AGENTS.md), then push the branch and take the PR path without the landing question. The mode is hitl when any ticket is hitl. Step 8 closes every ticket. Skip the landing question when the work is already on an open PR someone else made: publish to that PR (§ Publishing, PR), surface the URL, then go to step 9. On an unattended run: never ask; always take the PR path and never wait on an r3 review. Otherwise one `ask`. When mode is hitl, a commit needs the user's review first (step 5), so offer only these two:
   - **review, tidy, then commit**: steps 5, 6, 7, then step 8 as a commit (see Landing rules), citing the ticket.
   - **PR**: a `feat/…`, `fix/…` or `chore/…` branch, steps 7 and 8 on that branch (Landing rules), then `gh pr create`, publish to it (§ Publishing, PR), and surface the URL. The user's PR review is the hitl review; the PR waits for it before it merges.

   Otherwise (afk) offer four options, and with at least one note recommend "review, tidy, then commit" (or PR for multi-file or behavioural change) over "commit":
   - **commit**: steps 7 and 8 as a commit (see Landing rules), citing the ticket.
   - **review, tidy, then commit**: as above.
   - **PR**: as above. Recommended for multi-file, behavioural, config or infra change.
   - **leave it**: the change stays uncommitted.

   **Done when** one option is chosen and handed to its steps, or on an open PR the card and notes are posted, with the PR URL surfaced.
5. **r3 review**. Only for **review, tidy, then commit** (never on an unattended run). Publish to r3 (§ Publishing, r3). The user annotates the diff and resolves or replies to the notes; revise and reply until the user archives it. Then propose what the annotations teach, one line each filed by kind (onboard § What goes where); a stack-generic convention seen here is noted for stack-pack promotion. Write only the lines the user accepts. **Done when** the user has archived the review artifact and the accepted lines are written.
6. **Tidy**. Only for **review, tidy, then commit** (never on an unattended run). Offered once after the review. Ask whether the user wants to refactor or delete anything themselves where taste matters. If yes: the user edits and says "done"; review the edit as a pair (point out pushback, offer one insight), editing the user's code only when asked. **Done when** the user has declined or said "done", and when tidied, the pair review has happened.
7. **Checks again**. Re-run the checks when the review or the tidy changed code; otherwise the step 1 result stands. **Done when** the checks pass on the code being committed.
8. **Commit or PR**. Carry out the chosen landing (Landing rules below). Then close each ticket: on a direct commit, set the local ticket's `**Status:**` to `done` (or close the tracker issue); on the PR path, the PR body says `Closes #N` for each ticket and the local ticket's `**Status:**` is set to `done`, naming the PR. When a note proposed a convention and the user accepted it, file it by kind (onboard § What goes where); this needs the user, so it is interactive only. On an unattended run, a proposed convention stays a note in the PR body. **Done when** the commit exists, or the PR is open with its URL surfaced, or the change stays uncommitted by the user's choice; and the tickets are closed.
9. **Calibrate note**. Runs on every exit, including "leave it" and the PR paths. On an unattended run, skip this step. When the ticket just landed was the last open ticket of its spec (check the tracker; a local ticket lives beside its spec in `.scratch/<slug>/`), or the work is on a PR that covers every remaining open ticket of the spec (then: "after merging, run `calibrate`"), the repo is onboarded (`CODING_STANDARDS.md` exists) and it is not a fork, close with one line suggesting the user run `calibrate` in a fresh session. **Done when** the note is printed or the conditions do not hold.

## Landing rules

Commits in this skill depend on mode:
- **afk**: conventional commit: read `skill://conventional-commit` and write the message to it.
- **hitl**: stage files, then call `commit_as_me` with the conventional-commit message. If it errors (user declined/no UI), show the returned `git commit -F <file>` command and wait; never commit yourself.

## Publishing

A review or a PR carries the end card, then each note as a comment on its line. The files go in **reading order**: entry point first, down the call path, tests beside the code they cover. A page (r3 `html` artifact) carries the placement map (`implement/HITL.md` § Shape review) of the whole change, and goes with the review or the PR only when the **Pages** rule in AGENTS.md applies; on a PR, link it in the body.

- **r3**: the diff view shows files in patch order, so build the patch in reading order and publish it as a `diff` artifact (full commands: `skill://publish-artifacts-to-r3`):

  ```sh
  git add -N <new files>   # untracked files enter `git diff` only as intent-to-add
  git diff -O<order file> <start commit> | r3 create --kind diff --stdin-diff --title '<ticket>' --summary '<card>'
  ```

  `<order file>` lists the changed paths in reading order, one per line. The `--summary` is the end card. For a revision of an existing artifact, publish to it instead:

  ```sh
  git diff -O<order file> <start commit> | r3 publish <artifact> --stdin-diff --summary '<card>'
  ```

  Then post each note:

  ```sh
  r3 thread add <artifact> --file <path> --version <seq> --view diff --side new --line <a-b> --quote '<exact line text>' -m '<note>'
  ```

- **PR**: GitHub lists files alphabetically, so write the reading order as a list of paths under the end card in the PR body, in `skill://pr`'s shape (`gh pr edit <n> --body-file`, or the body of `gh pr create`). The PR body is the end-of-work page, so after the end card and reading order it carries two more blocks:
  - **Defaults**: each choice made without asking the user, one line each, with the alternative as a question. Collected from the workers' `### Defaults` report sections and your own choices.
  - **Claims**: each claim the work makes with its proof (command and output, or a link), or marked "unverified".

  A See it run gate (`implement/HITL.md` § See it run) shows its running result (screenshot, recording, or real command output) in the PR body too: the PR is where that result gets judged. Then post each note as a review comment on its line:

  ```sh
  gh api repos/{owner}/{repo}/pulls/<n>/comments -f body=... -f path=... -F line=... -f side=RIGHT -f commit_id=<head sha>
  ```

  The PR review and the user's tidy (their own commits on the branch, covered by CI) happen in their own session. On a hitl ticket the user's review is required before merge; on this PR path, the user's PR review is that review. `land` ends at publication; the merge waits on that review.
