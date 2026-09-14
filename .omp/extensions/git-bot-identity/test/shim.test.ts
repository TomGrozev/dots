import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installShim } from "../lib/shim";
import { evalGuidance } from "../lib/guidance";

const MARKER = "FAKE_BINARY_RAN";
// A distinctive phrase from evalGuidance that must appear on a blocked write.
const BLOCK_PHRASE = "blocked write means stop";

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "gbi-shim-"));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

/** Write a tiny executable fake binary that prints a marker and echoes its args. */
function fakeBinary(name: string): string {
	const p = join(dir, name);
	writeFileSync(p, `#!/bin/sh\nprintf '%s %s\\n' '${MARKER}' "$*"\n`, { mode: 0o755 });
	return p;
}

async function run(argv: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
	const proc = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe" });
	const readAll = async (s: ReadableStream<Uint8Array> | null) => (s ? new Response(s).text() : Promise.resolve(""));
	const [stdout, stderr] = await Promise.all([readAll(proc.stdout), readAll(proc.stderr)]);
	const exit = await proc.exited;
	return { code: exit, stdout, stderr };
}

describe("installShim", () => {
	test("git read subcommand passes through, forwards args, prints marker", async () => {
		const fakeGit = fakeBinary("fake-git");
		const fakeGh = fakeBinary("fake-gh");
		const { shimDir } = installShim(dir, { git: fakeGit, gh: fakeGh });

		const res = await run([join(shimDir, "git"), "status", "--short", "src"]);
		expect(res.code).toBe(0);
		expect(res.stdout).toContain(MARKER);
		expect(res.stdout).toContain("status --short src");
	});

	test("git write subcommand is blocked with guidance and does not reach the binary", async () => {
		const fakeGit = fakeBinary("fake-git");
		const fakeGh = fakeBinary("fake-gh");
		const { shimDir } = installShim(dir, { git: fakeGit, gh: fakeGh });

		const res = await run([join(shimDir, "git"), "push", "origin", "main"]);
		expect(res.code).toBe(1);
		expect(res.stderr).toContain(BLOCK_PHRASE);
		expect(res.stdout).not.toContain(MARKER);
	});

	test("gh write subcommand is blocked with guidance; read subcommand passes through", async () => {
		const fakeGit = fakeBinary("fake-git");
		const fakeGh = fakeBinary("fake-gh");
		const { shimDir } = installShim(dir, { git: fakeGit, gh: fakeGh });

		const blocked = await run([join(shimDir, "gh"), "pr", "create", "--title", "x"]);
		expect(blocked.code).toBe(1);
		expect(blocked.stderr).toContain(BLOCK_PHRASE);
		expect(blocked.stdout).not.toContain(MARKER);

		const read = await run([join(shimDir, "gh"), "auth", "status"]);
		expect(read.code).toBe(0);
		expect(read.stdout).toContain(MARKER);
		expect(read.stdout).toContain("auth status");
	});

	test("shim is idempotent: reinstall keeps scripts working", async () => {
		const fakeGit = fakeBinary("fake-git");
		const fakeGh = fakeBinary("fake-gh");
		const first = installShim(dir, { git: fakeGit, gh: fakeGh });
		const second = installShim(dir, { git: fakeGit, gh: fakeGh });
		expect(second.shimDir).toBe(first.shimDir);

		const read = await run([join(second.shimDir, "git"), "log", "--oneline"]);
		expect(read.code).toBe(0);
		expect(read.stdout).toContain(MARKER);

		const blocked = await run([join(second.shimDir, "git"), "commit", "-m", "x"]);
		expect(blocked.code).toBe(1);
		expect(blocked.stderr).toContain(BLOCK_PHRASE);
	});
});

describe("evalGuidance", () => {
	test("contains the guidance markers used by the shim", () => {
		expect(evalGuidance()).toContain(BLOCK_PHRASE);
	});
});
