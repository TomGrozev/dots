# Implement: the hitl stops

Read by `implement`: the stop for each trigger on a hitl ticket, and § Take the pen in any mode. The mode rule lives in `to-tickets` § Human tasks and mode.

## Triggers

A ticket is hitl only when at least one trigger applies. Size, complexity, tests, bug fixes, and signature changes inside an existing module are not triggers.

| Trigger | Applies when | Stop |
|---|---|---|
| `structure` | A new module, top-level directory, or new kind of thing a shape later code will copy, or code placed across a module boundary with no existing example | Shape review, before build |
| `surface` | New or changed load-bearing surface (implement § Surface): stored data or an outside contract | Shape review, before build |
| `decision` | A product or behaviour choice the spec did not settle and the agent would guess | Settle in the `to-tickets` quiz when possible; else shape review |
| `see-it-run` | UI, feel, or output the human must react to | After build, before land: the running result |
| `one-way-door` | Deploy, migration on real data, sent messages, paid or other irreversible outside action | Go or no-go, immediately before the action |

## Ticket fields

Directly under `**Mode:** hitl`, one line per trigger:

    **Human:** structure: Is ConversationPin the right place, and should it be new?

Format: `**Human:** <trigger>: <specific question for this ticket>`. The question names the real thing, not the generic text. A hitl ticket with no `**Human:**` line is invalid: stop and ask the user to add the lines. An afk ticket has no `**Human:**` line.

## Shape review

For the triggers `structure`, `surface`, and `decision` (ad-hoc work: the triggers the user named in the `ask`). A ticket whose only trigger is `decision` skips the skeleton and the map: its page has the header, the intent, and the decisions, and it runs the same gate (step 4).

1. **Write** the load-bearing surface (implement § Surface) as real code in the real files, bodies not implemented. Use the stack pack's skeleton idiom (`rule://stack-<name>`) when one exists, else the language's own (`raise "not implemented"`, `throw new Error("not implemented")`, `todo!()`). Follow `CODING_STANDARDS.md`. Every surface item the ticket names exists as a head, type, struct or schema.
2. **Publish one r3 page** (commands: `skill://publish-artifacts-to-r3`), one screen, with these sections in this order. Send the content brief to one `designer` subagent, which builds and publishes the page and returns the artifact id (how to write the brief and how the page is drawn: `implement/PLACEMENT-MAP.md`):
   1. **Header**: ticket id, trigger names, and each `**Human:**` question.
   2. **Intent**: one sentence of what the ticket makes true, plus 2 to 3 acceptance examples in plain words (given / when / then, one line each).
   3. **Placement map**: a diagram of at most 9 boxes. Each box is NEW, CHANGED, REUSED, REMOVED, or STORED (stored data), shown by text and line style, not colour alone. Each NEW box carries one line, "Why new: ...", naming the existing thing it does not extend. How to draw the map: `implement/PLACEMENT-MAP.md`.
   4. **Checks**: two checks picked from this pool to match the trigger, not the same two every time: right module or layer; reused what exists; domain terms match the glossary; scope still matches the ticket; contract change is intended; deletions are intended.
   5. **Decisions**: 1 to 5, each with named options (A, B, ...). Every option carries one reasoning line: when and why a person would pick it, its main gain and its main cost. Take it from the spec, the ADRs, and the code; never invent it. The reasoning is always shown, also when the pick is hidden; it is not a recommendation. Pick visibility: when any trigger on the page hides its pick (`structure`, `one-way-door`), every pick on the page is hidden until the human answers, then the agent replies with its pick and reason; for the other triggers, the pick is shown in small muted text.
   6. **Skeleton diff link**: optional. The skeleton is no longer the main artifact.

   Layout: the first screen holds the header, the intent, and the map; the checks and decisions follow below it.
3. **Limits**: more than 9 boxes or more than 5 decisions means the ticket is too big: split it into tickets that each fit, instead of publishing.
4. **Gate**: publish, then wait (`r3 watch <artifact>` reports new comments; `r3 show <artifact>` re-reads them; commands: `skill://publish-artifacts-to-r3`). The build does not continue until every decision has an answer comment naming one option letter. r3 cannot require answers and archive is not approval, so the skill enforces the gate. An archive with open decisions does not continue the build: the agent asks in chat for the missing answers. A bare "yes" with no option letter is not an answer: ask on the thread which option.
5. **Apply the answers**: build to the chosen options. For each review comment, propose what it teaches as one line, filed by kind (onboard § What goes where); write only the lines the user accepts.
6. **Update later tickets**: when the agreed surface differs from what later tickets (the ones this ticket blocks) assume, edit them on the tracker so each stays self-contained and correct, and record each edit as a note (`land` § Notes).

## See it run

For `see-it-run`, after the build and before `land`: show the running result, not a plan. A screenshot, a short recording, or a real command's output, published to r3 (`skill://publish-artifacts-to-r3`) or pasted in chat when the output is small. Name what to react to: the flow, the feel, the output. Wait for the human's reaction; fix the real objections and show again.

## One-way-door

For `one-way-door`, stop immediately before the irreversible action: the deploy command, the migration on real data, the send. Show exactly what will run, what it touches, and whether and how it can be undone. Ask go or no-go, with the agent's pick and reason. The pick is hidden until the human answers, then the agent replies with it (same rule as `structure` in § Shape review). Proceed only on a clear "go"; silence, or an archive with no answer, is no-go.

## Take the pen
On demand, any mode: a build worker reported a second failure on the same problem with no new hypothesis. Hand the user the repro and the hypotheses ruled out, and ask whether they take the pen or give a steer. If they take it, wait for "done"; if they steer, resume with the steer.
