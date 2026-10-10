---
description: "Do not edit generated build output: change the source and regenerate"
condition: ".*"
scope: "tool:edit(dist/**), tool:write(dist/**), tool:edit(build/**), tool:write(build/**), tool:edit(target/**), tool:write(target/**), tool:edit(.next/**), tool:write(.next/**), tool:edit(**/__snapshots__/**), tool:write(**/__snapshots__/**), tool:edit(*.generated.*), tool:write(*.generated.*), tool:edit(*.pb.go), tool:write(*.pb.go)"
interruptMode: never
---

Build directories, snapshots, protobuf output, and `*.generated.*` files are produced by a
tool, not written by hand. Edit them and the next build overwrites the change.

Change the source or the generator and re-run it. If a snapshot is wrong, fix the code under
test and regenerate the snapshot: do not hand-patch the `.snap` file.
