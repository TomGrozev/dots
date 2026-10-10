---
description: "Elixir stack pack for the pairing workflow: skeleton idiom, idiomatic conventions, guardrail tools, default gate."
condition: ".*"
scope: "tool:edit(**/*.ex), tool:write(**/*.ex), tool:edit(**/*.exs), tool:write(**/*.exs)"
interruptMode: never
---

# Stack pack: Elixir

Rules true of any Elixir repo. Phoenix-specific rules live in `stack-phoenix`. Repo-specific rules live in `CODING_STANDARDS.md`, an onboarded repo is one where this file exists (see `skill://onboard`).

## Skeleton idiom

`@doc` sits directly above `@spec`. Stub each body as a `do ... end` block whose body is `raise "not implemented"`, so the real implementation drops straight in; unused args are prefixed `_`:

```elixir
defmodule MyApp.Accounts do
  @moduledoc "Accounts context: public API for users and profiles."

  alias MyApp.Accounts.Profile

  @doc """
  Updates a profile's bio.
  """
  @spec update_bio(user_id :: pos_integer(), bio :: String.t()) ::
          {:ok, Profile.t()} | {:error, Ecto.Changeset.t()}
  def update_bio(_user_id, _bio) do
    raise "not implemented"
  end
end
```

## Conventions

- Internal modules take `@moduledoc false` and internal functions `@doc false`; on public code keep `@doc` directly above `@spec`.
- Write a clause per input shape: pattern-match arguments and use guard clauses in the head rather than `if`/`cond` on argument values.
- Use `with` only for two or more dependent steps (a single `<-` clause is a `case`), and normalise each error in a private helper instead of a sprawling `else`.
- Fallible functions return `{:ok, value}` / `{:error, reason}`; add a `!` twin that raises, and test both.
- Assert what you expect (pattern-match, `Map.fetch!/2`, struct access) instead of spreading defensive `nil` checks.
- Pass options as a keyword list, never as a run of positional arguments.
- Model domain state with a struct or a tagged atom rather than a boolean or bare primitive threaded through arguments.
- Convert untrusted input with `String.to_existing_atom/1`; atoms are never created dynamically.
- Guard-safe checks use `is_` and `defguard`.
- Start a pipeline from a raw value and give each `|>` step one job, one step per line.
- Raise a readable error for programmer-error configuration and let it crash under supervision rather than rescuing to continue.
- Name modules and functions for the domain noun they handle, not `Helper`, `Utils`, `Manager`, or `Impl`.
- Organise code into modules and functions; reach for a process only for concurrency, state, or fault isolation, and put it under a supervisor.
- Test processes start under `start_supervised!/1`; observe them with `Process.monitor/1` + `assert_receive {:DOWN, …}`, not `Process.sleep/1`.
- Keep doctests for pure examples; leave side-effecting examples to the test files.

## Guardrail tools

- **Formatter**: `mix format --check-formatted`.
- **Linter**: Credo, `mix credo --strict`, config in `.credo.exs`; add custom checks with `use Credo.Check` when a repo rule needs enforcing.
- **Credo opt-ins**: disabled by default, so `--strict` ignores them; onboard proposes each per repo: `Credo.Check.Readability.Specs`, `Credo.Check.Readability.OnePipePerLine`, `Credo.Check.Readability.StrictModuleLayout`, `Credo.Check.Refactor.PipeChainStart`, `Credo.Check.Refactor.NegatedIsNil`, `Credo.Check.Refactor.ABCSize`, `Credo.Check.Warning.UnsafeToAtom`.
- **Compiler**: `mix compile --warnings-as-errors`.
- **Security**: `mix hex.audit` and `mix deps.audit` on every project; add `mix sobelow` when the app handles user input or auth (Phoenix/Plug).
- **Types**: Dialyxir, `mix dialyzer`, when the project declares it.
- **Docs**: `mix doctor --summary` reports `@moduledoc` / `@spec` coverage.
- **Boundary check** (optional, no dependency): `mix xref graph --format cycles --fail-above 0` fails on compile-time cycles between modules.

## Default gate

One repo-owned command, recorded in the agent file's `## Gate` section. Idiomatic Elixir default is a `mix precommit` alias:

```elixir
# mix.exs
defp aliases do
  [
    precommit: [
      "compile --warnings-as-errors",
      "deps.unlock --unused",
      "format",
      "credo --strict",
      "test"
    ]
  ]
end
```
