# Implement: the two review gate steps

Read `skill://to-tickets/REVIEW-GATES.md` for the `## Review gates` table format, the six gate reasons and the "Not reasons" list.

Two gate steps only, matching the two `Review gate` values of the ticket's Review gates table:

- **Shape review**: a `before build` gate. The user sees the skeleton and the placement map before any body is written. Run before the build starts.
- **See it run**: an `after build` gate. The user sees the running result. Run after the build ends: in `implement` before the self-review, in `implement-spec` after the worker reports.

Each gate is one review round on the ticket's r3 diff (`skill://r3-review`). A ticket can have either gate, both, or neither.

## Surface

The module layout, public function heads and types, persisted data shape, and cross-module contracts.

A **load-bearing surface** is the part of that surface worth a review gate, because changing it later is hard to reverse. The `before build` reasons that mark it are Migration, An outside contract and New structure. For a new module the load-bearing part is its layout and public heads; for a copied shape, the shape itself. Internal functions, types and private helpers inside an existing module are surface but not load-bearing: they go afk, and the review is offered at landing (`land` r3 review), not promised.

## Shape review

1. **Write the skeleton**: the reviewed load-bearing surface as real code in the real files, bodies not implemented. Every surface item the ticket names exists as a head, type, struct or schema. Use the stack pack's skeleton idiom (`rule://stack-<name>`) when one exists, else the language's own (`raise "not implemented"`, `throw new Error("not implemented")`, `todo!()`). Follow `CODING_STANDARDS.md`. The skeleton is not production behaviour: the build fills each body test-first through `skill://tdd`.
2. **Placement map**: a diagram of where the ticket's code goes, so the user can check the code lands in the right place before any body exists. Each box is a module, file or store the ticket adds, changes, reuses or removes; each arrow says who calls or writes whom. 9 boxes at most. Each box has a name, a path, and a status: NEW, CHANGED, REUSED, REMOVED or STORED, shown by text and line style, not colour alone. A NEW box carries one "Why new" line that names the existing thing it does not extend. A removed arrow is dashed. When the **Pages** rule calls for a page, a worker draws the map there; otherwise draw it as mermaid in chat when it has 3 or more boxes.
3. **Publish** the skeleton diff. The summary holds the ticket and its gate with its reason; one sentence on what the ticket makes true; 2 to 3 acceptance examples, given / when / then, one line each; and the map as a list of boxes.
4. **Threads**: the two review points that matter most, each with its evidence: right module or layer; reused what exists; domain terms match the glossary; scope still matches the ticket; contract change is intended; deletions are intended. Then 0 to 5 decisions in the decision form below. Each goes on the line it concerns.

**Decision form**: one line for the question, then 2 options (sometimes 3), named A, B, C, each with one reason line (when a person picks it, its main gain, its main cost), taken from the spec, the ADRs and the code, never invented. In a shape review the map and the evidence speak first, so hold your pick until the user answers; reveal it with its reason only after the user replies.

**Wait** for the round to end and every decision to have a choice; then the build starts. Each decision needs a reply that names an option. A bare "yes" with open decisions is not an answer, so ask which option. If the user archives with a decision open, ask it in chat before the build.

**Apply** each batch of answers as it lands, one action at a time:
1. Write an ADR (`domain-modeling` format) for each answer that fixes a hard-to-undo choice (load-bearing surface). The ADR goes in `docs/adr/` (fork: `.omp/docs/adr/`).
2. File one line per accepted review lesson. Read `skill://land/FILING.md` for the what-goes-where test. Write only the lines the user accepts.
3. Note a stack-generic convention seen in the review for stack-pack promotion.
4. Edit each later ticket that builds on the agreed surface (the ones this ticket blocks) on the tracker to match, so each stays self-contained. Only when a ticket exists.
5. Record each edit as a note (`land` step Notes).
6. Add one line to the ticket: `Shape review: design changed: yes (<what changed>)` or `Shape review: design changed: no change`. Only when a ticket exists.

**Done when** the answers are applied, each decision has a choice, and every later ticket that this one blocks (when the work has tickets) is edited on the tracker to match.

## See it run

Publish the built diff and post the running result in a thread: a screenshot or a short recording (`--attach`), or the output of a real command or test run when there is nothing to see. Add one line on what to react to: the flow, the feel, the output. Fix the real objections and post again.
