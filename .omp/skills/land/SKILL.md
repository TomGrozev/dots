---
name: land
description: "Lands a finished change: notes on the code, the landing question, then review, tidy and commit, or a PR. Runs after walkthrough, or on its own when the user asks to land work."
---

# Land

Gets a finished change committed or onto a PR, with the user's review where it matters.

**Inputs**, each when it exists: the summary, the ticket reference, the mode (hitl or afk), an open PR, and points gathered for notes while working.

## Steps

### 1. Notes
Read the diff since the start commit (or the uncommitted work) and write the notes, starting from the points passed in.

Each **note** sits on one line of code (`file:line`) and is about one of:
- a spot you are least sure of;
- a code-review finding you left open;
- a public addition you made mid-build;
- a choice that isn't obvious from the code;
- an assumption;
- an edit you made to a later ticket;
- a convention you propose.

Write a note only when the user might reasonably want it done another way. Zero notes is normal.

Write each note as one or two short sentences, at most 25 words, in plain words: what you did, then the other option as a question. Name the thing, not the theory. The user resolves the note to accept, or replies.
- Good: "Retries use a fixed 1 s delay. Exponential backoff instead?"
- Too long: "Regarding the resilience strategy of the HTTP client layer, I opted for a constant inter-attempt delay, though one could argue that exponential backoff with jitter would better handle thundering-herd scenarios."

Notes stay out of chat until step 2; they are published with the code (§ Publishing).

**Done when** every note is written, or there are none.

### 2. Ask
When the work is already on an open PR (`implement-spec` opens one), skip the `ask`: publish to that PR (§ Publishing, PR), surface the URL, then go to step 6.

Otherwise, one `ask`, saying how many notes there are. When mode is hitl, the review is required, so offer only these two:
- **review, tidy, then commit**: run steps 3 Review and 4 Tidy, then step 5 Gate, and land as a commit (see Landing rules), citing the ticket.
- **PR**: a `feat/…`, `fix/…` or `chore/…` branch, step 5 Gate, land as a commit, run `gh pr create`, then publish to it (§ Publishing, PR), surface the URL and go to step 6.

Otherwise offer four options:
- **commit**: run step 5 Gate, land as a commit (see Landing rules), citing the ticket, and print the notes in chat, one line each. Recommended for small, contained work reviewable in one sitting.
- **review, tidy, then commit**: as above.
- **PR**: as above. Recommended for multi-file, behavioural, config or infra change.
- **leave it**: the change stays uncommitted; print the notes in chat, one line each.

When there is at least one note, recommend "review, tidy, then commit" (or PR for multi-file or behavioural change) over "commit".

**Done when** the chosen option is carried out, or on an open PR the summary and notes are posted, with the PR URL surfaced.

### 3. Review
Only for **review, tidy, then commit**. Publish to r3 (§ Publishing, r3). The user annotates the diff and resolves or replies to the notes; revise and reply until the user archives it.

Then propose what the annotations teach, one line each filed by kind (onboard § What goes where), and for a ticket with `review: pattern <name>` one `CODING_STANDARDS.md` line naming the file as the pattern's reference instance. Write only the lines the user accepts.

**Done when** the user has archived the review artifact and the accepted lines are written.

### 4. Tidy
Only for **review, tidy, then commit**. Offered once after the review. Ask whether the user wants to refactor or delete anything themselves where taste matters. If yes: the user edits and says "done"; review the edit as a pair (point out pushback, offer one insight), editing the user's code only when asked.

**Done when** the user has declined or said "done", and when tidied, the pair review has happened.

### 5. Gate
Run the Gate on every path that lands as a local commit (commit, review, tidy, then commit, and the PR branch commit). Review revisions and the tidy change code after the walkthrough's Gate, so its result stands only when nothing changed since then.

**Done when** the Gate passes on the code being committed.

### 6. Close
Every exit reaches this step. When the ticket just landed was the last open ticket of its spec (check the tracker), or the work is on a PR that covers every remaining open ticket of the spec (then: "after merging, run `calibrate`"), the repo is onboarded (`CODING_STANDARDS.md` exists) and it is not a fork, end with one line suggesting the user run `calibrate` in a fresh session.

## Landing rules
Commits in this skill depend on mode:
- **afk, or no mode**: conventional commit: read `skill://conventional-commit` and write the message to it.
- **hitl**: stage files, then call `commit_as_me` with the conventional-commit message. If it errors (user declined/no UI), show the returned `git commit -F <file>` command and wait; never commit yourself.

## Publishing
A review or a PR carries the summary when there is one (diagram as a mermaid block) and each note as a comment on its line. The files go in **reading order**: entry point first, down the call path, tests beside the code they cover.
- **r3**: the diff view shows files in patch order, so build the patch in reading order and publish it as a `diff` artifact (commands: `skill://r3`):

  ```sh
  git add -N <new files>   # untracked files enter `git diff` only as intent-to-add
  git diff -O<order file> <start commit> | r3 create --kind diff --stdin-diff --title '<ticket>' --summary '<summary>'
  ```

  `<order file>` lists the changed paths in reading order, one per line. For a revision of an existing artifact, publish to it instead:

  ```sh
  git diff -O<order file> <start commit> | r3 publish <artifact> --stdin-diff --summary '<summary>'
  ```

  Then post each note:

  ```sh
  r3 feedback add <artifact> --file <path> --version <seq> --view diff --side new --line <a-b> --quote <exact line text> -m '<note>'
  ```

- **PR**: GitHub lists files alphabetically, so write the reading order as a list of paths under the summary in the PR body, in `skill://pr`'s shape (`gh pr edit <n> --body-file`, or the body of `gh pr create`). Then post each note as a review comment on its line:

  ```sh
  gh api repos/{owner}/{repo}/pulls/<n>/comments -f body=... -f path=... -F line=... -f side=RIGHT -f commit_id=<head sha>
  ```

  The PR review and the user's tidy (their own commits on the branch, covered by CI) happen in their own session; `land` ends once the PR is published.
