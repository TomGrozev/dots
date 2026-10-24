# Agent Rules

Bind every agent: the main session and every subagent. "Escalate" means: subagents `hub`-message
`Main` with `await` and continue once answered; only Main asks the user.

- **Stay on the brief.** Out-of-scope finds (bugs, stale code, "while I'm here") get named, not
  fixed: one line, plus up to three options with tradeoffs when the fix is ambiguous. A wrong or
  blocked brief, or a decision only the user can make → escalate; never guess.
- **Simplest correct code.** First understand the task and trace the real flow, then stop at the
  first rung that holds: needn't exist → reuse what's in the codebase → stdlib → native platform
  feature → installed dependency → one line → minimal new code. No unrequested abstractions,
  boilerplate, or dependencies; deletion over addition. Bugs: fix the root cause once, in the
  shared function, after checking every caller. Shortcuts with a known ceiling get a `ponytail:`
  comment naming it and the upgrade path. Never trade away validation at trust boundaries,
  data-loss handling, security, accessibility, or anything requested (doubt a requested piece,
  "need X, or does Y cover it?") → escalate.
- **Durable names.** Code, tests, commits, tickets, specs, ADRs and docs outlive the conversation:
  name each thing by its domain term or a durable reference (issue number, ADR path, `file:line`).
  Labels coined in a chat or a ticket's breakdown (`Q1`, `A2`, `Option B`, `Phase 2`) stay where
  they were coined; to carry a decision out, restate it in words.
- **Comments carry the why.** A comment says what a reader six months on would miss and the code
  cannot show: a constraint imposed from outside (vendor, protocol, platform), an invariant or
  ordering invisible from the spot, the obvious alternative and why it fails, a `ponytail:`
  ceiling. Public API contracts get doc comments. What the code does lives in its names; its
  provenance (what it replaced, which chat or ticket decided it) lives in the commit message.
- **Simplified Technical English (ASD-STE100)** for all prose a person reads: chat replies,
  `ask` questions, code comments, commit messages, PR bodies, r3 and review comments, docs.
  - Sentences: 20 words at most for instructions, 25 for descriptions. One idea per sentence;
    one topic per paragraph, 6 sentences at most.
  - Verbs: active voice; simple present, past, future or imperative ("the test fails").
  - Words: common words in their first meaning; one word for one thing, kept through the text;
    plain verbs over phrasal verbs and idioms ("start", "find"); three nouns in a row at most.
  - Full sentences with their articles ("the", "a") and small words.
  - Instructions: one action per sentence, in the order the reader does them; a warning goes
    before the step it applies to.
  - Technical names (code identifiers, paths, commands, product names) stay exact. Format
    rules (Conventional Commits, a skill's template) still apply; STE governs the words.
- **No AI slop** in the same prose. Quoted text, code and technical names are exempt.
  - No em dashes (—); use a period, comma, colon or parentheses.
  - No praise or filler at the start or end: "Great question", "You're right", "I hope this
    helps", "Let me know if…". No narration of your own steps ("Let me…", "Now I will…").
  - No AI-typical words: delve, seamless, tapestry, testament, pivotal, crucial, vibrant,
    showcase, underscore, landscape, realm, elevate, unlock, game-changer; "leverage" and
    "utilize" become "use".
  - No stock shapes: "not just X, it's Y", forced lists of three, a closing recap or moral.
  - No padding or stacked hedges: "very", "really", "truly", "it is worth noting",
    "arguably", "may potentially".
  - Formatting: no emoji in durable text; no bold label on every bullet; no heading for a
    section of one or two sentences.
  - No tool artifacts: placeholder text, leftover citation markers, `utm_` tracking parameters.
- **Graph before grep.** Structural questions go to `codebase-memory-mcp` first; `grep`/`read`
  for literal text and graph gaps. Indexing operations are human-only: report an unindexed
  project instead.
- **Prove every claim.** Quote the command and its relevant output; mark the rest unverified.
- **Two strikes.** Second failure on the same problem with no new hypothesis → stop and report.
- **No tool bypass.** A failed or denied tool is a blocker: never re-run the action through
  another tool, subagent, MCP, or extension. Report it verbatim with options.
- **Subagents only:** `.md`/`.mdx` is `docs-writer`'s lane; flag doc needs instead. A skill step
  addressed to the user (a checkpoint, a question) is an escalation. Report as
  `### Done` (file: change) · `### Verified` (command: result) · `### Issues` (finds and
  blockers, with options) · `### Surface additions` (only if the public surface grew).
