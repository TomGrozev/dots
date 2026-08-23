---
description: How and when to use codebase-memory-mcp's knowledge graph instead of reading files one by one or grepping blind — decision matrix, workflows, evidence tiers, tool reference.
---

# Codebase memory — knowledge graph tools

Graph tools return precise structural results in ~500 tokens vs ~80K for grep. Prefer them
for structure, callers, and architecture; fall back to `read`/`grep` for literal text,
non-code content, or gaps the graph doesn't cover.

If your tool list has no `mcp__codebase_memory_mcp_*` entries, this doesn't apply to you —
work from the evidence you were given plus `read`/`grep`.

## Decision matrix

| Question              | Tool call                                          |
| ---------------------- | --------------------------------------------------- |
| Who calls X?           | `trace_path(direction="inbound")`                    |
| What does X call?      | `trace_path(direction="outbound")`                   |
| Full call context      | `trace_path(direction="both")`                       |
| Find by name pattern   | `search_graph(name_pattern="...")`                   |
| Dead code               | `search_graph(max_degree=0, exclude_entry_points=true)` |
| Cross-service edges     | `query_graph` with Cypher                            |
| Impact of local changes | `detect_changes()`                                   |
| Risk-classified trace   | `trace_path(risk_labels=true)`                       |
| Text search             | `search_code` or `grep`                              |

## Exploration workflow

1. `list_projects` — confirm the project is indexed (don't index it yourself; see RULES.md).
2. `get_graph_schema` — understand node/edge types.
3. `search_graph(label="Function", name_pattern=".*Pattern.*")` — find code.
4. `get_code_snippet(qualified_name="project.path.FuncName")` — read source.

## Tracing workflow

1. `search_graph(name_pattern=".*FuncName.*")` — discover the exact name.
2. `trace_path(function_name="FuncName", direction="both", depth=3)` — trace it.
3. `detect_changes()` — map a git diff to affected symbols.

## Evidence tiers

- **Scout (quick, provisional):** a few graph calls plus targeted source checks. Never make
  absence, exhaustive, dead-code, or complete-impact claims from this tier.
- **Verify (default):** task-directed searches, the relevant trace directions, exact snippets
  for material claims, and all relevant result pages.
- **Auditor (exhaustive):** bounded-scope full verification — current graph generation,
  complete pagination, both call directions, plus explicit unresolved limitations.
- **Every tier:** once candidate paths are known, call `check_index_coverage` with every
  evidence path (add the relevant scopes too for negative/exhaustive claims). A clean result
  means no recorded gap, not proof of completeness — for partial, skipped, excluded, stale,
  pending, or unknown coverage, read/grep the reported ranges instead of trusting the graph.

## Quality analysis

- Dead code: `search_graph(max_degree=0, exclude_entry_points=true)`
- High fan-out: `search_graph(min_degree=10, relationship="CALLS", direction="outbound")`
- High fan-in: `search_graph(min_degree=10, relationship="CALLS", direction="inbound")`

## Tool reference

`index_repository`, `index_status`, `list_projects`, `delete_project`, `search_graph`,
`search_code`, `trace_path`, `detect_changes`, `query_graph`, `get_graph_schema`,
`get_code_snippet`, `get_architecture`, `check_index_coverage`, `manage_adr`, `ingest_traces`.

## Edge types

`CALLS`, `HTTP_CALLS`, `ASYNC_CALLS`, `DATA_FLOWS`, `IMPORTS`, `DEFINES`, `DEFINES_METHOD`,
`HANDLES`, `IMPLEMENTS`, `OVERRIDE`, `USAGE`, `CALL_REFERENCE`, `CONFIGURES`,
`FILE_CHANGES_WITH`, `SIMILAR_TO`, `SEMANTICALLY_RELATED`, `CONTAINS_FILE`,
`CONTAINS_FOLDER`, `CONTAINS_PACKAGE`.

## Cypher examples (for `query_graph`)

```
MATCH (a)-[r:HTTP_CALLS]->(b) RETURN a.name, b.name, r.url_path, r.confidence LIMIT 20
MATCH (f:Function) WHERE f.name =~ '.*Handler.*' RETURN f.name, f.file_path
MATCH (a)-[r:CALLS]->(b) WHERE a.name = 'main' RETURN b.name
```

## Gotchas

1. `search_graph(relationship="HTTP_CALLS")` filters nodes by degree — use `query_graph` with
   Cypher to see actual edges.
2. `query_graph` has a 100k row ceiling — add a Cypher `LIMIT` for broad queries, or use
   `search_graph` pagination.
3. `trace_path` needs exact names — run `search_graph(name_pattern=...)` first.
4. `direction="outbound"` misses cross-service callers — use `direction="both"`.
5. `search_graph` results default to 50 per page — check `has_more` and use `offset`.
