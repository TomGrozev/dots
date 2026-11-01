# Implement: the two review gate steps

Read by `implement`: how to run the review gate steps on a hitl ticket, and § Take the pen in any mode. The gate table format, the valid reasons, and the mode and label rules live in `to-tickets` § Review gates; this file does not repeat them.

## The gate steps

Two gate steps only, matching the two `When` values of the ticket's Review gates table:

- **The Shape review step**: a `before build` gate. The user sees the skeleton and the placement map before any body is written.
- **The See it run step**: an `after build` gate, before `land`. The user sees the running result.

There is no standalone decision step and no step for hard-to-reverse actions: the always-loaded rule in `.omp/AGENTS.md` (ask before anything hard to reverse) covers them on every ticket.

## Shape review

Run in `implement` step 1 for each `before build` gate, before any body is written.

1. **Write the skeleton**: the reviewed load-bearing surface (`implement` § Surface) as real code in the real files, bodies not implemented. Every surface item the ticket names exists as a head, type, struct or schema. Use the stack pack's skeleton idiom (`rule://stack-<name>`) when one exists, else the language's own (`raise "not implemented"`, `throw new Error("not implemented")`, `todo!()`). Follow `CODING_STANDARDS.md`. The skeleton is not production behaviour: the build fills each body test-first through `skill://tdd`.
2. **Show the shape**, in this order: the header (the ticket and its gate with its Why), the intent (one sentence of what the ticket makes true, plus 2 to 3 acceptance examples, given / when / then, one line each), the placement map, the review points, the decisions, and the skeleton diff link.

   - **Placement map**: a diagram of the solution-side parts, 9 boxes at most. Each box has a name, a path, and a status: NEW, CHANGED, REUSED, REMOVED or STORED, shown by text and line style, not colour alone. A NEW box carries one "Why new" line that names the existing thing it does not extend. Edges say who calls or writes whom; a removed edge is dashed.
   - **Review points**: the two that matter most here, with evidence: right module or layer; reused what exists; domain terms match the glossary; scope still matches the ticket; contract change is intended; deletions are intended.
   - **Decisions**: 0 to 5, in the form below.
   - **Skeleton diff**: a link, not the main content.

   The first screen holds the header, the intent and the map; the review points and decisions follow below it.

**Decision form**: one line for the question, then 2 options (sometimes 3), named A, B, C, each with one reason line (when a person picks it, its main gain, its main cost), taken from the spec, the ADRs and the code, never invented. Do not show your pick. Reveal it with its reason only after the user replies.

**Where it shows**: the **Pages** rule in AGENTS.md decides between chat (a mermaid map) and an HTML page on r3 (`skill://publish-artifacts-to-r3`). A shape review that crosses a boundary meets the **Pages** rule, so it is usually a page. For a page, the `designer` worker draws it with `skill://diagram-design`, in the look of `placement-map-example.html` beside this file. Name the box and decision ids in your message, and run the guide's checks (`self_check.py`, `verify-geometry.py`) before publishing.

**Wait** for the user's reply. The build does not start until the shape is approved or changed. Every decision needs a choice. Any wording that names an option counts as an answer; a bare "yes" with open decisions does not, so ask which option. An r3 archive with open decisions does not continue the build: ask in chat.

**Apply** the answers. An answer that fixes a hard-to-undo choice (`implement` § Surface, load-bearing) becomes an ADR (`domain-modeling` format) in the repo's ADR directory. Other review lessons become one line filed by kind (onboard § What goes where); write only the lines the user accepts. A stack-generic convention seen in a review is noted for stack-pack promotion. When later tickets (the ones this ticket blocks) build on the agreed surface, edit them on the tracker to match, so each stays self-contained, and record each edit as a note (`land` step Notes).

## See it run

Run in `implement` step 3, after the build and before `land`. Show the running result, not a plan: a screenshot, a short recording, or a real command's output, published to r3 (`skill://publish-artifacts-to-r3`) or pasted in chat when the output is small. Add one line on what to react to: the flow, the feel, the output. Wait for the reply; fix the real objections and show again.

## Take the pen
On demand, any mode: a build worker reported a second failure on the same problem with no new hypothesis. Hand the user the repro and the hypotheses ruled out, and ask whether they take the pen or give a steer. If they take it, wait for "done"; if they steer, resume with the steer.
