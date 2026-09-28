import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getGrantServer, stopGrantServer, type GrantMode } from "../lib/grant-server";
import { redeem, request } from "./grant-probe";

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "gbi-grant-"));
});

afterEach(() => {
	stopGrantServer(dir);
	rmSync(dir, { recursive: true, force: true });
});

const echoResolver = (mode: GrantMode) => ({ ok: true as const, env: { MODE: mode } });

describe("grant server", () => {
	test("binds a per-pid socket, 0600, inside the creds dir, and reuses one server per dir", () => {
		const a = getGrantServer(dir, echoResolver);
		const b = getGrantServer(dir, echoResolver);
		expect(b).toBe(a);
		expect(a.socketPath).toBe(join(dir, `grant-${process.pid}.sock`));
		expect(statSync(a.socketPath).mode & 0o777).toBe(0o600);
	});

	test("a read request resolves through the resolver over the live socket", async () => {
		const server = getGrantServer(dir, mode => ({ ok: true, env: { MODE: mode, GH_TOKEN: "transport" } }));
		const reply = await redeem(server.socketPath, "read");
		expect(reply.ok).toBe(true);
		expect(reply.env).toEqual({ MODE: "read", GH_TOKEN: "transport" });
	});

	test("a write request resolves through the resolver over the live socket", async () => {
		const server = getGrantServer(dir, mode => ({ ok: true, env: { MODE: mode } }));
		const reply = await redeem(server.socketPath, "write");
		expect(reply.ok).toBe(true);
		expect(reply.env).toEqual({ MODE: "write" });
	});

	test("a re-bind replaces the resolver on the shared server", async () => {
		getGrantServer(dir, () => ({ ok: true, env: { FROM: "first" } }));
		const shared = getGrantServer(dir, () => ({ ok: true, env: { FROM: "second" } }));
		const reply = await redeem(shared.socketPath, "write");
		expect(reply.env).toEqual({ FROM: "second" });
	});

	test("a refused request carries the resolver's reason", async () => {
		const server = getGrantServer(dir, () => ({ ok: false, reason: "bot credentials absent" }));
		const denied = await redeem(server.socketPath, "write");
		expect(denied.ok).toBe(false);
		expect(denied.reason).toBe("bot credentials absent");
	});

	test("a malformed request line is refused", async () => {
		const server = getGrantServer(dir, echoResolver);
		const denied = await request(server.socketPath, "GET everything");
		expect(denied.ok).toBe(false);
		expect(denied.reason).toContain("malformed");
	});

	test("a resolver that throws is refused, not crashed", async () => {
		const server = getGrantServer(dir, () => {
			throw new Error("boom");
		});
		const denied = await redeem(server.socketPath, "write");
		expect(denied.ok).toBe(false);
		expect(denied.reason).toBe("boom");
	});
});
