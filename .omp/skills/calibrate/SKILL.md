---
name: calibrate
description: "Measure a repo against the agent workflow: classify rework commits, compute unexplained rework, surface convention drift, and propose enforcement tickets and stack-pack promotions. First run records the baseline; later runs compare."
disable-model-invocation: true
---

# Calibrate

Never in a `fork` repo: nothing may persist there and the history isn't yours. It measures **unexplained rework** over time (the metric the workflow exists to drive down) and finds where the repo drifted from its conventions. It proposes; the user decides.

## Run type

The calibration log lives at `docs/agents/calibration.md` (fork: `.omp/docs/agents/calibration.md`).

- Log absent → **Baseline**: classify the last 12 months or the last 500 commits, whichever is smaller. Record the window in the log. In a `new` repo, run the baseline only once there is history: at least 20 commits or one landed spec.
- Present → **Re-run**: classify commits since the last recorded run. When the last log row is less than 30 days old, say that a short window measures noise, and ask whether to go on.

## Steps

1. **Sync**: `git fetch`; analyse the up-to-date remote default branch (a stale clone silently truncates the picture).
    **Done when** the analysis runs on the freshly fetched remote default branch.
2. **Classify rework** (Scout Brief Shape below), SHA evidence for every classification.
    **Done when** the scout's tally table covers every commit in range, each row with its SHA.
3. **Compute** unexplained rework (read `skill://calibrate/REWORK-CLASSES.md`).
    **Done when** the unexplained-rework count is computed from the tally.
4. **Detect drift** (when `CODING_STANDARDS.md` exists; otherwise state "skipped, not onboarded"): violations of recorded conventions, the same thing done two ways, duplicated paths, dead code, and gate/lint rules disabled or loosened since the last run.
    **Done when** each drift finding is listed with `file:line`, or "none" is stated.
5. **Log**: create or append to `docs/agents/calibration.md` in the format from `skill://calibrate/REWORK-CLASSES.md`.
    **Done when** the entry is written to `docs/agents/calibration.md`.
6. **Propose** a ticket menu: enforcement rules for conventions that keep being broken, cleanups, and stack-pack promotions (promote when 3+ stack-generic conventions recur across 2+ repos of that stack; repo-specific conventions stay out of packs). Sort each proposal by how it gets enforced: a **mechanical violation** (a fixed syntactic pattern, a banned API, an import shape, a file location) becomes an automated check wired into the checks; a **judgement call** becomes one line in `CODING_STANDARDS.md` for reviewers to enforce. If the repo is not onboarded (`CODING_STANDARDS.md` is missing), the first menu item is running `onboard`. The user picks.
    **Done when** the ticket menu is presented.

**Done when** the log is written and the menu is presented. Log changes are work with no ticket; `land` lands them as hitl (read `skill://land`).

## Scout Brief Shape

When dispatching a `scout` for rework classification, the brief MUST require:
- **Classes**: read `skill://calibrate/REWORK-CLASSES.md` and use classes a–g verbatim, one primary per rework commit.
- **Tally table**: columns `SHA`, `Date`, `What`, `Class`, `Reworks` (earlier SHA, when identifiable), `Cites` (requirement/ticket/ADR it cites, or "none").
- **Gates**: read the tickets closed in the window. Count the review gates on them, and how many carry a gate-change line that says the design changed (`Shape review: design changed: yes …`). Report the counts as `Gates changed / total`.
- **Aggregated counts**: per class, plus the unexplained-rework count.
- **Synthesis**: 3–5 sentences on the dominant rework patterns, with SHAs.
- **Evidence**: `[INFERENCE]` on any claim not directly observable in a commit or diff.

Page: when the user asks for one, the page shows the rework trend over time (per-class counts across runs).
