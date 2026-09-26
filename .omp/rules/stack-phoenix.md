---
description: "Phoenix stack pack for the pairing workflow: contexts as the boundary, the web layer and Ecto, LiveView/HEEx, Phoenix gate."
condition: ".*"
scope: "tool:edit(**/lib/*_web/**), tool:write(**/lib/*_web/**), tool:edit(**/*.heex), tool:write(**/*.heex), tool:edit(**/*_live.ex), tool:write(**/*_live.ex)"
interruptMode: never
---

# Stack pack: Phoenix

Rules for Phoenix apps and libraries with a Phoenix web layer. Generic Elixir rules live in `stack-elixir`; repo-specific rules in the repo's pairing context `## Conventions`.

## Contexts are the boundary

- A context module (`MyApp.Accounts`) and its public functions are the cross-module contract; its internal modules (`MyApp.Accounts.*`) are private unless exported.
- The web layer (`MyAppWeb`) calls context functions, never `Repo` or a context's internal modules.
- In the web layer, `Ecto.Changeset` is the only Ecto module used; keep `import Ecto.Query`, schemas, and `Repo` inside contexts.
- Ecto schemas and migrations are persisted data shape — a hard stop. PubSub message structs, behaviours, and protocols are contracts.
- One context per domain area, named for the noun (`Accounts`, `Billing`); its schema's `changeset/2` stays `@doc false`, and its public functions return tagged tuples.

## Conventions

- Begin LiveView templates with `<Layouts.app flash={@flash}>`; use `<.icon>` and the imported `<.input>` from `core_components.ex`, keeping `<.flash_group>` inside `layouts.ex`.
- Use `<%= %>` in tag bodies and `{...}` in attributes; build `class` as a list.
- Build forms with `to_form/2` and `<.form for={@form}>`; read fields via `@form[:field]` and changesets via `Ecto.Changeset.get_field/2`, never struct access.
- Render collections with LiveView streams (`@streams.x` + `phx-update="stream"`).
- Put shared markup in function components under `*_web/components/`; reach for a LiveComponent only for real stateful reuse.
- Use a colocated JS hook (`:type={Phoenix.LiveView.ColocatedHook}`) instead of a raw `<script>` in HEEx.
- Preload associations in the query when a template reads them; exclude fields set programmatically from `cast/3`; generate migrations with `mix ecto.gen.migration`.
- LiveView tests assert on element IDs (`element/2`, `has_element/2`) rather than raw HTML strings.
- Generated LiveViews and pages follow the `phx.gen` layout; keep it rather than hand-rolling structure.
- Function components declare `attr`/`slot` blocks above the function, with `attr :rest, :global` and `doc:` strings.
- LiveView pages define `render/1` before `mount/3`, and every callback carries `@impl Phoenix.LiveView`.
- Drive LiveViews in tests with `live/2` and `render_click/2` / `render_submit/3`; integration tests use `async: false`, pure component tests `async: true`.
- Fetch outbound HTTP with `Req` (`:req`), which ships with Phoenix.
- `phx.gen.auth` auth lives at the router level; the assign is `@current_scope`, never `@current_user`.

## Guardrail tools

- **Templates**: `mix format --check-formatted` covers HEEx once `Phoenix.LiveView.HTMLFormatter` is a `.formatter.exs` plugin (Phoenix 1.8 generates this).

## Default gate

Phoenix 1.8 generates a `precommit` alias (`compile --warnings-as-errors`, `deps.unlock --unused`, `format`, `test`); extend it with `credo --strict` as in `stack-elixir`, and name it as the repo's `## Gate` (`skill://onboard`).
