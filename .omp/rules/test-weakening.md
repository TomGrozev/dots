---
description: "Do not weaken tests: no skip, only, or ignore markers"
condition:
  - "\\.skip\\("
  - "\\.only\\("
  - "\\bxit\\("
  - "\\bxdescribe\\("
  - "\\bfit\\("
  - "\\bfdescribe\\("
  - "t\\.Skip\\("
  - "#\\[ignore\\]"
  - "@Ignore\\b"
scope: "tool:edit(*.test.*), tool:write(*.test.*), tool:edit(*.spec.*), tool:write(*.spec.*), tool:edit(*_test.go), tool:write(*_test.go), tool:edit(test_*.py), tool:write(test_*.py), tool:edit(*_test.py), tool:write(*_test.py), tool:edit(*Test.java), tool:write(*Test.java), tool:edit(*Tests.java), tool:write(*Tests.java)"
interruptMode: never
---

Skipping, focusing, or ignoring a test to make a change pass is a silent regression. A
failing test is a finding, not an obstacle.

Fix the code under test, or report the failure. Do not add `.skip`/`.only`, `xit`/`xdescribe`,
`fit`/`fdescribe`, `t.Skip`, `#[ignore]`, or `@Ignore` to get green. Removing a marker that
someone else added is fine.
