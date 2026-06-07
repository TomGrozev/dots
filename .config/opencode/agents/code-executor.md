---
description: Execution specialist for orchestrated coding work that requires both code writing/edits and shell command execution
mode: subagent
hidden: true
model: opencode-go/mimo-v2.5-pro
permission:
  edit: ask
  write: ask
  bash:
    "mix test": allow
    "mix test *": allow
    "mix compile": allow
    "mix compile *": allow
    "mix format *": allow
    "ls *": allow
    "pwd*": allow
    "echo *": allow
    "cat *": allow
    "head *": allow
    "tail *": allow
    "which *": allow
    "find *": allow
    "ps*": allow
    "date*": allow
    "whoami*": allow
    "id*": allow
    "uname*": allow
    "cd *": allow
    "pip list*": allow
    "npm list*": allow
    "brew list*": allow
    "df*": allow
    "du *": allow
    "top*": allow
    "htop*": allow
    "git status*": allow
    "git log*": allow
    "git diff*": allow
    "git branch*": allow
    "git remote*": allow
    "git config*": allow
    "git rev-parse*": allow
    "git show*": allow
    "git ls-files*": allow
    "python --version*": allow
    "python3 --version*": allow
    "node --version*": allow
    "npm --version*": allow
    "git add*": ask
    "git commit*": ask
    "git push*": ask
    "git pull*": ask
    "git fetch*": ask
    "git merge*": ask
    "git rebase*": ask
    "git reset*": ask
    "git checkout*": ask
    "git clone*": ask
    "rm*": ask
    "mv*": ask
    "cp*": ask
    "mkdir*": ask
    "touch*": ask
    "chmod*": ask
    "chown*": ask
    "kill*": ask
    "pkill*": ask
    "curl*": ask
    "wget*": ask
    "ssh*": ask
    "scp*": ask
    "rsync*": ask
    "docker*": ask
    "kubectl*": ask
    "pip install*": ask
    "npm install*": ask
    "npm run*": ask
    "brew install*": ask
    "make*": ask
    "cmake*": ask
    "cargo*": ask
    "go build*": ask
    "go run*": ask
    "python*": ask
    "python3*": ask
    "node*": ask
    "*": ask
  task:
    explorer: allow
    test-verifier: allow
---

# Code Executor

Implement the task given by orchestrator. Can delegate to `explorer` and `test-verifier`.

**Before implementing:** Read `CONTEXT.md` if present. Check `docs/adr/` for relevant past decisions.
