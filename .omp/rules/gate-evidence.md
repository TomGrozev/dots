---
description: "Claims that tests, the gate, or checks pass must show the command and its output"
condition:
  - "(?i)\\b(tests?|gate|suite|checks?|lint|credo|build)\\b[^\\n]{0,40}\\b(pass(es|ed|ing)?|green|succeed(s|ed)?|clean)\\b"
question: "Does the reply claim that tests, a gate, lint, or a build passed without showing the command that was run and its output (or a tool result in this turn proving it)?"
scope: text
---

You claimed a check passed without evidence. Paste the exact command and the tail of its output (the pass/fail summary line), or say plainly that it was not run. "Tests pass" without output does not count as verification, and never make a check pass by skipping, deleting, or weakening tests or lint rules.
