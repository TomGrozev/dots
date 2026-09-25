---
description: "Don't route a failed or denied shell action through eval process spawns"
condition:
  - '(?i)spawnSync|Bun\.spawn|Bun\.\$|child_process|subprocess\.|execSync|os\.system|Popen'
scope: tool:eval
---
You are spawning a process from `eval`. If this re-runs something `bash` refused or failed on, stop: that is a tool bypass, not a fix. Report the failure verbatim in 1–2 sentences, offer up to 3 paths with tradeoffs, and wait. If `bash` is working and you just want a binary, use `bash`.
