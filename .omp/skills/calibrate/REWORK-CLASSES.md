# Rework Classes and Metric

A **rework commit** changes or removes code that an earlier commit landed — a fix, refactor,
revert, rename, move, cleanup, replacement, or a heavy edit to files created shortly before.
Brand-new features that touch nothing recent are not rework.

## Classes

Give each rework commit exactly one primary class (the cause, not the symptom), with the SHA
it reworks when identifiable:

- **a. Structure** — module/file structure or boundaries were wrong: splitting a monolith,
  moving logic between contexts, re-layering the same surface again. *e.g. splitting
  `BackendClient` into `StreamHandler`/`SSEParser`/`RequestContext`.*
- **b. Duplication** — duplicated code paths, the same thing done two ways, or dead code
  left behind. *e.g. merging three cold-store write paths behind one `persist_turn/1`;
  deleting unused components after a redesign.*
- **c. Requirements** — the feature itself was redone because the requirement changed or was
  learned. *e.g. per-request `SessionStore` → persistent `Conversation`.*
- **d. Bug** — it didn't work: a bug or missed edge case. *e.g. cache entry shape mismatch.*
- **e. UI churn** — visual/design rework in production code. Mark it **structural** when it
  reshapes components/LiveViews rather than styling. *e.g. table → card queue.*
- **f. Prototype replaced** — prototype/spike code promoted to production, then replaced.
  *e.g. ApexCharts spike → inline SVG.*
- **g. Other** — say what (tooling, deps, CI, toolchain drift).

## Target metric: unexplained rework

**Unexplained rework** = commits in **a**, **b**, and **structural e** that cite no new
- requirement, ticket, or ADR. This is what the pairing workflow exists to drive down: a shape
re-changed with no new decision behind it (ADRs written at surface changes count as a decision).

- **c** is learning, not failure: tallied, never counted in the metric.
- **d** is tracked separately: a rising bug count points at acceptance criteria/tests, not at
  shaping.
- Compare runs by the metric and by per-class counts relative to commits in the window
  (a 30-commit window and a 100-commit window are not comparable in raw counts).

## Log format (`docs/agents/calibration.md`)

One row per run, appended; a short synthesis paragraph under each run with SHA evidence.

| Date | Window (from..to) | Commits | a | b | c | d | e (struct) | f | g | Unexplained |
|---|---|---|---|---|---|---|---|---|---|---|
