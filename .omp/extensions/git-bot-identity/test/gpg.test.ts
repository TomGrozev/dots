import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureBotKey, importBotKey } from "../lib/gpg";
import type { SpawnFn } from "../lib/config";

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "gbi-gpg-"));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

const BOT_EMAIL = "12345678+myproject-agent@users.noreply.github.com";
const BOT_KEY = "ABCDEF1234567890";

describe("ensureBotKey", () => {
	test("returns an existing key parsed from --with-colons output, and passes GNUPGHOME", async () => {
		let seenEnv: Record<string, string> | undefined;
		const spawn: SpawnFn = async (cmd, env) => {
			expect(cmd).toContain("--list-secret-keys");
			seenEnv = env;
			return { exitCode: 0, stdout: `sec:u:2048:1:${BOT_KEY}:20260101::...\n`, stderr: "" };
		};
		const { keyId } = await ensureBotKey(dir, BOT_EMAIL, spawn);
		expect(keyId).toBe(BOT_KEY);
		expect(seenEnv?.GNUPGHOME).toBe(join(dir, "gnupg"));
	});

	test("generates a passphrase-less key when none exists, with the expected command shape", async () => {
		let listCount = 0;
		let genArgv: string[] | undefined;
		const spawn: SpawnFn = async cmd => {
			if (cmd.includes("--quick-generate-key")) {
				genArgv = cmd;
				return { exitCode: 0, stdout: "", stderr: "" };
			}
			if (cmd.includes("--list-secret-keys")) {
				listCount++;
				// scan (fast path + under-lock recheck) finds none; post-gen lists the key.
				return listCount < 3 ? { exitCode: 0, stdout: "", stderr: "" } : { exitCode: 0, stdout: `sec:u:2048:1:${BOT_KEY}:20260101::...\n`, stderr: "" };
			}
			throw new Error("unexpected gpg argv: " + cmd.join(" "));
		};

		const { keyId } = await ensureBotKey(dir, BOT_EMAIL, spawn);
		expect(keyId).toBe(BOT_KEY);
		expect(genArgv).toBeDefined();
		const argv = genArgv as string[];
		expect(argv).toContain("--batch");
		expect(argv).toContain("--pinentry-mode");
		expect(argv).toContain("loopback");
		expect(argv).toContain("--passphrase");
		// Empty passphrase → passphrase-less key, so no pinentry is ever needed.
		expect(argv[argv.indexOf("--passphrase") + 1]).toBe("");
		expect(argv).toContain("--quick-generate-key");
		expect(argv).toContain("rsa2048");
		expect(argv).toContain("sign");
		expect(argv).toContain("never");
		expect(argv).toContain(`git-bot-identity <${BOT_EMAIL}>`);
		// The lock acquired during generation is released afterward.
		expect(existsSync(join(dir, ".keylock"))).toBe(false);
	});

	test("when another process holds the lock, waits for its key instead of generating", async () => {
		// Pre-create the lock as if a peer is mid-generation.
		mkdirSync(join(dir, ".keylock"));
		let listCount = 0;
		const spawn: SpawnFn = async cmd => {
			if (cmd.includes("--list-secret-keys")) {
				listCount++;
				// Fast-path scan finds nothing; the wait-poll finds the peer's key.
				return listCount >= 2 ? { exitCode: 0, stdout: `sec:u:2048:1:${BOT_KEY}:20260101::...\n`, stderr: "" } : { exitCode: 0, stdout: "", stderr: "" };
			}
			throw new Error("must not generate while the lock is held: " + cmd.join(" "));
		};
		const { keyId } = await ensureBotKey(dir, BOT_EMAIL, spawn);
		expect(keyId).toBe(BOT_KEY);
	});

	test("fails closed when generation returns an error", async () => {
		let listCount = 0;
		const spawn: SpawnFn = async cmd => {
			if (cmd.includes("--quick-generate-key")) {
				return { exitCode: 2, stdout: "no pinentry", stderr: "gpg: no pinentry in batch mode" };
			}
			if (cmd.includes("--list-secret-keys")) {
				listCount++;
				return { exitCode: 0, stdout: "", stderr: "" };
			}
			throw new Error("unexpected gpg argv: " + cmd.join(" "));
		};
		await expect(ensureBotKey(dir, BOT_EMAIL, spawn)).rejects.toThrow(/gpg key generation failed/);
		expect(existsSync(join(dir, ".keylock"))).toBe(false);
	});
});

describe("importBotKey", () => {
	const KEY_FILE = "/run/secrets/bot-signing-key.asc";

	test("imports the key file into the isolated keyring and returns its fingerprint", async () => {
		let importArgv: string[] | undefined;
		let importEnv: Record<string, string> | undefined;
		const spawn: SpawnFn = async (cmd, env) => {
			if (cmd.includes("--import")) {
				importArgv = cmd;
				importEnv = env;
				return { exitCode: 0, stdout: "", stderr: "" };
			}
			if (cmd.includes("--list-secret-keys")) {
				return { exitCode: 0, stdout: `sec:u:2048:1:${BOT_KEY}:20260101::...\n`, stderr: "" };
			}
			throw new Error("unexpected gpg argv: " + cmd.join(" "));
		};
		const { keyId } = await importBotKey(dir, KEY_FILE, spawn);
		expect(keyId).toBe(BOT_KEY);
		// The key file is imported into the bot's own GNUPGHOME, never the human's.
		expect(importArgv).toContain(KEY_FILE);
		expect(importEnv?.GNUPGHOME).toBe(join(dir, "gnupg"));
	});

	test("fails closed when the import command errors", async () => {
		const spawn: SpawnFn = async cmd => {
			if (cmd.includes("--import")) return { exitCode: 2, stdout: "no valid OpenPGP data found", stderr: "gpg: no valid OpenPGP data found." };
			throw new Error("must not list keys after a failed import: " + cmd.join(" "));
		};
		await expect(importBotKey(dir, KEY_FILE, spawn)).rejects.toThrow(/gpg key import failed/);
	});

	test("prefers the fake spawn's stderr over stdout when the import errors", async () => {
		const spawn: SpawnFn = async cmd => {
			if (cmd.includes("--import")) {
				return { exitCode: 2, stdout: "no valid OpenPGP data found", stderr: "gpg: can't open '~/.config/...': No such file or directory" };
			}
			throw new Error("must not list keys after a failed import: " + cmd.join(" "));
		};
		// The thrown message must surface the real stderr diagnostic (gpg reports
		// errors on stderr), falling back to stdout only when stderr is empty.
		await expect(importBotKey(dir, KEY_FILE, spawn)).rejects.toThrow(
			/gpg key import failed \(exit 2\): gpg: can't open '~\/.config\/\.\.\.': No such file or directory/,
		);
	});

	test("fails closed when import succeeds but no secret key lands in the keyring", async () => {
		const spawn: SpawnFn = async cmd => {
			if (cmd.includes("--import")) return { exitCode: 0, stdout: "", stderr: "" };
			if (cmd.includes("--list-secret-keys")) return { exitCode: 0, stdout: "", stderr: "" };
			throw new Error("unexpected gpg argv: " + cmd.join(" "));
		};
		await expect(importBotKey(dir, KEY_FILE, spawn)).rejects.toThrow(/no secret key/);
	});
});
