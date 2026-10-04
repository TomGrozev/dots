---
description: "TypeScript stack pack for the pairing workflow: skeleton idiom, public surface, idiomatic conventions, guardrail tools, default gate."
condition: ".*"
scope: "tool:edit(**/*.ts), tool:write(**/*.ts), tool:edit(**/*.tsx), tool:write(**/*.tsx), tool:edit(**/*.mts), tool:write(**/*.mts), tool:edit(**/*.cts), tool:write(**/*.cts)"
interruptMode: never
---

# Stack pack: TypeScript

Rules true of any TypeScript repo. Framework- and runtime-specific rules belong in their own `stack-<name>` pack when one is added; repo-specific rules live in `docs/agents/conventions.md` — an onboarded repo is one where this file exists (see `skill://onboard`).

## Skeleton idiom

JSDoc sits directly above the signature. Stub each body with `throw new Error("not implemented")`, typed and exported exactly as the real implementation will be, so it drops straight in; unused args are prefixed `_`:

```ts
/**
 * Updates a profile's bio. Returns a discriminated result:
 * `{ ok: true, profile }` on success, `{ ok: false, error }` on failure.
 */
export async function updateBio(
  _userId: number,
  _bio: string,
): Promise<{ ok: true; profile: Profile } | { ok: false; error: string }> {
  throw new Error("not implemented");
}
```

## Public surface

- The `exports` map in `package.json` is the cross-module contract (it supersedes `main` as the entry gate); deep imports a consumer can reach are the surface, everything else is private.
- Avoid barrel-re-export through folder `index.ts` files except at the package entry: each re-export inflates the module graph and slows bundling, linting and tests.
- A module's exported functions and types are its API: a signature change is a surface change that stops for the user; internal modules stay unexported.
- Types are part of the surface: `import type` at the boundary, and a public type change (a `types` entry, a discriminated-union variant) is a breaking change.

## Conventions

- Use `import type` / inline `type` modifiers for type-only imports — with `verbatimModuleSyntax`, what you see is what gets emitted, so the distinction is mandatory, not cosmetic.
- Give a real type, or use `unknown` at a boundary and narrow it; avoid `any`. `as` casts and `!` non-null assertions are last resorts with a written reason.
- Runtime-validate untrusted input at the trust boundary (HTTP body, env var, file, storage) with a zod/valibot schema before it becomes a typed value; avoid casting it in.
- Model domain state as a discriminated union on a `kind`/`type` tag, instead of boolean flags or stringly-typed literals; narrow by checking the tag.
- Make switches over unions exhaustive: a default case that assigns to `never` turns a new union member into a compile error, not a silent bug.
- Prefer `satisfies` over `as` when checking a value against a type without changing its inferred shape.
- Handle errors explicitly: `catch (err)` binds `unknown`; check `err instanceof Error` before reading fields. Return a tagged `{ ok, value | error }` across module boundaries for expected failures; throw only for programmer errors.
- Use async/await; every fallible function returns a `Promise`. Avoid swallowing rejections or catch-and-ignore.
- Prefer `Readonly<T>`, `readonly` parameters, and `as const` for configuration so nothing mutable leaks.
- Prefer named exports over a default export; one domain concern per module, named for the noun it handles — not `Helper`, `Utils`, `Manager`, or `Impl`.
- Prefer functions over classes; a class earns its place only by holding identity or state (e.g. a service with a lifecycle).
- Pass options as a single object argument, instead of a run of positional booleans/strings.
- `node:`-prefixed imports and `process.env` are runtime-specific: validate env once at startup and fail fast. Framework specifics (React, Next, Bun) belong in their own stack pack when one is added.
- Test both arms of a fallible function (ok and error) and the `unknown`-to-typed narrowing at each trust boundary.

## Guardrail tools

- **Typechecker**: `tsc --noEmit`. Start from `@tsconfig/strictest` (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`) and add `verbatimModuleSyntax` + `isolatedModules`.
- **Formatter**: Prettier, `prettier --check`, config in `prettier.json` (default for most generators); or Biome, `biome format`.
- **Linter**: typescript-eslint with `recommendedTypeChecked` + `stylisticTypeChecked`, enabled via `parserOptions.projectService` for typed linting; upgrade to `strictTypeChecked` for `no-unsafe-*`. Speed-first alternatives: Biome `biome lint`, or oxlint (Rust, type-aware via tsgo).
- **Security**: `npm audit` (or `pnpm audit` / `bun audit`) on every project.
- **Test**: Vitest, `vitest run`, by default (Vite-powered, TS/TSX and coverage); `node:test` for zero-dep Node libraries; `bun test` for Bun runtime.
- **Boundary check** (optional, no dependency): `npx dependency-cruiser --init`, then `depcruise` fails on cycles and rule violations; in an Nx monorepo use `@nx/enforce-module-boundaries`.

## Default gate

One repo-owned command, recorded in `docs/agents/gate.md`. Idiomatic TypeScript default is a `precommit` script:

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run",
    "precommit": "npm run typecheck && npm run lint && npm test"
  }
}
```
