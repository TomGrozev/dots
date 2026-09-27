import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TICKET_TTL_MS, getGrantServer, stopGrantServer } from "../lib/grant-server";
import { redeem } from "./grant-probe";

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "gbi-grant-"));
});

afterEach(() => {
	stopGrantServer(dir);
	rmSync(dir, { recursive: true, force: true });
});

describe("grant TTL", () => {
	test("a grant defaults to the flat one-hour cap, and the server owns expiry", () => {
		const server = getGrantServer(dir);
		const ticket = server.grant({ K: "a" });
		const realNow = Date.now;
		try {
			Date.now = () => realNow() + TICKET_TTL_MS - 1;
			expect(server.lookup(ticket)).not.toBeNull();
			Date.now = () => realNow() + TICKET_TTL_MS + 1;
			expect(server.lookup(ticket)).toBeNull();
		} finally {
			Date.now = realNow;
		}
	});
});

describe("grant server", () => {
	test("binds a per-pid socket, 0600, inside the creds dir, and reuses one server per dir", () => {
		const a = getGrantServer(dir);
		const b = getGrantServer(dir);
		expect(b).toBe(a);
		expect(a.socketPath).toBe(join(dir, `grant-${process.pid}.sock`));
		expect(statSync(a.socketPath).mode & 0o777).toBe(0o600);
	});

	test("a ticket resolves over the live socket for the whole call; revoke denies it", async () => {
		const server = getGrantServer(dir);
		const ticket = server.grant({ GH_TOKEN: "tok", GIT_AUTHOR_NAME: "Bot" });

		const first = await redeem(server.socketPath, ticket);
		expect(first.ok).toBe(true);
		expect(first.env).toEqual({ GH_TOKEN: "tok", GIT_AUTHOR_NAME: "Bot" });
		// Valid for repeat invocations within one call.
		expect((await redeem(server.socketPath, ticket)).ok).toBe(true);

		server.revoke(ticket);
		const denied = await redeem(server.socketPath, ticket);
		expect(denied.ok).toBe(false);
		expect(denied.reason).toContain("unknown or revoked");
		// Revoke is idempotent.
		server.revoke(ticket);
	});

	test("an unknown ticket is denied", async () => {
		const server = getGrantServer(dir);
		const denied = await redeem(server.socketPath, "0123456789abcdef0123456789abcdef");
		expect(denied.ok).toBe(false);
		expect(denied.reason).toContain("unknown or revoked");
	});

	test("an expired ticket is denied even without an explicit revoke", async () => {
		const server = getGrantServer(dir);
		// A non-positive TTL puts expiresAt in the past: the expiry branch is hit
		// deterministically, with no wall-clock wait.
		const ticket = server.grant({ GH_TOKEN: "tok" }, -1);
		const denied = await redeem(server.socketPath, ticket);
		expect(denied.ok).toBe(false);
		expect(denied.reason).toContain("expired");
		expect(server.lookup(ticket)).toBeNull();
	});

	test("tickets are 192-bit hex, distinct per grant", () => {
		const server = getGrantServer(dir);
		const a = server.grant({ K: "a" });
		const b = server.grant({ K: "b" });
		expect(a).toMatch(/^[0-9a-f]{48}$/);
		expect(b).toMatch(/^[0-9a-f]{48}$/);
		expect(a).not.toBe(b);
	});
});
