/**
 * Test-only client for the grant-server socket protocol. Mirrors what the
 * generated shim grant-client does (lib/shim.ts) so hook tests can prove a
 * ticket really resolves over the live socket — not a private shortcut into the
 * server's map.
 */

export interface GrantReply {
	ok: boolean;
	env?: Record<string, string>;
	reason?: string;
}

/** Ask the server at `sock` to redeem `ticket`. */
export async function redeem(sock: string, ticket: string): Promise<GrantReply> {
	const { promise, resolve, reject } = Promise.withResolvers<GrantReply>();
	let buf = "";
	Bun.connect({
		unix: sock,
		socket: {
			open(s) {
				s.write(`GET ${ticket}\n`);
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
