# Implement: hitl steps

Read by `implement` when the ticket changes the surface or has a human puzzle.

## Skeleton
1. **Write** the surface as real code in the real files, bodies not implemented. Use the stack pack's skeleton idiom (`rule://stack-<name>`) when one exists, else the language's own (`raise "not implemented"`, `throw new Error("not implemented")`, `todo!()`). Follow `CODING_STANDARDS.md`. Every surface item the ticket names exists as a head, type, struct or schema.
2. **Review in r3**: publish the skeleton as a `diff` artifact against the start commit and watch it (commands: `skill://r3`). For each annotation, revise the skeleton and reply. Expect architectural restructures, not only renames: restructure fully, republish, and keep watching until the user archives the artifact.
3. **Record what the annotations teach**: propose each item in your reply as one line, filed by kind (onboard § What goes where). A new or renamed domain term goes in `GLOSSARY.md`. A general rule for how code is written goes in `CODING_STANDARDS.md`, tagged repo-specific or stack-generic. A decision with real tradeoffs becomes an ADR. Write only the lines the user accepts.
4. **Update later tickets**: when the agreed surface differs from what later tickets (the ones this ticket blocks) assume, edit them on the tracker so each stays self-contained and correct, and list the edits in the walkthrough.

## Human puzzles
1. **Hand over**: outside `tdd`, write all the puzzle's failing tests at once (the user needs the whole target before starting) and its `TODO(human)` stub, or fill in the stub implement's step 2 left. Write the stub's doc comment for a reader meeting this code cold, since it is all they have to apply the logic:
   - **Each argument**: what it is in domain terms, where its value comes from, and 2–3 example values as literals in the shapes the code will really see.
   - **The return value**: what it means to the caller, with an example.
   - **Worked examples**: a table, one row per failing test: the test's name, the arguments, the expected return. Happy path first, then each edge case the tradeoffs hinge on.
   - **Context**: what is already built around it, the task, and the tradeoffs to weigh. The how stays with the user.

   In the handover message, show the worked-examples table, name the file and tests, then wait for "done".
2. **Review as a pair**: rerun the tests. Point out anything you would push back on, and offer one insight. Edit the user's code only when they ask. Once green, offer to trim the stub's handover notes down to the doc comment the function keeps.
