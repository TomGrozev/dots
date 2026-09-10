import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefault } from "../.omp/extensions/git-bot-identity";
import { FakeExtensionAPI, bashEvent } from "./fake-extension-api";
import { generatePrivateKeyPEM } from "../.omp/extensions/git-bot-identity/lib/auth";
import type { BashToolCallEvent } from "@oh-my-pi/pi-coding-agent";

let credsDir: string;
let botDirBackup: string | undefined;
let botDirTemp: string;

beforeEach(() => {
	credsDir = mkdtempSync(join(tmpdir(), "gbi-hook-"));
	botDirBackup = process.env.GIT_BOT_CONFIG_DIR;
	botDirTemp = mkdtempSync(join(tmpdir(), "gbi-bot-"));
	process.env.GIT_BOT_CONFIG_DIR = botDirTemp;
});

afterEach(() => {
	if (botDirBackup === undefined) delete process.env.GIT_BOT_CONFIG_DIR;
	else process.env.GIT_BOT_CONFIG_DIR = botDirBackup;
	rmSync(credsDir, { recursive: true, force: true });
	rmSync(botDirTemp, { recursive: true, force: true });
});

function writeCreds() {
	writeFileSync(
		join(credsDir, "config.json"),
		JSON.stringify({
			appId: "123456",
			installationId: "987654",
			botSlug: "tomgrozev-dots[bot]",
			humanName: "TomGrozev",
			humanNoreply: "1491414+TomGrozev@users.noreply.github.com",
		})
	);
	writeFileSync(join(credsDir, "app.pem"), generatePrivateKeyPEM(), { mode: 0o600 });
}

/** Install a fetch stub serving the installation-token endpoint. Returns a restore fn. */
function stubTokenFetch(api: FakeExtensionAPI, token = "ghs_hooktoken"): () => void {
	const realFetch = globalThis.fetch;
	globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
		if (String(url).includes("/access_tokens")) {
			return new Response(JSON.stringify({ token, expires_at: new Date(Date.now() + 3600_000).toISOString() }), { status: 201 });
		}
		return realFetch(url, init);
	}) as typeof globalThis.fetch;
	return () => {
		globalThis.fetch = realFetch;
	};
}

describe("git-bot-identity hook", () => {
	test("write with creds present: env overlaid with bot identity and token", async () => {
		writeCreds();
		const pi = new FakeExtensionAPI();
		const restore = stubTokenFetch(pi);
		const ext = await createDefault(pi, { credsDir });
		const event = bashEvent("git add -A && git commit -m x");
		const result = await pi.dispatchToolCall(event);

		// No block: the call proceeds with mutated input env.
		expect(result).toBeUndefined();
		const env = event.input.env as Record<string, string>;
		expect(env.GIT_AUTHOR_NAME).toBe("tomgrozev-dots[bot]");
		expect(env.GH_TOKEN).toBe("ghs_hooktoken");
		expect(env.GIT_CONFIG_GLOBAL).toMatch(/gitconfig$/);
		restore();
	});

	test("read-only with creds present: passes through untouched (no env added)", async () => {
		writeCreds();
		const pi = new FakeExtensionAPI();
		const ext = await createDefault(pi, { credsDir });
		const event = bashEvent("git status");
		await pi.dispatchToolCall(event);
		expect(event.input.env).toBeUndefined();
	});

	test("read-only without creds: passes through untouched", async () => {
		const pi = new FakeExtensionAPI();
		const ext = await createDefault(pi, { credsDir });
		const event = bashEvent("git log --oneline");
		await pi.dispatchToolCall(event);
		expect(event.input.env).toBeUndefined();
	});

	test("write without creds: blocked with clear message, no fallback", async () => {
		const pi = new FakeExtensionAPI();
		await createDefault(pi, { credsDir });
		const event = bashEvent("git push origin main");
		const result = await pi.dispatchToolCall(event);
		expect(result?.block).toBe(true);
		expect(String(result?.reason)).toContain("bot credentials");
		expect(String(result?.reason)).toContain("no fallback");
	});

	test("non-bash tool calls are ignored", async () => {
		const pi = new FakeExtensionAPI();
		await createDefault(pi, { credsDir });
		const event = { type: "tool_call", toolCallId: "x", toolName: "read", input: { path: "/tmp/f" } };
		const result = await pi.dispatchToolCall(event as never);
		expect(result).toBeUndefined();
	});

	test("unrelated commands are ignored entirely", async () => {
		const pi = new FakeExtensionAPI();
		await createDefault(pi, { credsDir });
		const event = bashEvent("ls -la");
		const result = await pi.dispatchToolCall(event);
		expect(result).toBeUndefined();
		expect(event.input.env).toBeUndefined();
	});

	test("mixed line (benign write-adjacent, e.g. git status && foo push) triggers env overlay when creds present", async () => {
		writeCreds();
		const pi = new FakeExtensionAPI();
		const restore = stubTokenFetch(pi);
		await createDefault(pi, { credsDir });
		const event = bashEvent("git status && sgi push");
		await pi.dispatchToolCall(event);
		const env = event.input.env as Record<string, string>;
		expect(env.GIT_AUTHOR_NAME).toBe("tomgrozev-dots[bot]");
		restore();
	});
});
