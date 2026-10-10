# Implement: hitl steps

Read by `implement` when the ticket has an exemplar or changes the load-bearing surface (mode rule: `to-tickets` § Human tasks and mode; term: `implement` § Surface).

## Skeleton
1. **Write** the surface as real code in the real files, bodies not implemented. Use the stack pack's skeleton idiom (`rule://stack-<name>`) when one exists, else the language's own (`raise "not implemented"`, `throw new Error("not implemented")`, `todo!()`). Follow `CODING_STANDARDS.md`. Every surface item the ticket names exists as a head, type, struct or schema.
2. **Review in r3**: publish the skeleton as a `diff` artifact against the start commit and watch it (commands: `skill://r3`). For each annotation, revise the skeleton and reply. Expect architectural restructures, not only renames: restructure fully, republish, and keep watching until the user archives the artifact.
3. **Record what the annotations teach**: propose each item in your reply as one line, filed by kind (onboard § What goes where). A new or renamed domain term goes in `GLOSSARY.md`. A general rule for how code is written goes in `CODING_STANDARDS.md`, tagged repo-specific or stack-generic. A decision with real tradeoffs becomes an ADR. Write only the lines the user accepts.
4. **Update later tickets**: when the agreed surface differs from what later tickets (the ones this ticket blocks) assume, edit them on the tracker so each stays self-contained and correct, and list the edits in the walkthrough.

## Exemplar
The exemplar is a human task: the senior hand-writes the first instance of a pattern the agent would otherwise copy into every later instance.

1. **Prepare the stub**: where the pattern starts, write a `TODO(human)` stub with a doc comment that names the pattern, lists the skeleton heads it fills, and names the later tickets that copy it.
2. **Hand over**: tell the user the file, the stub, and the pattern it starts; then wait for "done".
3. **Review as a pair**: the user has written the code and its test. Rerun the tests, point out anything you would push back on, and offer one insight. Edit the user's code only when they ask.
4. **Record the standard**: propose one `CODING_STANDARDS.md` line naming the exemplar as the pattern's reference for later tickets. Write only the line the user accepts.

## Diff review
Automatic on every hitl ticket, after the build and the self-review.

1. **Publish**: put the built diff on r3 as a `diff` artifact against the start commit, with a short tour listing the files in reading order: entry point first, down the call path, tests beside the code they cover. The review also rebuilds the user's mental model.
2. **Revise**: work through the user's annotations until they archive the artifact.
3. **Record what the annotations teach**, as in § Skeleton step 3.

## Tidy offer
Offered after every diff review, never planned in the ticket. Ask whether the user wants to refactor or delete anything themselves where taste matters. If yes: the user edits and says "done"; rerun the tests and review as a pair (point out pushback, offer one insight), editing the user's code only when asked.

## Take the pen
On demand, any mode: a build worker reported a second failure on the same problem with no new hypothesis. Hand the user the repro and the hypotheses ruled out, and ask whether they take the pen or give a steer. If they take it, wait for "done"; if they steer, resume with the steer.
