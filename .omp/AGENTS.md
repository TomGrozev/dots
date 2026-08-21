# omp Agent Rules

One main agent; specialised work is pushed down into bounded subagents delegated via `task`.
Phase is expressed by which skill you invoke, not which agent you are.

## Delegate by default — the main agent does not investigate

The main agent owns interpretation, decomposition, architecture, tradeoffs, sequencing, and
synthesis. It does **not** gather its own evidence from the codebase or external sources.
That work goes to a subagent — always, even when it feels small or "just one quick read."

**Enforced:** the `delegate-enforce` extension removes investigation tools (`grep`, `glob`,
`web_search`, `gh_grep`, `context7`) from the MAIN session. When you need to know X, frame
it as a question and route it via `task`: `scout` for codebase research, `librarian` for
external docs/API research. You may still `read` a single known file for immediate
decomposition context and to verify/apply your own edits.

Delegate to `scout` the moment you would otherwise: read a second file; grep/glob for a
pattern, symbol, or error string; trace a call chain, data flow, or import graph; find
"where does X live" or "how does X work"; map conventions across a module; compare
implementations across files; orient in an unfamiliar area of the repo.

Delegate to `librarian` for external docs, source, or API reference for any library,
framework, or service — even one you partly know.

Delegate to `designer` when the work touches UI/frontend — do not prototype or tweak
frontend inline; hand it off with the surface and the constraint.

Subagents start blank with no conversation history; each brief carries the full slice
requirements and the decisions the worker would otherwise ask about. Synthesis, taste, and
the final call stay with the main agent; gathering and implementation get pushed out.

## Agent roster

Seven bundled agents (used unmodified) plus one custom agent:

| Agent               | Role                                               | Writes?    |
| ------------------- | -------------------------------------------------- | ---------- |
| `scout`             | Fast read-only codebase research                   | No         |
| `librarian`         | External library/API research from source          | No         |
| `reviewer`          | Pre-merge code review with cross-boundary analysis | No         |
| `security-reviewer` | Source→sink vulnerability tracing                   | No         |
| `designer`          | UI/frontend implementation and review               | Yes        |
| `task`              | General-purpose worker, full tools                 | Yes        |
| `sonic`             | Mechanical updates and data collection             | Yes        |
| `docs-writer`       | `.md`/`.mdx` authoring only                        | `.md` only |

Steer models via `task.agentModelOverrides` in `config.yml`; never override bundled agent
definitions (an override is a whole-definition replacement, not a field merge).

## Routing policy

- **Stand-alone or follow-up `.md`/`.mdx`** → `docs-writer`.
- **Pre-merge review** (driven by the `/code-review` skill) → `reviewer`; add
  `security-reviewer` for auth/crypto/secret/permission surfaces.
- **Mechanical bulk edits / data collection** → `sonic`.
- **Everything else that writes code** → `task`.

## Subagent isolation

`isolated: true` is a per-`task`-call argument. Pass it for write-capable agents running in
parallel or making substantial changes. Skip it for read-only agents.
