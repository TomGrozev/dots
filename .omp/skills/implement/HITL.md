# Implement: the two review gate steps

Read `skill://to-tickets/REVIEW-GATES.md` for the `## Review gates` table format, the six gate reasons and the "Not reasons" list.

Two gate steps only, matching the two `Review gate` values of the ticket's Review gates table:

- **Shape review**: a `before build` gate. The user sees the skeleton and the placement map before any body is written. Run before the build starts.
- **See it run**: an `after build` gate. The user sees the running result. Run after the build ends, before the self-review.

## Surface

The module layout, public function heads and types, persisted data shape, and cross-module contracts.

A **load-bearing surface** is the part of that surface worth a review gate, because changing it later is hard to reverse. The `before build` reasons that mark it are Migration, An outside contract and New structure. For a new module the load-bearing part is its layout and public heads; for a copied shape, the shape itself. Internal functions, types and private helpers inside an existing module are surface but not load-bearing: they go afk, and the review is offered at landing (`land` r3 review), not promised.

## Shape review

1. **Write the skeleton**: the reviewed load-bearing surface as real code in the real files, bodies not implemented. Every surface item the ticket names exists as a head, type, struct or schema. Use the stack pack's skeleton idiom (`rule://stack-<name>`) when one exists, else the language's own (`raise "not implemented"`, `throw new Error("not implemented")`, `todo!()`). Follow `CODING_STANDARDS.md`. The skeleton is not production behaviour: the build fills each body test-first through `skill://tdd`.
2. **Header**: the ticket and its gate with its reason.
3. **Intent**: one sentence of what the ticket makes true, plus 2 to 3 acceptance examples, given / when / then, one line each.
4. **Placement map**: a diagram of the solution-side parts, 9 boxes at most. Each box has a name, a path, and a status: NEW, CHANGED, REUSED, REMOVED or STORED, shown by text and line style, not colour alone. A NEW box carries one "Why new" line that names the existing thing it does not extend. Edges say who calls or writes whom; a removed edge is dashed.
5. **Review points**: the two that matter most here, with evidence: right module or layer; reused what exists; domain terms match the glossary; scope still matches the ticket; contract change is intended; deletions are intended.
6. **Decisions**: 0 to 5, in the decision form below.
7. **Skeleton diff**: a link, not the main content.

The first screen holds the header, the intent and the map; the review points and decisions follow below it.

**Decision form**: one line for the question, then 2 options (sometimes 3), named A, B, C, each with one reason line (when a person picks it, its main gain, its main cost), taken from the spec, the ADRs and the code, never invented. In a shape review the map and the evidence speak first, so hold your pick until the user answers; reveal it with its reason only after the user replies.

**Where it shows**: the **Pages** rule in AGENTS.md decides between chat (a mermaid map) and an HTML page on r3 (`skill://publish-artifacts-to-r3`). A shape review that crosses a boundary meets the **Pages** rule, so it is usually a page. The page holds the header, the intent, the placement map, the review points and the decisions. Name the box and decision ids in your message.

**Wait** for the user's reply. The build does not start until the shape is approved or changed. Every decision needs a choice. Any wording that names an option counts as an answer; a bare "yes" with open decisions does not, so ask which option. An r3 archive with open decisions does not continue the build: ask in chat.

**Apply** the answers, one action at a time:
1. Write an ADR (`domain-modeling` format) for each answer that fixes a hard-to-undo choice (load-bearing surface). The ADR goes in `docs/adr/` (fork: `.omp/docs/adr/`).
2. File one line per accepted review lesson. Read `skill://land/FILING.md` for the what-goes-where test. Write only the lines the user accepts.
3. Note a stack-generic convention seen in the review for stack-pack promotion.
4. Edit each later ticket that builds on the agreed surface (the ones this ticket blocks) on the tracker to match, so each stays self-contained.
5. Record each edit as a note (`land` step Notes).
6. Add one line to the ticket: `Shape review: design changed: yes (<what changed>)` or `Shape review: design changed: no change`.

**Done when** the answers are applied, each decision has a choice, and every ticket this one blocks is edited on the tracker to match.

## See it run

Show the running result, not a plan: a screenshot, a short recording, or a real command's output, published to r3 (`skill://publish-artifacts-to-r3`) or pasted in chat when the output is small. Add one line on what to react to: the flow, the feel, the output. Wait for the reply; fix the real objections and show again.
