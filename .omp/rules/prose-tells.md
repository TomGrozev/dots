---
description: "Durable text: drop em dashes and AI-tell words"
condition:
  - "—"
  - "(?i)\\bdelv(e|es|ed|ing)\\b"
  - "(?i)\\btapestry\\b"
  - "(?i)\\btestament\\b"
  - "(?i)\\bseamless(ly)?\\b"
  - "(?i)\\bgame[- ]changer\\b"
  - "(?i)\\bleverage(s|d|ing)?\\b"
  - "(?i)\\butiliz(e|es|ed|ing)\\b"
  - "(?i)\\bGreat question\\b"
  - "(?i)\\bI hope this helps\\b"
  - "(?i)\\bLet me know if\\b"
scope: tool
interruptMode: never
---

That word or dash is an AI tell in durable text. Chat replies are exempt. Before the turn ends,
fix it in what you just wrote: a file, a commit message, a PR body or an artifact. Use a period,
comma, colon or parentheses instead of a dash, and "use" instead of "leverage" or "utilize". Read
`skill://writing-prose` for the full list.
