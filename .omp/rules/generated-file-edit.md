---
description: "Do not edit generated build output: change the source and regenerate"
condition: ".*"
scope: "tool:edit(dist/**), tool:write(dist/**), tool:ast_edit(dist/**), tool:edit(build/**), tool:write(build/**), tool:ast_edit(build/**), tool:edit(target/**), tool:write(target/**), tool:ast_edit(target/**), tool:edit(_build/**), tool:write(_build/**), tool:ast_edit(_build/**), tool:edit(deps/**), tool:write(deps/**), tool:ast_edit(deps/**), tool:edit(.next/**), tool:write(.next/**), tool:ast_edit(.next/**), tool:edit(*.generated.*), tool:write(*.generated.*), tool:ast_edit(*.generated.*), tool:edit(*.pb.go), tool:write(*.pb.go), tool:ast_edit(*.pb.go)"
interruptMode: never
---

Build directories, protobuf output, and `*.generated.*` files are produced by a tool, not
written by hand. Edit them and the next build overwrites the change.

Change the source or the generator and re-run it.
