---
description: Documentation review agent
mode: subagent
hidden: true
model: opencode-go/deepseek-v4-flash
permission:
  read: allow
  glob: allow
  grep: allow
  list: allow
  edit: deny
  bash: deny
  task:
    api-docs-researcher: allow
    "*": deny
---

# Docs Reviewer

Review documentation for accuracy, completeness, and clarity. Suggest improvements — never edit.
