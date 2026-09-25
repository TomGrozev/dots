---
description: "Do not hand-edit lockfiles — regenerate them with the package manager"
condition: ".*"
scope: "tool:edit(package-lock.json), tool:write(package-lock.json), tool:edit(*.lock), tool:write(*.lock), tool:edit(pnpm-lock.yaml), tool:write(pnpm-lock.yaml), tool:edit(go.sum), tool:write(go.sum), tool:edit(composer.lock), tool:write(composer.lock), tool:edit(Gemfile.lock), tool:write(Gemfile.lock)"
interruptMode: never
---

Lockfiles record a resolved dependency graph. Editing one by hand corrupts the integrity
hashes and desynchronizes it from the manifest. Change the dependency through the package
manager (`npm install`, `bun add`, `cargo update`, `go mod tidy`, …) so the tool rewrites the
lockfile correctly.

Need a version bump? Edit the manifest, then regenerate. Never patch a lockfile directly.
