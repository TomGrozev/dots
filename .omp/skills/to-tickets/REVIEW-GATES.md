# Review gates

A ticket's review gates are the points where work pauses for the user to see and judge something before it continues. The agent writes the code and tests. The user decides, reviews, and tidies by hand.

## Format

A ticket lists its gates in a `## Review gates` section, as a table. No other form:

```
## Review gates

| Review gate | What you review | Reason |
|---|---|---|
| before build | How a saved chat keeps its model when the suite changes | Migration: the pin is stored per chat and hard to change later |
| after build | The model picker in the chat header | Taste: tests cannot judge how the picker feels |
```

`Review gate` is `before build` or `after build`; a ticket may carry both. `What you review` names the real thing, not generic text. `Reason` names the specific risk and matches a valid reason below.

## Valid reasons

For a `before build` gate:

- **Migration**: a change to data that already exists, i.e. a schema change or a persisted file, message or event format that existing records must migrate. New tables or fields that need no migration are not a reason.
- **An outside contract**: a public API endpoint, CLI flags or output, a published export, a webhook or event payload, an interface that code outside the module implements or calls.
- **New structure**: a new module or top-level directory, or the first instance of a shape that later tickets copy (a mistake multiplies in the copies).
- **Open design**: the spec leaves two or more materially different approaches, and tests cannot tell which one is right. The spec is the best place to make the choice; this reason catches what the spec missed.

For an `after build` gate:

- **Taste** that tests cannot judge: UI, feel, output, names the user sees.

For either kind:

- **The user asked** to oversee it.

Not reasons: "it creates new files", "is this the right place" alone, size, complexity, tests, bug fixes, signature changes inside an existing module. When a match is uncertain, recommend afk in the quiz.

## First instance of a shape

A ticket that is the first instance of a shape later tickets copy gets a `before build` gate with the reason **New structure**. Cut it into its own small hitl ticket, and make the afk tickets that copy it blocked by it. Their "What to build" says they follow that ticket's shape.
