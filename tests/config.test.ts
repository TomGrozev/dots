import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBotConfig, CONFIG_FILE, KEYPATH } from "../.omp/extensions/git-bot-identity/lib/config";
import { generatePrivateKeyPEM } from "../.omp/extensions/git-bot-identity/lib/auth";

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "gbi-"));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

function writeCreds(overrides: Record<string, unknown> = {}, includePem = true) {
	const body = JSON.stringify({
		appId: "123456",
		installationId: "987654",
		botSlug: "tomgrozev-dots[bot]",
		humanName: "TomGrozev",
		humanNoreply: "1491414+TomGrozev@users.noreply.github.com",
		...overrides,
	});
	writeFileSync(join(dir, CONFIG_FILE), body);
	if (includePem) {
		writeFileSync(join(dir, KEYPATH), generatePrivateKeyPEM(), { mode: 0o600 });
	}
}

describe("loadBotConfig", () => {
	test("returns full config when creds present and pem readable", () => {
		writeCreds();
		const cfg = loadBotConfig(dir);
		expect(cfg).not.toBeNull();
		expect(cfg?.appId).toBe("123456");
		expect(cfg?.installationId).toBe("987654");
		expect(cfg?.botSlug).toBe("tomgrozev-dots[bot]");
		expect(cfg?.humanNoreply).toBe("1491414+TomGrozev@users.noreply.github.com");
		expect(cfg?.privateKeyPem).toContain("BEGIN PRIVATE KEY");
	});

	test("returns null when the config file is absent", () => {
		expect(loadBotConfig(dir)).toBeNull();
	});

	test("returns null when any required field is missing", () => {
		writeCreds({ appId: undefined });
		expect(loadBotConfig(dir)).toBeNull();
		writeCreds({ botSlug: "" });
		expect(loadBotConfig(dir)).toBeNull();
	});

	test("returns null when the pem file is absent", () => {
		writeCreds({}, false);
		expect(loadBotConfig(dir)).toBeNull();
	});

	test("returns null on malformed JSON (never throws)", () => {
		writeFileSync(join(dir, CONFIG_FILE), "{not json");
		expect(loadBotConfig(dir)).toBeNull();
	});
});
