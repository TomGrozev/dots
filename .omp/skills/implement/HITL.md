# Implement: the two human stops

Read by `implement`: how to run the `before:` and `after:` stops on a hitl ticket, and § Take the pen in any mode. The Human line grammar and the valid-Why rule live in `to-tickets` § Human tasks and mode.

## Before stop

Run in `implement` step 1, before building the part under review. A `before:` line whose Why is about placement, a boundary, stored data or a contract is a shape review; any other `before:` line is a decision. An `after:` line is never a before stop: it runs § After stop.

- **Shape review**: the user sees the shape before any body is written. Its line reads `before: the shape of <area>`, or any wording whose Why is about placement, a boundary, stored data or a contract.
- **Decision**: one open choice with no new shape. Show only the header (step 2.1), the intent (step 2.2) and the decision, in the form below. The hidden pick binds here too.

**Shape review steps:**

1. **Write the skeleton**: the load-bearing surface (implement § Surface) as real code in the real files, bodies not implemented. Every surface item the ticket names exists as a head, type, struct or schema. Use the stack pack's skeleton idiom (`rule://stack-<name>`) when one exists, else the language's own (`raise "not implemented"`, `throw new Error("not implemented")`, `todo!()`). Follow `CODING_STANDARDS.md`.
2. **Show the shape**, in this order:
   1. **Header**: the ticket and its `before:` line with the Why.
   2. **Intent**: one sentence of what the ticket makes true, plus 2 to 3 acceptance examples (given / when / then, one line each).
   3. **Placement map**: a diagram of the solution-side parts, 9 boxes at most. Each box has a name, a path, and a status: NEW, CHANGED, REUSED, REMOVED or STORED, shown by text and line style, not colour alone. A NEW box carries one "Why new" line that names the existing thing it does not extend. Edges say who calls or writes whom; a removed edge is dashed.
   4. **Checks**: the two that matter most here, with evidence: right module or layer; reused what exists; domain terms match the glossary; scope still matches the ticket; contract change is intended; deletions are intended.
   5. **Decisions**: 0 to 5, in the form below.
   6. **Skeleton diff**: a link, not the main content.

   The first screen holds the header, the intent and the map; the checks and decisions follow below it.
3. **Size**: more than 9 boxes or 5 decisions means the ticket is too big. Split it before you show it.

**Each decision**: one line for the question, then a table of 2 options (sometimes 3). Each option has one reason line: when a person picks it, its main gain, its main cost. Take the reasons from the spec, the ADRs and the code; never invent them. Do not show your pick. Reveal it with its reason only after the user replies. Earlier user research: a pick shown first gets unchecked approval.

**Where it shows**: the **Pages** rule in AGENTS.md decides between chat (a mermaid map) and an HTML page on r3 (`skill://publish-artifacts-to-r3`). A shape review that crosses a boundary meets the **Pages** rule, so it is usually a page. For a page, the `designer` worker draws it with `skill://diagram-design`, in the look of `placement-map-example.html` beside this file. Name the box and decision ids in your message, and run the guide's checks (`self_check.py`, `verify-geometry.py`) before publishing.

**Wait** for the user's reply. On a shape review, the build does not start until the shape is approved or changed. Every decision, in either form, needs a choice. Any wording that names a choice counts; a bare "yes" with open decisions does not, so ask which option. An r3 archive with open decisions does not continue the build: ask in chat.

**Apply** the answers. For each review comment, propose what it teaches as one line, filed by kind (onboard § What goes where); write only the lines the user accepts. When later tickets (the ones this ticket blocks) build on the agreed surface, edit them on the tracker to match, so each stays self-contained, and record each edit as a note (`land` step Notes).

## After stop

Run in `implement` step 3, after the build and before `land`. Show the running result, not a plan: a screenshot, a short recording, or a real command's output, published to r3 (`skill://publish-artifacts-to-r3`) or pasted in chat when the output is small. Add one line on what to react to: the flow, the feel, the output. Wait for the reply; fix the real objections and show again.

## Take the pen
On demand, any mode: a build worker reported a second failure on the same problem with no new hypothesis. Hand the user the repro and the hypotheses ruled out, and ask whether they take the pen or give a steer. If they take it, wait for "done"; if they steer, resume with the steer.
