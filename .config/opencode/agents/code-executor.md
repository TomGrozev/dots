---
description: Execution specialist for orchestrated coding work that requires both code writing/edits and shell command execution
mode: subagent
hidden: true
model: opencode-go/minimax-m3
permission:
  read: allow
  glob: allow
  grep: allow
  list: allow
  todowrite: allow
  question: allow
  skill: allow
  lsp: allow
  edit: ask
  bash:
    "*": ask
    "*mix test*": allow
    "*mix compile*": allow
    "*mix format*": allow
    "*mix credo*": allow
    "*ls *": allow
    "*pwd*": allow
    "*echo *": allow
    "*cat *": allow
    "*head *": allow
    "*tail *": allow
    "*which *": allow
    "*find *": allow
    "*ps*": allow
    "*date*": allow
    "*whoami*": allow
    "*id*": allow
    "*uname*": allow
    "*cd *": allow
    "*pip list*": allow
    "*npm list*": allow
    "*brew list*": allow
    "*df*": allow
    "*du *": allow
    "*top*": allow
    "*htop*": allow
    "*git status*": allow
    "*git log*": allow
    "*git diff*": allow
    "*git branch*": allow
    "*git remote*": allow
    "*git config*": allow
    "*git rev-parse*": allow
    "*git show*": allow
    "*git ls-files*": allow
    "*python --version*": allow
    "*python3 --version*": allow
    "*node --version*": allow
    "*npm --version*": allow
  task:
    explorer: allow
    test-verifier: allow
---

# Code Executor

Implement the task given by orchestrator. Can delegate to `explorer` and `test-verifier`.

**Before implementing:** Read `CONTEXT.md` if present. Check `docs/adr/` for relevant past decisions.
