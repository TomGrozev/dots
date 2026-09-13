/**
 * Bot-owned GPG signing key lifecycle.
 *
 * The bot signs commits with its OWN passphrase-less key, generated once at
 * setup and stored under the bot config dir's `gnupg/` as GNUPGHOME. The
 * human's keyring and global git config are never consulted for signing —
 * GNUPGHOME points at the bot home, so gpg/git only ever see the bot key, and
 * a passphrase-less key means no pinentry interaction is ever needed. Fail-
 * closed: if a key can't be found or generated, the caller blocks the write
 * rather than falling back to an unsigned commit or the human key.
 */

import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { SpawnFn } from "./config";

const LOCK_DIR = ".keylock";
/** Poll interval + upper bound on waiting for concurrent generation. */
const POLL_MS = 100;
const LOCK_WAIT_MS = 30_000;

/** Real gpg wrapper injecting GNUPGHOME (production default). */
async function defaultGpgSpawn(cmd: string[], env?: Record<string, string>): Promise<{ exitCode: number; stdout: string }> {
	const proc = Bun.spawn(cmd, { env: { ...process.env, ...env } });
	const stdout = await new Response(proc.stdout).text();
	return { exitCode: await proc.exited, stdout };
}

/** Parse the first secret-key fingerprint from `--with-colons` output. */
async function findSecretKey(spawn: SpawnFn, env: Record<string, string>): Promise<string | undefined> {
	const { exitCode, stdout } = await spawn(["gpg", "--batch", "--with-colons", "--list-secret-keys"], env);
	if (exitCode !== 0) return undefined;
	for (const line of stdout.split("\n")) {
		const fields = line.split(":");
		if (fields[0] === "sec" && fields[4]) return fields[4];
	}
	return undefined;
}

/**
 * Ensure a bot-owned GPG secret key exists under `dir/gnupg`, returning its
 * fingerprint. Idempotent: if the bot keyring already holds a secret key it is
 * returned; otherwise one is generated with an empty passphrase (so no
 * pinentry is ever consulted). Concurrent invocations are serialized with a
 * lockfile in `dir` — a loser polls until the winner's key appears or the 30s
 * deadline passes, so a race never generates two keys.
 *
 * `email` seeds the key UID (`git-bot-identity <${email}>`); the UID email MUST
 * equal config.email so the signature matches the committer for Verified.
 * `spawn` is injectable for tests (real gpg by default).
 */
export async function ensureBotKey(dir: string, email: string, spawn: SpawnFn = defaultGpgSpawn): Promise<{ keyId: string }> {
	const gnupgDir = join(dir, "gnupg");
	mkdirSync(gnupgDir, { recursive: true, mode: 0o700 });
	const env = { GNUPGHOME: gnupgDir };

	const existing = await findSecretKey(spawn, env);
	if (existing) return { keyId: existing };

	const lockDir = join(dir, LOCK_DIR);
	let held = false;
	try {
		mkdirSync(lockDir);
		held = true;
	} catch {
		// Another process is generating under the lock; poll for its key.
		const deadline = Date.now() + LOCK_WAIT_MS;
		while (Date.now() < deadline) {
			const key = await findSecretKey(spawn, env);
			if (key) return { keyId: key };
			const { promise, resolve } = Promise.withResolvers<void>();
			setTimeout(resolve, POLL_MS);
			await promise;
		}
		throw new Error("timed out waiting for another process to generate the bot GPG key");
	}

	try {
		// Re-check under the lock in case a peer finished between our fast-path
		// scan and acquiring the lock.
		const recheck = await findSecretKey(spawn, env);
		if (recheck) return { keyId: recheck };

		const res = await spawn(
			["gpg", "--batch", "--pinentry-mode", "loopback", "--passphrase", "", "--quick-generate-key", `git-bot-identity <${email}>`, "rsa2048", "sign", "never"],
			env,
		);
		if (res.exitCode !== 0) {
			throw new Error(`gpg key generation failed (exit ${res.exitCode}): ${res.stdout.trim()}`);
		}
		const generated = await findSecretKey(spawn, env);
		if (!generated) throw new Error("gpg key generation succeeded but no secret key was produced");
		return { keyId: generated };
	} finally {
		if (held) rmSync(lockDir, { recursive: true, force: true });
	}
}

/**
 * Import a caller-provided secret key (armored or binary, at `keyFile`) into
 * the bot's isolated keyring under `dir/gnupg`, returning the signing key's
 * fingerprint. This is the multi-host path: provision ONE key, mount its
 * secret file on every host, and register ONE public key on GitHub — rather
 * than generating a fresh key (and registering a fresh public key) per host.
 *
 * gpg import is idempotent, so re-running on an already-populated keyring is a
 * no-op. The key MUST be passphrase-less so signing never blocks on pinentry
 * (same requirement as the generated key). Fail-closed: import failure or a
 * keyring with no secret key throws, and the caller blocks the write.
 * `spawn` is injectable for tests (real gpg by default).
 */
export async function importBotKey(dir: string, keyFile: string, spawn: SpawnFn = defaultGpgSpawn): Promise<{ keyId: string }> {
	const gnupgDir = join(dir, "gnupg");
	mkdirSync(gnupgDir, { recursive: true, mode: 0o700 });
	const env = { GNUPGHOME: gnupgDir };

	const res = await spawn(["gpg", "--batch", "--import", keyFile], env);
	if (res.exitCode !== 0) {
		throw new Error(`gpg key import failed (exit ${res.exitCode}): ${res.stdout.trim()}`);
	}
	const keyId = await findSecretKey(spawn, env);
	if (!keyId) throw new Error("gpg key import succeeded but no secret key was found in the bot keyring");
	return { keyId };
}
