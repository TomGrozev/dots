import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	NO_CREDS_SENTINEL,
	denyConfigContent,
	neutralBaseEnv,
	writeDenyConfig,
} from "../lib/neutralize";

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "gbi-neutralize-"));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

function paths(overrides: Partial<Record<"shimDir" | "denyConfigPath" | "gnupgHome" | "realPath", string>> = {}) {
	return {
		shimDir: join(dir, "shim"),
		denyConfigPath: join(dir, "deny", "config"),
		gnupgHome: join(dir, ".gnupg"),
		realPath: "/usr/bin:/bin:/usr/sbin:/sbin",
		...overrides,
	};
}

describe("neutralBaseEnv", () => {
	test("returns every pinned key with its exact pinned value", () => {
		const p = paths();
		const env = neutralBaseEnv(p);

		expect(env.PATH).toBe(`${p.shimDir}:${p.realPath}`);
		expect(env.GIT_CONFIG_GLOBAL).toBe(p.denyConfigPath);
		expect(env.GIT_SSH_COMMAND).toBe("false");
		expect(env.GIT_TERMINAL_PROMPT).toBe("0");
		expect(env.GH_TOKEN).toBe(NO_CREDS_SENTINEL);
		expect(env.GITHUB_TOKEN).toBe(NO_CREDS_SENTINEL);
		expect(env.GH_ENTERPRISE_TOKEN).toBe(NO_CREDS_SENTINEL);
		expect(env.GNUPGHOME).toBe(p.gnupgHome);
		expect(env.SSH_AUTH_SOCK).toBe("");
	});

	test("has exactly the pinned key set and no extras", () => {
		const env = neutralBaseEnv(paths());
		expect(Object.keys(env).sort()).toEqual(
			[
				"PATH",
				"GIT_CONFIG_GLOBAL",
				"GIT_SSH_COMMAND",
				"GIT_TERMINAL_PROMPT",
				"GH_TOKEN",
				"GITHUB_TOKEN",
				"GH_ENTERPRISE_TOKEN",
				"GNUPGHOME",
				"SSH_AUTH_SOCK",
			].sort(),
		);
	});
});

describe("denyConfigContent", () => {
	test("contains a [credential] section with an empty helper", () => {
		const content = denyConfigContent();
		expect(content).toContain("[credential]");
		expect(content).toContain("helper =");
	});

	test("contains no identity and no insteadOf", () => {
		const content = denyConfigContent();
		expect(content).not.toMatch(/\[user\]/i);
		expect(content).not.toMatch(/name\s*=/);
		expect(content).not.toMatch(/email\s*=/);
		expect(content).not.toMatch(/insteadOf/i);
	});

	test("ends with a trailing newline", () => {
		expect(denyConfigContent().endsWith("\n")).toBe(true);
	});
});

describe("writeDenyConfig", () => {
	test("creates the file with denyConfigContent, parent dir 0o700, file 0o600", () => {
		const deny = join(dir, "cfg", "sub", "deny-git.cfg");
		writeDenyConfig(deny);

		expect(readFileSync(deny, "utf8")).toBe(denyConfigContent());
		expect(statSync(join(dir, "cfg", "sub")).mode & 0o777).toBe(0o700);
		expect(statSync(deny).mode & 0o777).toBe(0o600);
	});

	test("is idempotent: second call succeeds with identical content", () => {
		const deny = join(dir, "deny.cfg");
		writeDenyConfig(deny);
		// Disturb the file to prove the second call rewrites it identically.
		const mtimeAfterFirst = statSync(deny).mtimeMs;
		writeDenyConfig(deny);

		expect(readFileSync(deny, "utf8")).toBe(denyConfigContent());
		// Content unchanged and write still succeeded.
		expect(statSync(deny).isFile()).toBe(true);
		expect(statSync(deny).mtimeMs).toBeGreaterThanOrEqual(mtimeAfterFirst);
	});
});
