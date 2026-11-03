# Filing: what goes where

Every skill that proposes a line files it by this test:

- `GLOSSARY.md`: the domain's terms (the words).
- `docs/adr/`: a choice between real alternatives, with tradeoffs and why; hard to reverse. Architecture, library, data-model and protocol choices go here, never in `CODING_STANDARDS.md`.
- The spec's Implementation and Testing Decisions: per-feature decisions made for one spec, with its tickets. These do not go to ADRs or rule files. A hard-to-undo choice that outlives the feature becomes an ADR.
- `CODING_STANDARDS.md`: how code is written here, as one-line imperative rules a reviewer can check against a single diff hunk ("Return `{:error, reason}` tuples from context functions, never raise", "Put tests next to the module as `*_test.ts`"). Each rule names a code shape: naming, layout, error handling, API shape, data access, test style, logging. If the line needs a "because" paragraph or alternatives to make sense, it is an ADR; if a linter or formatter could enforce it, it is a guardrail instead.
- Nothing: one-off choices for a single ticket, facts about what was built, preferences already enforced by tooling, and anything a reviewer could not point at in a diff. Default to nothing when unsure.

In a fork, the paths sit under `.omp/`: `.omp/docs/adr/`, `.omp/CODING_STANDARDS.md`, and so on.

A stack-generic convention seen in a `land` review is noted for stack-pack promotion.
