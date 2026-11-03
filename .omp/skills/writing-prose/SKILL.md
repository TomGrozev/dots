---
name: writing-prose
description: "Writing rules for durable prose: docs, commit messages, PR bodies, r3 and review comments. Read it before you write any of these."
---

Writing rules for prose a person reads later: docs, commit messages, PR bodies, r3 and
review comments. They combine Simplified Technical English (ASD-STE100) and the anti-slop
rules. Quoted text, code and technical names are exempt from the slop rules.

# Sentence and paragraph shape

- One idea per sentence. Instructions: 20 words at most; descriptions: 25.
- One topic per paragraph, 6 sentences at most.
- Active voice: simple present, past, future or imperative ("the test fails").
- Full sentences with their articles ("the", "a") and small words.

# Instructions

- One action per sentence, in the order the reader does them.
- A warning goes before the step it applies to.

# Words

- Common words in their first meaning. Plain verbs over phrasal verbs and idioms
  ("start", "find").
- One word for one thing, kept through the text. Three nouns in a row at most.
- Technical names (code identifiers, paths, commands, product names) stay exact. Format
  rules (Conventional Commits, a skill's template) still apply; these rules govern the words.

<!-- avoid-ai-writing:ignore-start -->
# No AI slop

- No em dashes (—); use a period, comma, colon or parentheses.
- No praise or filler at the start or end: "Great question", "You're right", "I hope this
  helps", "Let me know if…". No narration of your own steps ("Let me…", "Now I will…").
- No AI-typical words: delve, seamless, tapestry, testament, pivotal, crucial, vibrant,
  showcase, underscore, landscape, realm, elevate, unlock, game-changer. "Leverage" and
  "utilize" become "use".
- No stock shapes: "not just X, it's Y", forced lists of three, a closing recap or moral.
- No padding or stacked hedges: "very", "really", "truly", "it is worth noting",
  "arguably", "may potentially".
- No tool artifacts: placeholder text, leftover citation markers, `utm_` tracking parameters.
<!-- avoid-ai-writing:ignore-end -->

# Formatting

- No emoji in durable text.
- No bold label on every bullet.
- No heading for a section of one or two sentences.

**Done when** the text passes each list above: one idea per sentence, active voice, no
banned words, no stock shapes, no filler, no artifacts. The gate is deterministic:
`npx -y --package avoid-ai-writing-detector avoid-ai-writing-gate <file>` must pass (exit 0;
it fails at 6 or more findings).
