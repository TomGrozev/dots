/**
 * Minimal ExtensionAPI stub for unit-testing extension wiring without omp.
 * Only the surface git-bot-identity.ts touches.
 */
import type { BashToolCallEvent, ExtensionContext, ExecOptions, ExecResult, ToolCallEvent, ToolCallEventResult } from "@oh-my-pi/pi-coding-agent";
import type { logger as PiLogger } from "@oh-my-pi/pi-utils";

/** Same shape as the SDK's ExtensionHandler<ToolCallEvent, ToolCallEventResult>. */
export type ToolCallHandler = (
	event: ToolCallEvent,
	ctx: ExtensionContext,
) => Promise<ToolCallEventResult | void> | ToolCallEventResult | void;


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
	execCalls: { command: string; args: string[] }[] = [];
	responses: Record<string, FakeExecResult | Error> = execResponses;

	logger = {} as unknown as typeof PiLogger;

	on(eventName: "tool_call" | (string & {}), handler: ToolCallHandler): void {
		this.handlers[eventName] = handler;
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

