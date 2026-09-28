/**
 * Grant client: the git/gh shim's credential-request helper.
 *
 * The shim (lib/shim.ts) runs this file as `BUN_BE_BUN=1 "$RUNTIME" "$CLIENT"`,
 * where RUNTIME is the shim's `runtime` (omp passes `process.execPath`). Under a
 * compiled omp install execPath IS the omp binary, so `BUN_BE_BUN=1` is what
 * makes it run this script as plain bun instead of booting a whole omp session —
 * without it, every git/gh call would start an omp that itself ran git through
 * the shim, recursing until memory ran out.
 *
 * It reads the socket path and the requested mode (`read` | `write`) from its
 * own env, asks the grant server (lib/grant-server.ts) for that mode's env, and
 * prints POSIX-shell `export KEY=value` lines on stdout — exit 0 iff the server
 * granted. Values are single-quoted so the caller can `eval` them; the token
 * never reaches argv or disk. On refusal, the server's reason is written to
 * stderr and the client exits 1; the shim prints that reason (or its own
 * guidance) so a blocked write says why.
 *
 * Deliberately import-free — it runs from the extension source dir under the
 * shim's runtime with no tsconfig, and must never depend on the extension's
 * modules or the omp binary's boot. Deliberately spawn-free: it must never
 * start a child process, or a mis-set PATH could recurse back into the shim.
 * The `export {}` keeps it a module so top-level await is legal.
 */

const sock = process.env.GBI_GRANT_SOCK;
const mode = process.env.GBI_GRANT_MODE;
if (!sock || (mode !== "read" && mode !== "write")) process.exit(1);

const shQuote = (value: unknown): string => "'" + String(value).replaceAll("'", "'\\''") + "'";

interface SocketData {
	buf: string;
}

let raw: string;
try {
	const { promise, resolve, reject } = Promise.withResolvers<string>();
	let buf = "";
	Bun.connect<SocketData>({
		unix: sock,
		data: { buf: "" },
		socket: {
			open(s) {
				s.write("GET " + mode + "\n");
			},
			data(_s, chunk) {
				buf += chunk.toString();
			},
			end() {
				resolve(buf);
			},
			close() {
				resolve(buf);
			},
			error(_s, err) {
				reject(err);
			},
			connectError(_s, err) {
				reject(err);
			},
		},
	}).catch(reject);
	raw = await promise;
} catch {
	process.exit(1);
}

let parsed: unknown;
try {
	parsed = JSON.parse(raw);
} catch {
	process.exit(1);
}
const reply = parsed as { ok?: unknown; env?: unknown; reason?: unknown } | null;
if (!reply || reply.ok !== true || typeof reply.env !== "object" || reply.env === null) {
	if (reply && typeof reply.reason === "string" && reply.reason !== "") process.stderr.write(reply.reason + "\n");
	process.exit(1);
}

let code = "";
for (const [key, value] of Object.entries(reply.env as Record<string, string>)) {
	code += "export " + key + "=" + shQuote(value) + "\n";
}
process.stdout.write(code);

export {};
