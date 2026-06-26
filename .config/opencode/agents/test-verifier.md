---
description: Test runner and build validator
mode: subagent
hidden: true
model: opencode-go/mimo-v2.5
permission:
  edit: deny
  bash:
    "*": ask
    # Elixir
    "*mix test*": allow
    "*mix compile*": allow
    "*mix format*": allow
    "*mix credo*": allow
    "*mix dialyzer*": allow
    "*mix deps.get*": allow
    "*mix deps.update*": allow
    # JavaScript
    "*npm test*": allow
    "*npm run test*": allow
    "*pnpm test*": allow
    "*pnpm run test*": allow
    "*yarn test*": allow
    "*npm run lint*": allow
    "*pnpm run lint*": allow
    "*yarn run lint*": allow
    "*npm run build*": allow
    "*pnpm run build*": allow
    "*yarn run build*": allow
    "*npm install*": allow
    "*npm ci*": allow
    "*pnpm install*": allow
    "*yarn install*": allow
    # Python
    "*pytest*": allow
    "*python -m pytest*": allow
    "*pip install*": allow
    "*pip3 install*": allow
    # Go
    "*go test*": allow
    "*go build*": allow
    "*go run*": allow
    # Rust
    "*cargo test*": allow
    "*cargo build*": allow
    "*cargo check*": allow
    # General build
    "*make*": allow
    "*cmake*": allow
    # Read-only helpers
    "*ls *": allow
    "*git status*": allow
    "*git diff*": allow
    "*git log*": allow
    "*git show*": allow
  task:
    "*": deny
---

# Test Verifier

Run tests, linters, and builds. Report pass/fail with relevant output.
