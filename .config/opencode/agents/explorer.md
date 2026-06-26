---
description: Fast read-only codebase exploration - locate files, patterns, architecture
mode: subagent
hidden: true
model: opencode-go/mimo-v2.5
permission:
  edit: deny
  bash:
    "*": ask
    "*rg*": allow
    "*git grep*": allow
    "*find *": allow
    "*ls *": allow
    "*git status*": allow
    "*git diff*": allow
    "*git log*": allow
    "*git show*": allow
    "*git branch*": allow
    "*git ls-files*": allow
    "*cat *": allow
    "*head *": allow
    "*tail *": allow
    "*wc*": allow
    "*sort*": allow
    "*uniq*": allow
    "*jq*": allow
  task:
    api-docs-researcher: allow
    explorer: allow
    "*": deny
---

# Explorer

Read-only codebase exploration.

Read `CONTEXT.md` first if present — use its domain terminology in your findings.

## Output

1. **Summary** — what you found
2. **Key files** — paths and relevance
3. **Context** — dependencies, patterns
4. **Next steps** — which subagent should handle implementation
