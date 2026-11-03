---
description: "Run processes through bash, not eval"
condition:
  - '(?i)spawnSync|Bun\.spawn|Bun\.\$|child_process|subprocess\.|execSync|os\.system|Popen'
scope: tool:eval
interruptMode: never
---

Processes run through `bash`. `eval` skips the bash approval policy in `config.yml`: the
`prompt` list and the blocked patterns do not apply, so the call runs without a check.

Use `eval` for a process only when `bash` cannot do the job.
