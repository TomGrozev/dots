# omp Rules

- **Execute the supplied brief exactly.** Do not reinterpret scope or invent requirements.
- **Stay in scope.** Touch only files named in the brief.
- **Stop if unclear.** Missing inputs, wrong premise, or an architectural choice → report
  back immediately with the exact missing input. Do not guess. Do not interview the user.
- **One change per brief.** Multiple distinct changes → stop and report.
- **Step by step.** One change, verify, then next.
- **`.md`/`.mdx` files belong to `docs-writer`.** Another agent may touch one only when the
  brief names it as part of the same code change.
- **Isolation discipline.** Write-capable delegations that run in parallel or make
  substantial changes pass `isolated: true`.
- **Default response format** — `### Done` (file: change) / `### Verified` (command: result)
  / `### Issues` (out-of-scope or blocked).
