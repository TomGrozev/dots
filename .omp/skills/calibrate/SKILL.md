---
name: calibrate
description: "Measure a repo against the pairing workflow: classify rework commits, compute unexplained rework, surface convention drift, and propose enforcement tickets and stack-pack promotions. First run records the baseline; later runs compare."
disable-model-invocation: true
---

# Calibrate

Run only when the user asks, and never in a `fork` repo — nothing may persist there and the history isn't yours. It measures **unexplained rework** over time — the metric the pairing workflow (`skill://pair`) exists to drive down — and finds where the repo drifted from its conventions. It proposes; the user decides. Repo setup (conventions, guardrails, gate) is `skill://onboard`'s job, not this one's.

## Mode

The calibration log lives at the pairing context's `docs/agents/calibration.md` (see `skill://onboard`).

- Log absent → **Baseline**: classify the full history. In a `new` repo, run this only once there is history to classify.
- Present → **Re-run**: classify commits since the last recorded run.

## Steps

1. **Sync**: `git fetch`; analyse the up-to-date remote default branch (a stale clone silently truncates the picture).
2. **Classify rework** (Scout Brief Shape below), SHA evidence for every classification.
3. **Compute** unexplained rework (`skill://calibrate/REWORK-CLASSES.md`).
4. **Detect drift** (re-run, or baseline when `## Conventions` exists): violations of recorded conventions, the same thing done two ways, duplicated paths, dead code, and gate/lint rules disabled or loosened since the last run.
5. **Log**: create or append to the pairing context's `docs/agents/calibration.md` in the format from `skill://calibrate/REWORK-CLASSES.md`.
6. **Propose** a ticket menu: enforcement rules for conventions that keep being broken, cleanups, and stack-pack promotions that now meet the bar in `skill://onboard` (Stack Packs). If the repo has no `## Conventions`, the first menu item is running `onboard`. The user picks.

**Done when** the log is written and the menu is presented. Log changes follow the end-of-task flow in `skill://walkthrough`.

## Scout Brief Shape

When dispatching a `scout` for rework classification, the brief MUST require:
- **Classes**: read `skill://calibrate/REWORK-CLASSES.md` and use classes a–g verbatim, one primary per rework commit.
- **Tally table**: columns `SHA`, `Date`, `What`, `Class`, `Reworks` (earlier SHA, when identifiable), `Cites` (requirement/ticket/ADR it cites, or "none").
- **Aggregated counts**: per class, plus the unexplained-rework count.
- **Synthesis**: 3–5 sentences on the dominant rework patterns, with SHAs.
- **Evidence**: `[INFERENCE]` on any claim not directly observable in a commit or diff.
