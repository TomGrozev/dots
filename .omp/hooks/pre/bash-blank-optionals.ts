// Bash-Blank-Optionals — stop materialized empty/default bash arguments from
// selecting service mode (and so failing the call).
//
// Some provider tool-call layers emit every optional field, spelling "not set"
// as "" / null / a default:
//
//   { "command": "git fetch -q origin main", "timeout": 120, "cwd": "/repo",
//     "pty": false, "async": false, "name": "",
//     "ready": { "log": "", "port": 1, "host": "", "timeout": 1 }, "env": {} }
//
// BashTool selects service mode with `name !== undefined` (omp 18.3.0 and
// 18.3.1), so a blank name enters the service branch and the guard below it
// throws
//   "Service mode does not accept async or timeout; use ready.timeout for readiness."
// while a name-less call carrying `ready`/`env` throws
//   "ready and env require a service name."
// Either way the call dies before the command runs (oh-my-pi#13182). This is the
// documented stopgap for anyone stuck on 18.3.x until the upstream fix lands —
// delete it once PR #13186 ships.
//
// It rewrites the arguments before BashTool sees them, mirroring #13186's
// normalization: a blank/whitespace `name` is absent, only literal `async: true`
// requests an async job, a `null` timeout is a materialized default, and a
// condition-free `ready` / key-less `env` is not a request. Absent a real
// service name those service-only fields are dropped rather than made fatal —
// upstream keeps them and appends an "Ignored ready and env" notice, but a
// `tool_call` handler cannot append to the tool result, and the command that
// runs is identical.
//
// The handler mutates `event.input` in place *and* returns it, like rtk.ts
// mutates the command it rewrites: the returned object is the live event input,
// so a later in-place rewrite by another handler (rtk's `command`, for one) is
// never clobbered by this one.

import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";

/** Treats a blank string as an unset field — a whitespace-only name is no name. */
function blankToUndefined(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed === "" ? undefined : trimmed;
}

/**
 * Readiness fields that carry no condition are placeholders, and carrying one
 * into a service start would match the first byte of output (empty `log`) or
 * probe port 1 (`port` from a materializer). Drop those; drop the spec when
 * nothing survives.
 */
function normalizeReady(ready: unknown): Record<string, unknown> | undefined {
	if (ready === null || typeof ready !== "object") return undefined;
	const { log, host, port, timeout } = ready as Record<string, unknown>;
	const spec = {
		log: blankToUndefined(log),
		host: blankToUndefined(host),
		port: typeof port === "number" && Number.isFinite(port) ? port : undefined,
		timeout: typeof timeout === "number" && Number.isFinite(timeout) ? timeout : undefined,
	};
	const usable = spec.log !== undefined || spec.host !== undefined || spec.port !== undefined || spec.timeout !== undefined;
	return usable ? spec : undefined;
}

/** `env: {}` sets nothing, so it requests nothing. */
function nonEmptyRecord(record: unknown): Record<string, unknown> | undefined {
	if (record === null || typeof record !== "object") return undefined;
	for (const _key in record) return record as Record<string, unknown>;
	return undefined;
}

export default function bashBlankOptionals(omp: HookAPI): void {
	omp.on("tool_call", event => {
		if (event.toolName !== "bash") return;

		const input = event.input as Record<string, unknown> | null | undefined;
		if (input === null || typeof input !== "object") return;

		let changed = false;
		const drop = (key: string): void => {
			if (input[key] === undefined) return;
			delete input[key];
			changed = true;
		};

		// Defaults that must not be read as a request.
		if (input.async !== true) drop("async");
		if (input.timeout === null) drop("timeout");

		const name = blankToUndefined(input.name);
		if (name === undefined) {
			// No service name: `ready`/`env` cannot be honoured, and their mere
			// presence is what fails the call.
			drop("name");
			drop("ready");
			drop("env");
		} else {
			if (input.name !== name) {
				input.name = name;
				changed = true;
			}
			// Placeholder fields inside a real service spec must not survive:
			// an empty `log` pattern would match the first byte of output.
			const ready = normalizeReady(input.ready);
			if (ready === undefined) drop("ready");
			else {
				input.ready = ready;
				changed = true;
			}
			if (nonEmptyRecord(input.env) === undefined) drop("env");
		}

		if (changed) return { input };
	});
}
