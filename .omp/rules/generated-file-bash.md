---
description: "Do not write generated build output, lockfiles or snapshots from bash: change the source and regenerate"
condition: '(?i)(\bsed\s+(?:-i|--in-place)|>>?|\btee\b|\bcp\b|\bmv\b)[^;&|]*(?:\s|/)((?:dist|build|target|_build|deps|\.next|__snapshots__)/|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lock|go\.sum|mix\.lock|Cargo\.lock)'
scope: tool:bash
interruptMode: never
---

A shell write into a build directory, a lockfile or a test snapshot is overwritten by the next
tool run. `sed -i`, a redirect, `tee`, `cp` and `mv` all count as a write.

Regenerate lockfiles with the package manager (`npm install`, `cargo update`, `go mod tidy`, …)
and snapshots with the test runner. Change the source or the generator and re-run it.
