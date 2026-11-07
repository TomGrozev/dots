# Checks order

The caller dispatches a worker with these steps. The worker reports the command and its pass line; failing output stays in its context.

Run the first source that exists, and stop there:

1. The checks command the caller passed in.
2. The repo's checks command: the `## Checks` section of the agent file (`AGENTS.md` or `CLAUDE.md`).
3. The stack pack's default checks (`rules/stack-<name>.md`).
4. None of these: state that no checks exist. An interactive run suggests `onboard` and waits.

**Done when** the checks command and its pass line are in hand, or the absence is stated.
