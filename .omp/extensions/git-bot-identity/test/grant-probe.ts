/**
 * Test-only client for the grant-server socket protocol. Mirrors what the
 * checked-in shim grant-client does (lib/grant-client.ts) so tests can prove a
 * mode really resolves over the live socket — not a private shortcut into the
 * server.
 */

export interface GrantReply {
	ok: boolean;
	env?: Record<string, string>;
	reason?: string;
}

/** Send one raw request line (no trailing newline) to the server at `sock`. */
export async function request(sock: string, line: string): Promise<GrantReply> {
	const { promise, resolve, reject } = Promise.withResolvers<GrantReply>();
	let buf = "";
	Bun.connect({
		unix: sock,
		socket: {
			open(s) {
				s.write(`${line}\n`);
			},
			data(_s, chunk) {
				buf += chunk.toString();
			},
			end() {
				resolve(JSON.parse(buf) as GrantReply);
			},
			close() {
				resolve(JSON.parse(buf) as GrantReply);
			},
			error(_s, err) {
				reject(err);
			},
			connectError(_s, err) {
				reject(err);
			},
		},
	}).catch(reject);
	return promise;
}

/** Ask the server at `sock` for `mode`'s env. */
export function redeem(sock: string, mode: "read" | "write"): Promise<GrantReply> {
	return request(sock, `GET ${mode}`);
}
