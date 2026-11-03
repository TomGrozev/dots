---
description: How and when to use codebase-memory-mcp's knowledge graph instead of reading files one by one or grepping blind (decision matrix, gotchas).
---

# Codebase memory: knowledge graph tools

If your tool list has no `mcp__codebase_memory_mcp_*` entries, this doesn't apply to you:
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

## Coverage caveat

Before you cite a path, call `check_index_coverage` on it. A clean result is not proof of
completeness: if it reports a gap, read or grep that range yourself.

## Gotchas

1. `search_graph(relationship="HTTP_CALLS")` filters nodes by degree: use `query_graph` with
   Cypher to see actual edges.
2. `query_graph` has a 100k row ceiling: add a Cypher `LIMIT` for broad queries, or use
   `search_graph` pagination.
3. `trace_path` needs exact names: run `search_graph(name_pattern=...)` first.
4. `direction="outbound"` misses cross-service callers: use `direction="both"`.
5. `search_graph` results default to 50 per page: check `has_more` and use `offset`.
