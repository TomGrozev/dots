/**
 * In-process grant server: the credential channel between the git/gh shim and
 * the extension.
 *
 * The shim classifies its own argv and asks this server — over a unix socket in
 * the creds dir whose path every shell inherits as `GBI_GRANT_SOCK` — for one of
 * two environments: a read-class `GET read` (bot transport only) or a
 * write-class `GET write` (full bot creds + signing). There are no tickets and
 * no per-call state: the server computes the answer on each request through a
 * resolver callback supplied by index.ts, so any process in the omp session that
 * reaches the socket can obtain bot credentials — by design.
 *
 * Credentials are NEVER written to disk by this module: the resolved env travels
 * only over the socket and through the caller's shell. The socket is per-pid
 * (`grant-<pid>.sock`) and 0600 inside a 0700 dir, so no other user can connect;
 * a stale socket from a dead process is unlinked before listen.
 *
 * One server per creds dir per process, shared across binds (omp re-imports the
 * extension per session/subagent) through a `Symbol.for` globalThis registry,
 * mirroring the pristine-env snapshot in index.ts. A re-bind REPLACES the
 * resolver (`getGrantServer` calls `setResolver`), so a shared server always
 * answers with the latest bind's view of config/identity — never a stale one.
 */

import { chmodSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

/** Env var carrying the unix-socket path to every shell (neutral overlay). */
export const GRANT_SOCK_ENV = "GBI_GRANT_SOCK";
/** Env var carrying the requested class to the grant client. */
export const GRANT_MODE_ENV = "GBI_GRANT_MODE";

/** The two credential classes the shim can request. */
export type GrantMode = "read" | "write";

/** A grant answer: the env to apply, or a reason the request was refused. */
export type GrantDecision = { ok: true; env: Record<string, string> } | { ok: false; reason: string };

/** Computes the env for a requested mode. index.ts supplies the real one. */
export type GrantResolver = (mode: GrantMode) => GrantDecision | Promise<GrantDecision>;

/** The in-process grant server for one creds dir. */
export interface GrantServer {
	/** Absolute unix-socket path every shell reaches via `GBI_GRANT_SOCK`. */
	readonly socketPath: string;
	/** Install the resolver used for subsequent requests. Later binds overwrite
	 * earlier ones so the shared server reflects the latest config/identity. */
	setResolver(resolver: GrantResolver): void;
	/** Stop the listener. Tests only. */
	stop(): void;
}

/**
 * Registry key for the per-process, per-dir grant servers. `Symbol.for` (not a
 * module-local) so re-imports of this module share one server per process, exactly
 * like the pristine-env snapshot.
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
 * second and later binds in the same process reuse the first server's socket but
 * replace its resolver with their own.
 */
export function getGrantServer(credsDir: string, resolver: GrantResolver): GrantServer {
	const reg = registry();
	const existing = reg.get(credsDir);
	if (existing) {
		existing.setResolver(resolver);
		return existing;
	}
	const server = startGrantServer(credsDir, resolver);
	reg.set(credsDir, server);
	return server;
}

/** Stop the grant server for `credsDir` if one is running. Tests only. */
export function stopGrantServer(credsDir: string): void {
	registry().get(credsDir)?.stop();
}

/** Protocol: one request line `GET read\n` or `GET write\n`; one JSON response line. */
async function handleRequest(line: string, resolver: GrantResolver): Promise<GrantDecision> {
	const match = /^GET (read|write)\s*$/.exec(line);
	if (!match) return { ok: false, reason: "malformed request: expected 'GET read' or 'GET write'" };
	return resolver(match[1] as GrantMode);
}

function startGrantServer(credsDir: string, resolver: GrantResolver): GrantServer {
	mkdirSync(credsDir, { recursive: true, mode: 0o700 });
	const socketPath = join(credsDir, `grant-${process.pid}.sock`);
	// A leftover socket from a crashed run of this pid can never be live; unlink
	// so bind succeeds. Never touch another pid's socket.
	rmSync(socketPath, { force: true });

	let currentResolver = resolver;

	const listener = Bun.listen<{ buf: string; answered: boolean }>({
		unix: socketPath,
		data: { buf: "", answered: false },
		socket: {
			open(socket) {
				socket.data = { buf: "", answered: false };
			},
			async data(socket, chunk) {
				if (socket.data.answered) return;
				// Accumulate until the request line's newline arrives; chunks may split.
				socket.data.buf += chunk.toString();
				const nl = socket.data.buf.indexOf("\n");
				if (nl === -1) return;
				socket.data.answered = true;
				const line = socket.data.buf.slice(0, nl);
				let decision: GrantDecision;
				try {
					decision = await handleRequest(line, currentResolver);
				} catch (err) {
					decision = { ok: false, reason: err instanceof Error ? err.message : String(err) };
				}
				socket.end(`${JSON.stringify(decision)}\n`);
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
		setResolver(next) {
			currentResolver = next;
		},
		stop() {
			listener.stop(true);
			rmSync(socketPath, { force: true });
			registry().delete(credsDir);
		},
	};
}
