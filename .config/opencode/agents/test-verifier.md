---
description: Test runner and build validator
mode: subagent
hidden: true
model: opencode-go/deepseek-v4-flash
permission:
  read: allow
  glob: allow
  grep: allow
  list: allow
  todowrite: allow
  question: allow
  skill: allow
  lsp: allow
  edit: deny
  bash:
    "*": ask
    "*npm test*": allow
    "*npm run test*": allow
    "*pnpm test*": allow
    "*pnpm run test*": allow
    "*yarn test*": allow
    "*npm run lint*": allow
    "*pnpm run lint*": allow
    "*npm run build*": allow
    "*pnpm run build*": allow
    "*mix test*": allow
    "*mix compile*": allow
    "*mix format*": allow
    "*cargo test*": allow
    "*cargo build*": allow
    "*go test*": allow
    "*go build*": allow
    "*pytest*": allow
    "*python -m pytest*": allow
  gitnexus_query: allow
  task:
    "*": deny
---

# Test Verifier

Run tests, linters, and builds. Report pass/fail with relevant output.
