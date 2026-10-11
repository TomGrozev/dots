# Implement: hitl and skeleton steps

Read by `implement`: § Skeleton on tickets with `review: skeleton`, § Take the pen in any mode.

## Skeleton
Only on a ticket carrying `review: skeleton` (mode rule: `to-tickets` § Human tasks and mode).

1. **Write** the load-bearing surface (implement § Surface) as real code in the real files, bodies not implemented. Use the stack pack's skeleton idiom (`rule://stack-<name>`) when one exists, else the language's own (`raise "not implemented"`, `throw new Error("not implemented")`, `todo!()`). Follow `CODING_STANDARDS.md`. Every surface item the ticket names exists as a head, type, struct or schema.
2. **Review in r3**: publish the skeleton as a `diff` artifact against the start commit and watch it (commands: `skill://r3`). For each annotation, revise the skeleton and reply. Expect architectural restructures, not only renames: restructure fully, republish, and keep watching until the user archives the artifact.
3. **Record what the annotations teach**: propose each item in your reply as one line, filed by kind (onboard § What goes where). Write only the lines the user accepts.
4. **Update later tickets**: when the agreed surface differs from what later tickets (the ones this ticket blocks) assume, edit them on the tracker so each stays self-contained and correct, and record each edit as a note (`land` § Notes).

## Take the pen
On demand, any mode: a build worker reported a second failure on the same problem with no new hypothesis. Hand the user the repro and the hypotheses ruled out, and ask whether they take the pen or give a steer. If they take it, wait for "done"; if they steer, resume with the steer.
