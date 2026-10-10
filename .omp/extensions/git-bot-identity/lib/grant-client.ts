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
 * guidance) so a blocked write says why. On a transport or protocol failure
 * (socket absent/unreachable, no answer within TIMEOUT_MS, malformed reply) it
 * instead prints a distinct `grant server unreachable at <sock> (<reason>)`
 * line, so a write blocked by an unreachable server is not mistaken for a
 * refused grant.
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

/** A revocation/refusal comes back as JSON `{ok:false,reason}`; a transport or
 * protocol failure is this message. The shim prints whichever it gets, so an
 * unreachable server is distinguishable from a refused grant. */
const unreachable = (reason: string): never => {
	process.stderr.write(`git-bot-identity: grant server unreachable at ${sock} (${reason})\n`);
	process.exit(1);
};

/** Fail fast if the socket accepts but never answers (a wedged server), so a
 * write cannot hang forever. */
const TIMEOUT_MS = 5000;

const shQuote = (value: unknown): string => "'" + String(value).replaceAll("'", "'\\''") + "'";

interface SocketData {
	buf: string;
}

/** Ask the server and return its raw reply, or exit with the unreachable
 * message. A function (not inline) so the never-returning catch is a definite
 * termination for the type checker. Takes the already-narrowed socket/mode so
 * the closure does not lose the outer guard's narrowing. */
async function fetchReply(socketPath: string, grantMode: "read" | "write"): Promise<string> {
	try {
		const { promise, resolve, reject } = Promise.withResolvers<string>();
		let buf = "";
		const timer = setTimeout(() => reject(new Error("timed out")), TIMEOUT_MS);
		try {
			Bun.connect<SocketData>({
				unix: socketPath,
				data: { buf: "" },
				socket: {
					open(s) {
						s.write("GET " + grantMode + "\n");
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
			return await promise;
		} finally {
			clearTimeout(timer);
		}
	} catch (err) {
		return unreachable(err instanceof Error ? err.message : String(err));
	}
}

const raw = await fetchReply(sock, mode);

let parsed: unknown;
try {
	parsed = JSON.parse(raw);
} catch {
	unreachable("invalid response");
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
