import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import type { ExtensionUIContext } from "@oh-my-pi/pi-coding-agent";
import { runSetup, installSetup, notifyIfUnconfigured } from "../lib/setup";
import { loadBotConfig, CONFIG_FILE, type SpawnFn } from "../lib/config";
import { FakeExtensionAPI, makeFakeUi } from "./fake-extension-api";

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "gbi-setup-"));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

/** The bot's fixed test fingerprint + armored public half used by the fake gpg. */
const FPR = "D0C0FFEE01D0C0FFEE01D0C0FFEE01D0C0FFEE01";
const ARMORED_PUB = "-----BEGIN PGP PUBLIC KEY BLOCK-----\nxyz\n-----END PGP PUBLIC KEY BLOCK-----";
const GH_USER = JSON.stringify({ login: "myproject-agent", id: 12345678, name: "MyProject Agent" });
const DERIVED_EMAIL = "12345678+myproject-agent@users.noreply.github.com";

type SpawnResult = { exitCode: number; stdout: string; stderr: string };

/** Record every spawn call and delegate to `handler` for a canned response. */
function makeSpawn(handler: (cmd: string[], env?: Record<string, string>) => SpawnResult) {
	const calls: { cmd: string[]; env: Record<string, string> | undefined }[] = [];
	const spawn: SpawnFn = async (cmd, env) => {
		calls.push({ cmd, env });
		return { ...handler(cmd, env), stderr: "" };
	};
	return { spawn, calls };
}

/**
 * Deterministic fake gh/gpg keyed by argv. Distinguishes the bot keyring list
 * (GNUPGHOME overlay) from the human-keyring list (no overlay) so both the
 * generate and the keyring-import paths can be driven without shelling out.
 */
function gpgBotHandler(opts: { generate?: boolean; keyring?: boolean; failUser?: boolean; failSmoke?: boolean; failRegister?: boolean } = {}) {
	const generate = opts.generate ?? true;
	let botListCalls = 0;
	// A well-formed `uid` record: index 9 is the human-readable label (MainUid).
	const uidParts = ["uid", "f", "", "", "", "", "", "", "", "MyProject Agent <agent@example.com>", ""];
	const KEYRING_LINE = `sec:-:2048:1:${FPR}:...\n${uidParts.join(":")}\n`;
	return (cmd: string[], env?: Record<string, string>): SpawnResult => {
		const s = cmd.join(" ");
		if (cmd[0] === "gh") {
			if (s.includes("api user")) {
				if (opts.failUser) return { exitCode: 1, stdout: "Not Found", stderr: "" };
				return { exitCode: 0, stdout: GH_USER, stderr: "" };
			}
			if (s.includes("user/gpg_keys")) {
				if (opts.failRegister) return { exitCode: 1, stdout: "HTTP 422", stderr: "" };
				return { exitCode: 0, stdout: "{}", stderr: "" };
			}
		}
		if (s.includes("--list-secret-keys")) {
			if (env?.GNUPGHOME) {
				// Bot keyring: empty until a key is generated; present after.
				if (!generate) return { exitCode: 0, stdout: KEYRING_LINE, stderr: "" };
				botListCalls++;
				if (botListCalls >= 2) return { exitCode: 0, stdout: `sec:-:2048:1:${FPR}:...\n`, stderr: "" };
				return { exitCode: 0, stdout: "", stderr: "" };
			}
			// Human keyring, no GNUPGHOME overlay — only populated in keyring mode.
			if (opts.keyring) return { exitCode: 0, stdout: KEYRING_LINE, stderr: "" };
			return { exitCode: 0, stdout: "", stderr: "" };
		}
		if (s.includes("--quick-generate-key")) return { exitCode: 0, stdout: "", stderr: "" };
		if (s.includes("--export-secret-keys")) return { exitCode: 0, stdout: "secret-asc", stderr: "" };
		if (s.includes("--sign")) {
			if (opts.failSmoke) return { exitCode: 1, stdout: "gpg: signing failed", stderr: "gpg: signing failed\n" };
			return { exitCode: 0, stdout: "", stderr: "" };
		}
		if (s.includes("--armor") && s.includes("--export")) return { exitCode: 0, stdout: ARMORED_PUB, stderr: "" };
		if (s.includes("--import")) return { exitCode: 0, stdout: "", stderr: "" };
		throw new Error(`unexpected spawn: ${s}`);
	};
}

/** A happy-path handler factory with no failures enabled. */
function happyHandler() {
	return gpgBotHandler({ generate: true });
}

function configPath() {
	return join(dir, CONFIG_FILE);
}

describe("runSetup — fresh happy path", () => {
	test("(a) writes config.json mode 0600 with name/email/token + signingKey (generate)", async () => {
		const { spawn } = makeSpawn(happyHandler());
		const ui = makeFakeUi({ selects: ["Generate a new key", "Keep in the keyring only"], inputs: ["ghp_test_" + "x".repeat(20), "", ""] });

		const ok = await runSetup({ ui: ui.ui as unknown as ExtensionUIContext, spawn, credsDir: dir });
		expect(ok).toBe(true);

		expect(existsSync(configPath())).toBe(true);
		expect(statSync(configPath()).mode & 0o777).toBe(0o600);
		const cfg = JSON.parse(readFileSync(configPath(), "utf8")) as Record<string, string>;
		expect(cfg["name"]).toBe("MyProject Agent");
		expect(cfg["email"]).toBe(DERIVED_EMAIL);
		expect(cfg["token"]).toBe("ghp_test_" + "x".repeat(20));
		expect(cfg["signingKey"]).toBe(FPR);
		expect(cfg["signingKeyFile"]).toBeUndefined();
		// Empty name/email override inputs kept the derived identity.
		expect(ui.inputCalls.length).toBe(3); // token, name, email
		// Final success notification fired.
		expect(ui.notifications.some(n => n.message === "git-bot-identity configured.")).toBe(true);
	});

	test("(b) PAT validation hard-fail writes no config and returns false", async () => {
		const { spawn } = makeSpawn(gpgBotHandler({ generate: true, failUser: true }));
		const ui = makeFakeUi({ selects: [], inputs: ["ghp_bad_token"] });

		const ok = await runSetup({ ui: ui.ui as unknown as ExtensionUIContext, spawn, credsDir: dir });
		expect(ok).toBe(false);
		expect(existsSync(configPath())).toBe(false);
		expect(ui.notifications.some(n => n.type === "error")).toBe(true);
	});

	test("(c) signing smoke-test hard-fail writes no config and returns false", async () => {
		const { spawn } = makeSpawn(gpgBotHandler({ generate: true, failSmoke: true }));
		const ui = makeFakeUi({ selects: ["Generate a new key"], inputs: ["ghp_test_" + "x".repeat(20), "", ""] });

		const ok = await runSetup({ ui: ui.ui as unknown as ExtensionUIContext, spawn, credsDir: dir });
		expect(ok).toBe(false);
		expect(existsSync(configPath())).toBe(false);
		expect(ui.notifications.some(n => n.type === "error")).toBe(true);
	});

	test("(d) public-key registration failure is SOFT: config still written, warning emitted", async () => {
		const { spawn } = makeSpawn(gpgBotHandler({ generate: true, failRegister: true }));
		const ui = makeFakeUi({ selects: ["Generate a new key", "Keep in the keyring only"], inputs: ["ghp_test_" + "x".repeat(20), "", ""] });

		const ok = await runSetup({ ui: ui.ui as unknown as ExtensionUIContext, spawn, credsDir: dir });
		expect(ok).toBe(true);
		expect(existsSync(configPath())).toBe(true);
		expect(JSON.parse(readFileSync(configPath(), "utf8"))["token"]).toBe("ghp_test_" + "x".repeat(20));
		expect(ui.notifications.some(n => n.type === "warning" && n.message.includes("settings/keys"))).toBe(true);
	});
});

describe("runSetup — keyring import", () => {
	test("(e) exports+imports a keyring key and records signingKeyFile", async () => {
		const { spawn, calls } = makeSpawn(gpgBotHandler({ generate: false, keyring: true }));
		const keyLabel = `MyProject Agent <agent@example.com> (${FPR})`;
		const ui = makeFakeUi({ selects: ["Use a key from my gpg keyring", keyLabel, "Save to a file"], inputs: ["ghp_test_" + "x".repeat(20), "", ""] });

		const ok = await runSetup({ ui: ui.ui as unknown as ExtensionUIContext, spawn, credsDir: dir });
		expect(ok).toBe(true);

		const cfg = JSON.parse(readFileSync(configPath(), "utf8")) as Record<string, string>;
		expect(cfg["signingKeyFile"]).toBe(join(dir, "signing-key.asc"));
		expect(cfg["signingKey"]).toBeUndefined();
		// The exported secret key was written to the bot home for re-import.
		expect(readFileSync(join(dir, "signing-key.asc"), "utf8")).toBe("secret-asc");
		// The keyring list ran WITHOUT a GNUPGHOME overlay (the human keyring).
		expect(calls.some(c => c.cmd.includes("--list-secret-keys") && !c.env?.GNUPGHOME)).toBe(true);
	});
});

describe("runSetup — storage destination", () => {
	test("(A) generate + Save to a file writes signingKeyFile (armored, 0600)", async () => {
		const { spawn } = makeSpawn(happyHandler());
		const ui = makeFakeUi({ selects: ["Generate a new key", "Save to a file"], inputs: ["ghp_test_" + "x".repeat(20), "", ""] });

		const ok = await runSetup({ ui: ui.ui as unknown as ExtensionUIContext, spawn, credsDir: dir });
		expect(ok).toBe(true);

		const cfg = JSON.parse(readFileSync(configPath(), "utf8")) as Record<string, string>;
		expect(cfg["signingKeyFile"]).toBe(join(dir, "signing-key.asc"));
		expect(cfg["signingKey"]).toBeUndefined();
		const keyPath = join(dir, "signing-key.asc");
		expect(existsSync(keyPath)).toBe(true);
		expect(statSync(keyPath).mode & 0o777).toBe(0o600);
	});

	test("(B) generate + Keep in the keyring only removes any stale signing-key.asc", async () => {
		// A prior file-storage key must not linger once storage is keyring-only.
		writeFileSync(join(dir, "signing-key.asc"), "stale", { mode: 0o600 });
		const { spawn } = makeSpawn(happyHandler());
		const ui = makeFakeUi({ selects: ["Generate a new key", "Keep in the keyring only"], inputs: ["ghp_test_" + "x".repeat(20), "", ""] });

		const ok = await runSetup({ ui: ui.ui as unknown as ExtensionUIContext, spawn, credsDir: dir });
		expect(ok).toBe(true);

		const cfg = JSON.parse(readFileSync(configPath(), "utf8")) as Record<string, string>;
		expect(cfg["signingKey"]).toBe(FPR);
		expect(cfg["signingKeyFile"]).toBeUndefined();
		expect(existsSync(join(dir, "signing-key.asc"))).toBe(false);
	});

	test("(D) both storage options carry a non-empty description", async () => {
		const { spawn } = makeSpawn(happyHandler());
		const ui = makeFakeUi({ selects: ["Generate a new key", "Keep in the keyring only"], inputs: ["ghp_test_" + "x".repeat(20), "", ""] });

		await runSetup({ ui: ui.ui as unknown as ExtensionUIContext, spawn, credsDir: dir });
		// The storage select is the only one whose options carry descriptions.
		const storageSelect = ui.selectCalls.find(c => c.options.some(o => typeof o === "object" && "description" in (o as object)));
		expect(storageSelect).toBeDefined();
		const items = storageSelect!.options.filter(o => typeof o === "object") as { label: string; description?: string }[];
		expect(items.length).toBe(2);
		expect(items.every(o => typeof o.description === "string" && o.description.length > 0)).toBe(true);
	});

	test("(E) import-from-a-file asks no storage question", async () => {
		const { spawn } = makeSpawn(gpgBotHandler({ generate: false }));
		const keyPath = join(dir, "provided-key.asc");
		writeFileSync(keyPath, "some-armor", { mode: 0o600 });
		const ui = makeFakeUi({ selects: ["Import from a file"], inputs: ["ghp_test_" + "x".repeat(20), "", "", keyPath] });

		const ok = await runSetup({ ui: ui.ui as unknown as ExtensionUIContext, spawn, credsDir: dir });
		expect(ok).toBe(true);
		// Only the "Signing key" source select ran — no storage select followed.
		expect(ui.selectCalls.length).toBe(1);
		const cfg = JSON.parse(readFileSync(configPath(), "utf8")) as Record<string, string>;
		expect(cfg["signingKeyFile"]).toBe(keyPath);
		expect(cfg["signingKey"]).toBeUndefined();
	});
});

describe("installSetup — session_start nudge", () => {
	/** Install setup against a fresh FakeExtensionAPI + harness. */
	function makeInstalled(script?: Parameters<typeof makeFakeUi>[0]) {
		const api = new FakeExtensionAPI();
		const ui = makeFakeUi(script);
		const { spawn } = makeSpawn(happyHandler());
		installSetup(api, { credsDir: dir, spawn });
		return { api, ui, spawn };
	}

	test("existing config → no nudge (notify not called)", async () => {
		writeFileSync(
			configPath(),
			JSON.stringify({ name: "X", email: DERIVED_EMAIL, token: "t", signingKey: FPR }),
		);
		const { ui, spawn } = makeInstalled();
		await notifyIfUnconfigured({ ui: ui.ui as unknown as ExtensionUIContext, spawn, credsDir: dir });
		expect(ui.notifications.length).toBe(0);
	});

	test("unconfigured → nudge notification points at /git-bot-setup", async () => {
		const { ui, spawn } = makeInstalled();
		await notifyIfUnconfigured({ ui: ui.ui as unknown as ExtensionUIContext, spawn, credsDir: dir });
		expect(ui.notifications.length).toBe(1);
		expect(ui.notifications[0]!.message).toContain("/git-bot-setup");
	});

	test("(h) mode !== 'tui' never nudges", async () => {
		const { api, ui } = makeInstalled();
		await api.dispatchSessionStart(ui.ctx({ mode: "rpc" }));
		expect(ui.notifications.length).toBe(0);
	});

	test("(h) hasUI === false never nudges", async () => {
		const { api, ui } = makeInstalled();
		await api.dispatchSessionStart(ui.ctx({ hasUI: false }));
		expect(ui.notifications.length).toBe(0);
	});

	test("session_start shows NO dialog (regression: launch must not occupy the dialog slot)", async () => {
		// The on-launch nudge must be a notification only — never select/input/
		// confirm. A launch dialog would trip the 30s handler timeout AND queue the
		// /git-bot-setup command's own dialogs invisibly behind omp's single slot.
		const { api, ui } = makeInstalled();
		await api.dispatchSessionStart(ui.ctx());
		expect(ui.selectCalls.length).toBe(0);
		expect(ui.inputCalls.length).toBe(0);
		expect(ui.notifications.length).toBe(1);
		expect(ui.notifications[0]!.message).toContain("/git-bot-setup");
	});

	test("the /git-bot-setup command runs the wizard and writes config", async () => {
		const { api, ui } = makeInstalled({ selects: ["Generate a new key", "Keep in the keyring only"], inputs: ["ghp_test_" + "x".repeat(20), "", ""] });
		await api.runCommand("git-bot-setup", "", ui.ctx() as Partial<ExtensionCommandContext>);
		expect(existsSync(configPath())).toBe(true);
	});

	test("the /git-bot-setup command is registered", async () => {
		const api = new FakeExtensionAPI();
		installSetup(api, { credsDir: dir, spawn: async () => ({ exitCode: 0, stdout: "", stderr: "" }) });
		expect(api.commands["git-bot-setup"]).toBeDefined();
	});
});

describe("reconfigure — existing config is redacted and editable", () => {
	test("shows redacted token (never the full secret), rotating the PAT updates token", async () => {
		writeFileSync(configPath(), JSON.stringify({ name: "MyProject Agent", email: DERIVED_EMAIL, token: "supersecret-token-value", signingKey: FPR }));
		const { spawn } = makeSpawn(happyHandler());
		// Reconfigure action loop: rotate PAT, then Done/abort to persist.
		const ui = makeFakeUi({ selects: ["Rotate PAT", "Done/abort"], inputs: ["NEW_TOKEN_1234567890"] });

		const ok = await runSetup({ ui: ui.ui as unknown as ExtensionUIContext, spawn, credsDir: dir });
		expect(ok).toBe(true);

		// The redaction notification never exposed the full secret.
		for (const n of ui.notifications) expect(n.message).not.toContain("supersecret-token-value");
		const cfg = JSON.parse(readFileSync(configPath(), "utf8")) as Record<string, string>;
		expect(cfg["token"]).toBe("NEW_TOKEN_1234567890");
		expect(cfg["signingKey"]).toBe(FPR);
	});

	test("(C) reconfigure exports the current key to a file without regenerating", async () => {
		writeFileSync(configPath(), JSON.stringify({ name: "MyProject Agent", email: DERIVED_EMAIL, token: "t", signingKey: FPR }));
		const { spawn, calls } = makeSpawn(happyHandler());
		// Reconfigure action loop: export the current key, then Done/abort to persist.
		const ui = makeFakeUi({ selects: ["Export current signing key to a file", "Done/abort"] });

		const ok = await runSetup({ ui: ui.ui as unknown as ExtensionUIContext, spawn, credsDir: dir });
		expect(ok).toBe(true);

		// Config flips from signingKey to signingKeyFile pointing at the export.
		const cfg = JSON.parse(readFileSync(configPath(), "utf8")) as Record<string, string>;
		expect(cfg["signingKeyFile"]).toBe(join(dir, "signing-key.asc"));
		expect(cfg["signingKey"]).toBeUndefined();
		expect(existsSync(join(dir, "signing-key.asc"))).toBe(true);
		// Same-key conversion: no regeneration and no GitHub registration call.
		expect(calls.some(c => c.cmd.includes("--quick-generate-key"))).toBe(false);
		expect(calls.some(c => c.cmd.includes("user/gpg_keys"))).toBe(false);
		// The armor body never leaks into a notification.
		for (const n of ui.notifications) expect(n.message).not.toContain("secret-asc");
	});

	test("loaded config can be read back via loadBotConfig", async () => {
		writeFileSync(configPath(), JSON.stringify({ name: "MyProject Agent", email: DERIVED_EMAIL, token: "t", signingKey: FPR }));
		expect(await loadBotConfig(dir, async () => ({ exitCode: 0, stdout: "", stderr: "" }))).not.toBeNull();
	});
});
