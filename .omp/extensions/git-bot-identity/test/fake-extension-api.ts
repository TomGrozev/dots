/**
 * Minimal ExtensionAPI stub for unit-testing extension wiring without omp.
 * Only the surface git-bot-identity.ts touches.
 */
import type { BashToolCallEvent, ExtensionContext, ExecOptions, ExecResult, ToolCallEvent, ToolCallEventResult } from "@oh-my-pi/pi-coding-agent";
import type { ExtensionCommandContext, ExtensionUIContext, SessionStartEvent } from "@oh-my-pi/pi-coding-agent";
import type { logger as PiLogger } from "@oh-my-pi/pi-utils";

/** Same shape as the SDK's ExtensionHandler<ToolCallEvent, ToolCallEventResult>. */
export type ToolCallHandler = (
	event: ToolCallEvent,
	ctx: ExtensionContext,
) => Promise<ToolCallEventResult | void> | ToolCallEventResult | void;

/** Handler shape for the setup extension's session_start hook. */
export type SessionStartHandler = (event: SessionStartEvent, ctx: ExtensionContext) => void | Promise<void>;

/** Registered command surface, matching what installSetup consumes. */
export interface RegisteredCommand {
	description?: string;
	handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
}


export interface FakeExecResult {
	stdout: string;
	stderr?: string;
	code?: number;
	killed?: boolean;
}

/** Map command -> response or throwing error. First match wins. */
const execResponses: Record<string, FakeExecResult | Error> = {};

export class FakeExtensionAPI {
	handlers: Record<string, ToolCallHandler> = {};
	commands: Record<string, RegisteredCommand> = {};
	sessionStartHandlers: SessionStartHandler[] = [];
	execCalls: { command: string; args: string[] }[] = [];
	responses: Record<string, FakeExecResult | Error> = execResponses;

	logger = {} as unknown as typeof PiLogger;

	on(eventName: "tool_call" | (string & {}), handler: ToolCallHandler | SessionStartHandler): void {
		// Route session_start to a dedicated list so tests can dispatch it and
		// drive the on-launch setup prompt independently of tool_call hooks.
		if (eventName === "session_start") {
			this.sessionStartHandlers.push(handler as unknown as SessionStartHandler);
			return;
		}

		this.handlers[eventName] = handler as ToolCallHandler;
	}

	registerCommand(name: string, options: RegisteredCommand): void {
		this.commands[name] = options;
	}

	/** Fire the registered session_start handlers the way omp's event bus would. */
	async dispatchSessionStart(ctx?: Partial<ExtensionContext>): Promise<void> {
		const event = { type: "session_start" } as SessionStartEvent;
		for (const handler of this.sessionStartHandlers) {
			await handler(event, ctx as ExtensionContext);
		}
	}

	/** Run a registered command handler directly (the way the slash-command bus would). */
	async runCommand(name: string, args: string, ctx?: Partial<ExtensionCommandContext>): Promise<void> {
		const cmd = this.commands[name];
		if (!cmd) throw new Error(`No command registered: ${name}`);
		await cmd.handler(args, ctx as ExtensionCommandContext);
	}

	async exec(command: string, args: string[], _options?: ExecOptions): Promise<ExecResult> {
		this.execCalls.push({ command, args });
		const key = `${command} ${args.join(" ")}`;
		const response = this.responses[key] ?? this.responses[command];
		if (response instanceof Error) throw response;
		if (!response) throw new Error(`Unexpected exec: ${key}`);
		return { stdout: response.stdout, stderr: response.stderr ?? "", code: response.code ?? 0, killed: response.killed ?? false };
	}

	/** Fire the registered tool_call handler the way omp's event bus would. */
	async dispatchToolCall(event: ToolCallEvent, ctx?: Partial<ExtensionContext>): Promise<ToolCallEventResult | void> {
		const handler = this.handlers["tool_call"];
		if (!handler) throw new Error("No tool_call handler registered");
		return handler(event, ctx as ExtensionContext);
	}
}

/** A bash tool_call event with mutable input, as omp delivers it. */
export function bashEvent(command: string, env?: Record<string, string>): BashToolCallEvent {
	const input = { command };
	if (env) Object.assign(input, { env });
	return { type: "tool_call", toolCallId: "test-1", toolName: "bash", input } as BashToolCallEvent;
}

/** Scriptable ui surface: canned answers by FIFO queue, notifications recorded. */
export interface FakeUiSurface {
	select(title: string, options: unknown[]): Promise<string | undefined>;
	input(title: string, placeholder?: string): Promise<string | undefined>;
	confirm(): Promise<boolean>;
	notify(message: string, type?: "info" | "warning" | "error"): void;
}

export interface FakeUiRecord {
	// options are recorded raw (plain strings or {label, description} objects)
	// so tests can assert the presence/contents of per-option descriptions.
	selectCalls: { title: string; options: (string | { label: string; description?: string })[] }[];
	inputCalls: { title: string; placeholder: string | undefined }[];
	notifications: { message: string; type: "info" | "warning" | "error" | undefined }[];
}

/**
 * Build a scriptable fake `ExtensionUIContext` (cast to the full SDK type at the
 * call site) plus a builder for a fake `ExtensionContext`. `script.selects` /
 * `script.inputs` are consumed FIFO; exhausted inputs default to "" (which the
 * wizard treats as keep-the-derived-value for name/email). Notifications and
 * every select/input invocation are recorded for assertions.
 */
export function makeFakeUi(script: { selects?: (string | undefined)[]; inputs?: (string | undefined)[] } = {}) {
	const selectCalls: FakeUiRecord["selectCalls"] = [];
	const inputCalls: FakeUiRecord["inputCalls"] = [];
	const notifications: FakeUiRecord["notifications"] = [];
	const selectAnswers = [...(script.selects ?? [])];
	const inputAnswers = [...(script.inputs ?? [])];

	const ui: FakeUiSurface = {
		async select(title, options) {
			// Resolve the answer by queue position (the label string, as before); keep
			// backward compat with plain-string options. Record the raw options so
			// tests can inspect labels AND descriptions for object items.
			selectCalls.push({ title, options: [...(options as (string | { label: string; description?: string })[])] });
			return selectAnswers.shift();
		},
		async input(title, placeholder) {
			inputCalls.push({ title, placeholder });
			return inputAnswers.shift() ?? "";
		},
		async confirm() {
			return true;
		},
		notify(message, type) {
			notifications.push({ message, type });
		},
	};

	const ctx = (overrides: { mode?: string; hasUI?: boolean } = {}): Partial<ExtensionContext> =>
		({ ui, mode: overrides.mode ?? "tui", hasUI: overrides.hasUI ?? true }) as unknown as Partial<ExtensionContext>;

	return { ui, selectCalls, inputCalls, notifications, selectAnswers, inputAnswers, ctx };
}

export type FakeUiHarness = ReturnType<typeof makeFakeUi>;

