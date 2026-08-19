# omp Agent Rules

One main agent; specialised work is pushed down into bounded subagents delegated via `task`.
Phase is expressed by which skill you invoke, not which agent you are.

## Delegate by default

The main agent owns interpretation, decomposition, architecture, tradeoffs, sequencing, and
synthesis. Delegate tightly scoped tactical work to the matching subagent below — do **not**
edit code inline when a subagent fits, even if the work is small. Do inline only single
trivial edits or read-only exploration that informs decomposition. Subagents start blank
with no conversation history; each brief carries the full slice requirements and the
decisions the worker would otherwise ask about.

## Agent roster

Seven bundled agents (used unmodified) plus one custom agent:

| Agent | Role | Writes? |
|---|---|---|
| `scout` | Fast read-only codebase research | No |
| `librarian` | External library/API research from source | No |
| `reviewer` | Pre-merge code review with cross-boundary analysis | No |
| `security-reviewer` | Source→sink vulnerability tracing | No |
| `designer` | UI/frontend implementation and review | Yes |
| `task` | General-purpose worker, full tools | Yes |
| `sonic` | Mechanical updates and data collection | Yes |
| `docs-writer` | `.md`/`.mdx` authoring only | `.md` only |

Steer models via `task.agentModelOverrides` in `config.yml`; never override bundled agent
definitions (an override is a whole-definition replacement, not a field merge).

## Routing policy

- **Frontend / UI** → `designer`.
- **Standalone or follow-up `.md`/`.mdx`** → `docs-writer`. (A code change that bundles a
  doc edit may keep that doc edit in the same worker brief.)
- **Codebase orientation / "where does X live"** → `scout`.
- **Unfamiliar library or API** → `librarian`.
- **Pre-merge review** (driven by the `/code-review` skill) → `reviewer`; add
  `security-reviewer` for auth/crypto/secret/permission surfaces.
- **Mechanical bulk edits / data collection** → `sonic`.
- **Everything else that writes code** → `task`.

## Brief format

Every delegation states:

1. **Goal** — one clear objective.
2. **Files/scope** — exact targets.
3. **Changes or question** — what to do or answer.
4. **Constraints** — what is forbidden.
5. **Verification/expected output** — how success is measured.

If a brief is incomplete or requires assumptions, the worker stops and reports the exact
missing input rather than guessing.

## Subagent isolation

`isolated: true` is a per-`task`-call argument, not a per-agent setting.

- **Pass it** for write-capable agents (`task`, `sonic`, `designer`, `docs-writer`) running
  in parallel or making substantial changes.
- **Skip it** for read-only agents — they gain nothing and pay setup cost.

## Codebase memory

The `codebase-memory-mcp` server auto-injects its own usage instructions at runtime; the
`codebase-memory` skill carries the query strategy. Do not duplicate either here.

- **No graph access:** `scout`, `librarian`, `reviewer`, `security-reviewer` — MCP tools are
  excluded by their tool allowlist.
- **Graph access:** main agent, `task`, `sonic`, `designer` — they receive everything.

Fall back to grep/glob for string literals, error messages, config values, non-code files,
or when graph coverage is partial/skipped/stale.

## Notes

- The `rtk` wrapper is applied automatically to bash commands; its shortened output is
  intended — assume it is correct.
