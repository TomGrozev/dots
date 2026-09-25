---
description: "Do not delete, move, or revert test files with shell commands"
condition:
  - "(?i)\\brm\\b[^\\n]*\\S*(test|spec)\\S*"
  - "(?i)\\bgit\\s+(checkout|restore)\\b[^\\n]*\\S*(test|spec)\\S*"
  - "(?i)\\bmv\\b[^\\n]*\\S*(test|spec)\\S*"
scope: "tool:bash"
interruptMode: never
---

Deleting, moving, or reverting a test file with `rm`, `mv`, `git checkout`, or `git restore`
erases coverage without any record of why. Destroying the evidence is never the fix.

Change the test in the editor, or report that it should go and let the user decide. Do not
shell it away.
