import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBotConfig, resolveHumanIdentity, CONFIG_FILE, type SpawnFn } from "../lib/config";

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "gbi-"));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

/**
 * Stub git-config reader: maps each config key (last argv element) to either
 * a value (exit 0) or null (absent → exit non-zero, empty stdout). Never
 * shells out.
 */
function fakeSpawn(results: Record<string, string | null>): SpawnFn {
	return async (cmd: string[]) => {
		const key = cmd[cmd.length - 1] as string;
		const value = results[key];
		if (value == null) return { exitCode: 1, stdout: "" };
		return { exitCode: 0, stdout: value };
	};
}

/** Every git lookup returns nothing. */
const NO_GIT: Record<string, string | null> = {};

const BASE = {
	name: "MyProject Agent",
	email: "12345678+myproject-agent@users.noreply.github.com",
	token: "github_pat_xxx",
	humanName: "TomGrozev",
	humanNoreply: "1491414+TomGrozev@users.noreply.github.com",
};

function writeCreds(overrides: Record<string, unknown> = {}) {
	writeFileSync(join(dir, CONFIG_FILE), JSON.stringify({ ...BASE, ...overrides }));
}

describe("loadBotConfig", () => {
	test("returns full config when name/email/token present", async () => {
		writeCreds();
		const cfg = await loadBotConfig(dir, fakeSpawn(NO_GIT));
		expect(cfg).not.toBeNull();
		expect(cfg?.name).toBe("MyProject Agent");
		expect(cfg?.email).toBe("12345678+myproject-agent@users.noreply.github.com");
		expect(cfg?.token).toBe("github_pat_xxx");
		expect(cfg?.humanName).toBe("TomGrozev");
		expect(cfg?.humanNoreply).toBe("1491414+TomGrozev@users.noreply.github.com");
	});

	test("returns null when the config file is absent", async () => {
		expect(await loadBotConfig(dir, fakeSpawn(NO_GIT))).toBeNull();
	});

	test("returns null when any required field is missing or blank", async () => {
		writeCreds({ name: undefined });
		expect(await loadBotConfig(dir, fakeSpawn(NO_GIT))).toBeNull();
		writeCreds({ email: "" });
		expect(await loadBotConfig(dir, fakeSpawn(NO_GIT))).toBeNull();
		writeCreds({ token: "   " });
		expect(await loadBotConfig(dir, fakeSpawn(NO_GIT))).toBeNull();
	});

	test("returns null on malformed JSON (never throws)", async () => {
		writeFileSync(join(dir, CONFIG_FILE), "{not json");
		expect(await loadBotConfig(dir, fakeSpawn(NO_GIT))).toBeNull();
	});

	test("loads fine when humanName/humanNoreply are omitted (identity falls back to git later)", async () => {
		writeCreds({ humanName: undefined, humanNoreply: undefined });
		const cfg = await loadBotConfig(dir, fakeSpawn(NO_GIT));
		expect(cfg).not.toBeNull();
		expect(cfg?.humanName).toBeUndefined();
		expect(cfg?.humanNoreply).toBeUndefined();
	});

	test("still fails closed when a required key is missing even with a signingKey override", async () => {
		writeCreds({ token: undefined, signingKey: "ABCDEF1234567890" });
		expect(await loadBotConfig(dir, fakeSpawn(NO_GIT))).toBeNull();
	});

	test("reads signingKey from config.json override (bot's own key id)", async () => {
		writeCreds({ signingKey: "ABCDEF1234567890" });
		const cfg = await loadBotConfig(dir, fakeSpawn(NO_GIT));
		expect(cfg?.signingKey).toBe("ABCDEF1234567890");
	});

	test("signingKey is never read from the human's git config", async () => {
		// Even if the human's global git config carries a signing key, loadBotConfig
		// must not pick it up — the bot signs with its own key, not the human's.
		writeCreds();
		const cfg = await loadBotConfig(dir, fakeSpawn({ "user.signingkey": "8649CEF3514FE780" }));
		expect(cfg?.signingKey).toBeUndefined();
	});

	test("human signing key from git config never leaks into the loaded config", async () => {
		writeCreds({ signingKey: "ABCDEF1234567890" });
		const cfg = await loadBotConfig(dir, fakeSpawn({ "user.signingkey": "8649CEF3514FE780" }));
		expect(cfg).not.toBeNull();
		expect(JSON.stringify(cfg)).not.toContain("8649CEF3514FE780");
	});

	test("omits signingKey when config.json omits it", async () => {
		writeCreds();
		const cfg = await loadBotConfig(dir, fakeSpawn(NO_GIT));
		expect(cfg?.signingKey).toBeUndefined();
	});

	test("reads signingKeyFile from config.json (the mounted-secret multi-host path)", async () => {
		writeCreds({ signingKeyFile: "/run/secrets/bot-signing-key.asc" });
		const cfg = await loadBotConfig(dir, fakeSpawn(NO_GIT));
		expect(cfg?.signingKeyFile).toBe("/run/secrets/bot-signing-key.asc");
	});

	test("omits signingKeyFile when config.json omits it", async () => {
		writeCreds();
		const cfg = await loadBotConfig(dir, fakeSpawn(NO_GIT));
		expect(cfg?.signingKeyFile).toBeUndefined();
	});
});

describe("resolveHumanIdentity", () => {
	test("config values win; git is never consulted", async () => {
		const identity = await resolveHumanIdentity(
			{ humanName: "TomGrozev", humanNoreply: "1491414+TomGrozev@users.noreply.github.com" },
			fakeSpawn(NO_GIT),
		);
		expect(identity).toEqual({ name: "TomGrozev", email: "1491414+TomGrozev@users.noreply.github.com" });
	});

	test("falls back to git config when config omits both", async () => {
		const identity = await resolveHumanIdentity(
			{},
			fakeSpawn({ "user.name": "gitUserName", "user.email": "git@users.noreply.github.com" }),
		);
		expect(identity).toEqual({ name: "gitUserName", email: "git@users.noreply.github.com" });
	});

	test("mixes a config name with a git email, and vice versa, not requiring both from one source", async () => {
		const fromConfigName = await resolveHumanIdentity(
			{ humanName: "TomGrozev" },
			fakeSpawn({ "user.email": "git@users.noreply.github.com" }),
		);
		expect(fromConfigName).toEqual({ name: "TomGrozev", email: "git@users.noreply.github.com" });

		const fromConfigEmail = await resolveHumanIdentity(
			{ humanNoreply: "1491414+TomGrozev@users.noreply.github.com" },
			fakeSpawn({ "user.name": "gitUserName" }),
		);
		expect(fromConfigEmail).toEqual({ name: "gitUserName", email: "1491414+TomGrozev@users.noreply.github.com" });
	});

	test("throws when neither config nor git yields a name and email", async () => {
		await expect(resolveHumanIdentity({}, fakeSpawn(NO_GIT))).rejects.toThrow(/human identity unresolved/);
	});
});
