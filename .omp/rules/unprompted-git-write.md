---
description: "Never commit, push, tag, hard-reset, or open a PR/release without being asked"
condition:
  - "(?i)\\bgit\\s+(commit|push|tag|reset\\s+--hard)\\b"
  - "(?i)\\bgh\\s+(pr\\s+create|release\\s+create)\\b"
scope: "tool:bash"
interruptMode: never
---

Do not run git or GitHub commands that write or publish unless the user asked for exactly that
action. Committing, pushing, tagging, hard-resetting, and opening a PR or release are the
user's call, not the agent's.

Wait to be asked. If the work looks finished, report it and offer the landing options — the
user picks. A ticket being done is not permission to commit, push, or open a PR.
