/**
 * Bot identity for omp's in-process commit path.
 *
 * `/commit` and the eval `commit` namespace create the commit with gitoxide in
 * the omp process; they never run `git`, so the PATH shim and the grant socket
 * cannot see them. gitoxide reads identity and signing from the process
 * environment and git config, so the extension writes that environment once at
 * load and refreshes it before each turn. It uses libc, not Bun's `process.env`
 * proxy, because native code reads the real process environment.
 *
 * The overlay deliberately carries no PAT: a native child may see the bot name
 * or signing key, but it never sees a GitHub credential. If the bot is
 * unconfigured, the invalid author name makes gitoxide refuse every commit
 * instead of falling back to the human identity.
 */
import { dlopen, FFIType } from "bun:ffi";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

export type NativeCommitGrant =
	| { ok: true; env: Record<string, string> }
	| { ok: false; reason: string };

interface Libc {
	setenv(key: Buffer, value: Buffer, overwrite: number): number;
	unsetenv(key: Buffer): number;
	getenv(key: Buffer): string | null;
}

let libc: Libc | null | undefined;

function nativeLibc(): Libc {
	if (libc !== undefined) {
		if (libc === null) throw new Error("libc is unavailable");
		return libc;
	}
	try {
		const name = process.platform === "darwin" ? "libSystem.B.dylib" : "libc.so.6";
		libc = dlopen(name, {
			setenv: { args: [FFIType.cstring, FFIType.cstring, FFIType.i32], returns: FFIType.i32 },
			unsetenv: { args: [FFIType.cstring], returns: FFIType.i32 },
			getenv: { args: [FFIType.cstring], returns: FFIType.cstring },
		}).symbols as unknown as Libc;
		return libc;
	} catch {
		libc = null;
		throw new Error("libc is unavailable");
	}
}

function cstring(value: string): Buffer {
	return Buffer.from(`${value}\0`);
}

/**
 * Write `env` into the process's real environment. Bun's `process.env` writes
 * do not reach the environment Rust/native code and spawned native children
 * read, so this uses libc directly. Returns an idempotent restore for tests.
 */
export function applyNativeEnv(env: Record<string, string>): () => void {
	const symbols = nativeLibc();
	const previous = new Map<string, string | null>();
	for (const key of Object.keys(env)) previous.set(key, symbols.getenv(cstring(key)));

	const write = (): void => {
		for (const [key, value] of Object.entries(env)) symbols.setenv(cstring(key), cstring(value), 1);
	};
	const restore = (): void => {
		for (const [key, value] of previous) {
			if (value === null) symbols.unsetenv(cstring(key));
			else symbols.setenv(cstring(key), cstring(value), 1);
		}
	};

	try {
		write();
	} catch (err) {
		restore();
		throw err;
	}
	return restore;
}

/**
 * An author name with `<` is rejected by gitoxide, so an unconfigured bot
 * blocks the native commit path instead of letting it fall back to the human.
 */
export function failClosedNativeEnv(): Record<string, string> {
	const name = "git-bot-identity-unconfigured<";
	const email = "unconfigured@invalid";
	return {
		GIT_AUTHOR_NAME: name,
		GIT_AUTHOR_EMAIL: email,
		GIT_COMMITTER_NAME: name,
		GIT_COMMITTER_EMAIL: email,
		GIT_CONFIG_COUNT: "2",
		GIT_CONFIG_KEY_0: "user.name",
		GIT_CONFIG_VALUE_0: name,
		GIT_CONFIG_KEY_1: "user.email",
		GIT_CONFIG_VALUE_1: email,
	};
}

/**
 * Apply the bot identity globally and refresh it before each turn, so a config
 * edited by `/git-bot-setup` reaches the native path without a restart.
 */
export async function installNativeCommitEnv(
	pi: ExtensionAPI,
	resolve: () => Promise<NativeCommitGrant>,
): Promise<void> {
	let lastFailure: string | null = null;

	const apply = (env: Record<string, string>): void => {
		try {
			applyNativeEnv(env);
		} catch (err) {
			console.warn(
				`[git-bot-identity] native commit env unavailable: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	};

	const refresh = async (): Promise<void> => {
		let grant: NativeCommitGrant;
		try {
			grant = await resolve();
		} catch (err) {
			grant = { ok: false, reason: err instanceof Error ? err.message : String(err) };
		}
		if (grant.ok) {
			apply(grant.env);
			lastFailure = null;
			return;
		}
		apply(failClosedNativeEnv());
		if (grant.reason !== lastFailure) {
			lastFailure = grant.reason;
			console.warn(`[git-bot-identity] native commit path blocked: ${grant.reason}`);
		}
	};

	await refresh();
	pi.on("before_agent_start", refresh);
}
