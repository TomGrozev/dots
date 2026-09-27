/**
 * In-memory grant server: the credential handoff channel between the bash
 * `tool_call` hook and the git/gh shim.
 *
 * The hook cannot hand credentials to the bash subprocess through the tool
 * event (`event.input.env` only reaches service-mode calls), so instead it
 * stores the per-call env in this process under a random ticket and rewrites
 * the command to `export GBI_TICKET=<ticket>; <command>`. The shim then asks
 * this server — over a unix socket in the creds dir whose path every shell
 * inherits as `GBI_GRANT_SOCK` — for that ticket's env and execs the real
 * binary with it.
 *
 * Credentials are NEVER written to disk: tickets and their env live only in
 * this process's memory. The socket is per-pid (`grant-<pid>.sock`) and 0600
 * inside a 0700 dir, so no other user can connect; a stale socket from a dead
 * process is unlinked before listen.
 *
 * One server per creds dir per process, shared across binds (omp re-imports the
 * extension per session/subagent) through a `Symbol.for` globalThis registry,
 * mirroring the pristine-env snapshot in index.ts.
 */

import { randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

/** Env var carrying the unix-socket path to every shell (neutral overlay). */
export const GRANT_SOCK_ENV = "GBI_GRANT_SOCK";
/** Env var carrying the per-call ticket (set by the hook's command prefix). */
export const TICKET_ENV = "GBI_TICKET";

/** Flat ticket lifetime: the server alone owns expiry, checked on redeem. A
 * bash call that outlives it simply loses its grant and fails closed. */
export const TICKET_TTL_MS = 60 * 60 * 1000;

interface Ticket {
	env: Record<string, string>;
	expiresAt: number;
}

/** The in-process grant server for one creds dir. */
export interface GrantServer {
	/** Absolute unix-socket path every shell reaches via `GBI_GRANT_SOCK`. */
	readonly socketPath: string;
	/** Store `env` under a fresh random ticket and return it. The ticket
	 * expires `ttlMs` after minting (default one hour); the server is the only
	 * owner of expiry and checks it on redeem. */
	grant(env: Record<string, string>, ttlMs?: number): string;
	/** Forget a ticket immediately (call finished). Idempotent. */
	revoke(ticket: string): void;
	/** Resolve a ticket to its env, or `null` if unknown/expired/revoked. */
	lookup(ticket: string): Record<string, string> | null;
	/** Stop the listener and drop all tickets. Tests only. */
	stop(): void;
}

/**
 * Registry key for the per-process, per-dir grant servers. `Symbol.for` (not a
 * module-local) so re-imports of this module share one server and one ticket
 * map per process, exactly like the pristine-env snapshot.
 */
const REGISTRY_KEY = Symbol.for("omp.git-bot-identity.grant-server");

function registry(): Map<string, GrantServer> {
	const g = globalThis as unknown as Record<symbol, Map<string, GrantServer> | undefined>;
	const existing = g[REGISTRY_KEY];
	if (existing) return existing;
	const created = new Map<string, GrantServer>();
	g[REGISTRY_KEY] = created;
	return created;
}

/**
 * Get (or lazily start) the process-wide grant server for `credsDir`. The
 * second and later binds in the same process reuse the first server's socket
 * and ticket map.
 */
export function getGrantServer(credsDir: string): GrantServer {
	const reg = registry();
	const existing = reg.get(credsDir);
	if (existing) return existing;
	const server = startGrantServer(credsDir);
	reg.set(credsDir, server);
	return server;
}

/** Stop the grant server for `credsDir` if one is running. Tests only. */
export function stopGrantServer(credsDir: string): void {
	registry().get(credsDir)?.stop();
}

/** Protocol: one request line `GET <hex-ticket>\n`; one JSON response line. */
function handleRequest(line: string, tickets: Map<string, Ticket>): string {
	const match = /^GET ([0-9a-f]{16,})\s*$/.exec(line);
	if (!match) return JSON.stringify({ ok: false, reason: "malformed request" });
	const ticket = match[1] as string;
	const entry = tickets.get(ticket);
	if (!entry) return JSON.stringify({ ok: false, reason: "unknown or revoked ticket" });
	if (Date.now() > entry.expiresAt) {
		tickets.delete(ticket);
		return JSON.stringify({ ok: false, reason: "expired ticket" });
	}
	return JSON.stringify({ ok: true, env: entry.env });
}

function startGrantServer(credsDir: string): GrantServer {
	mkdirSync(credsDir, { recursive: true, mode: 0o700 });
	const socketPath = join(credsDir, `grant-${process.pid}.sock`);
	// A leftover socket from a crashed run of this pid can never be live; unlink
	// so bind succeeds. Never touch another pid's socket.
	rmSync(socketPath, { force: true });

	const tickets = new Map<string, Ticket>();

	const listener = Bun.listen<{ buf: string }>({
		unix: socketPath,
		data: { buf: "" },
		socket: {
			open(socket) {
				socket.data = { buf: "" };
			},
			data(socket, chunk) {
				// Accumulate until the request line's newline arrives; chunks may split.
				socket.data.buf += chunk.toString();
				const nl = socket.data.buf.indexOf("\n");
				if (nl === -1) return;
				const line = socket.data.buf.slice(0, nl);
				socket.end(`${handleRequest(line, tickets)}\n`);
			},
			error() {
				/* A misbehaving client must never take down the server. */
			},
		},
	});
	// 0600: only this user can connect. The dir is already 0700.
	chmodSync(socketPath, 0o600);
	// Never keep the omp process (or a test runner) alive for the listener.
	listener.unref();

	return {
		socketPath,
		grant(env, ttlMs = TICKET_TTL_MS) {
			// 192 bits of randomness — unguessable, and never derived from input.
			const ticket = randomBytes(24).toString("hex");
			tickets.set(ticket, { env, expiresAt: Date.now() + ttlMs });
			return ticket;
		},
		revoke(ticket) {
			tickets.delete(ticket);
		},
		lookup(ticket) {
			const entry = tickets.get(ticket);
			if (!entry) return null;
			if (Date.now() > entry.expiresAt) {
				tickets.delete(ticket);
				return null;
			}
			return entry.env;
		},
		stop() {
			listener.stop(true);
			tickets.clear();
			rmSync(socketPath, { force: true });
			registry().delete(credsDir);
		},
	};
}
