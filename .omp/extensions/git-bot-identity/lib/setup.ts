/**
 * Interactive setup for git-bot-identity.
 *
 * Setup is the human-facing flow that writes the otherwise hand-authored
 * credential bundle at `<credsDir>/config.json`. It is the ONLY supported way
 * to mint the bot's credentials: the agent never has the human's master token,
 * so the human pastes a fresh PAT and picks the signing key through the TUI.
 *
 * ── Execution boundary (pristine spawn) ─────────────────────────────────────
 * This flow runs through the extension's PRISTINE spawn — the env snapshot
 * captured in `createDefault` BEFORE the omp process env is neutralized. The
 * wizard's `gh`/`gpg` subprocesses (token validation, key generation, GitHub
 * key registration) therefore run with real credentials and real PATH, never
 * through the neutralized env or the guidance shim. Callers must pass exactly
 * that spawn; never the agent bash tool, whose writes this extension blocks.
 *
 * ── Hard vs soft gates ──────────────────────────────────────────────────────
 * Two steps HARD-fail (abort, write nothing): PAT validation against
 * `gh api user`, and a real gpg signing smoke test with the resolved key — a
 * bot that cannot sign or whose token is dead must not be persisted as
 * "configured". The remaining step — registering the signing key's public half
 * on GitHub — is SOFT: a failure warns the human and prints the armored key to
 * paste manually, because setup must not be a write-order dependency on GitHub
 * reachability.
 *
 * The wizard is fail-closed at the boundary too: `runSetup` returns `true`
 * ONLY when a config.json was actually written. Empty/cancel on the PAT, a
 * failed hard gate, or a canceled signing choice all return `false` with
 * nothing persisted.
 */

import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionCommandContext, ExtensionContext, ExtensionUIContext, SessionStartEvent } from "@oh-my-pi/pi-coding-agent";
import { CONFIG_FILE, expandTilde, loadBotConfig, type SpawnFn } from "./config";
import { ensureBotKey, exportBotSecretKey, importBotKey } from "./gpg";

/** Directory mode for the credential home; file mode for secrets (config, keys). */
const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

/** Shape of the wizard's injectable dependencies (tests never shell out). */
export interface SetupDeps {
	ui: ExtensionUIContext;
	spawn: SpawnFn;
	credsDir: string;
}

/** Structural surface of ExtensionAPI the setup wiring needs (kept narrow for tests). */
export interface SetupHookApi {
	registerCommand(
		name: string,
		options: { description?: string; handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> },
	): void;
	on(event: "session_start", handler: (event: SessionStartEvent, ctx: ExtensionContext) => void | Promise<void>): void;
}

/** Mask a token for display: keep a tiny prefix + last 4, never the secret body. */
function maskToken(token: string): string {
	if (token.length <= 8) return "***";
	return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

/**
 * Normalize a GPG fingerprint for comparison: drop whitespace and any leading
 * `0x`, upper-case. GitHub's `public_key_fingerprint` is uppercase hex with no
 * `0x`; local key IDs may carry either, so compare on the normalized form only.
 */
function normalizeFingerprint(fp: string): string {
	return fp.replace(/[\s0x]/gi, "").toUpperCase();
}

/**
 * Check whether the bot's expected signing-UID email is a verified email on one
 * of the account's registered GPG keys, via the PUBLIC (no-auth) user endpoint
 * `GET /users/{login}/gpg_keys`. No token leaves the harness here — the route
 * needs none, and `spawn` is the pristine-spawn arg so a neutralized env can't
 * break the request.
 *
 * Why this exists: a bot can upload a correctly-formed key whose UID email is
 * nevertheless NOT a verified email on the account, and every committing sign
 * then shows `verified: false, reason: "bad_email"` — the local key, keyring,
 * and UID are all good, only the account-side email-verification link is
 * missing. Setup should catch that instead of letting it surface on the first
 * commit. Data only: this NEVER shows dialogs (callers own the messaging).
 *
 * Matching: when `fingerprint` is given it must match `public_key_fingerprint`
 * (normalized); otherwise every key is scanned. `unverified` collects each
 * matching key's email that equals `expectEmail` (case-insensitive) but is not
 * verified. `ok` is true only when `expectEmail` is present among the matching
 * keys and none of its occurrences are unverified; a present-but-verified
 * variant wins. `ok=false, unverified=[]` means the UID email was NOT found on
 * any matching key (key uploaded under the wrong UID / upload failed).
 *
 * `checked=false` means the API request failed or its body didn't parse as an
 * array — callers then fall back to a generic manual-verify warning only.
 */
export async function checkKeyEmailVerified(
	login: string,
	fingerprint: string | undefined,
	expectEmail: string,
	spawn: SpawnFn,
): Promise<{ ok: boolean; unverified: string[]; checked: boolean }> {
	const res = await spawn(["curl", "-fsS", `https://api.github.com/users/${login}/gpg_keys`]);
	if (res.exitCode !== 0) return { ok: false, unverified: [], checked: false };
	let keys: { public_key_fingerprint?: string; emails?: { email?: string; verified?: boolean }[] }[];
	try {
		const parsed: unknown = JSON.parse(res.stdout);
		if (!Array.isArray(parsed)) return { ok: false, unverified: [], checked: false };
		keys = parsed as typeof keys;
	} catch {
		return { ok: false, unverified: [], checked: false };
	}

	// Which keys count: the one matching the resolved fingerprint, else all keys.
	// The PUBLIC endpoint omits `public_key_fingerprint` (it exists only on the
	// authenticated /user/gpg_keys), and callers may pass a 16-char keyid from
	// findSecretKey — not a 40-char fingerprint. If no usable fingerprint is
	// available, fall back to scanning ALL of the account's keys: the check's
	// purpose is "is expectEmail a verified email on this account", which holds
	// account-wide. Scanning all keys can false-positive only if the email is
	// verified on a DIFFERENT key of the same account — which still satisfies
	// GitHub's rule.
	const wantFpr = normalizeFingerprint(fingerprint ?? "");
	const matched =
		wantFpr.length === 40
			? keys.filter(k => normalizeFingerprint(k.public_key_fingerprint ?? "") === wantFpr)
			: keys;

	let present = false; // expectEmail appears somewhere among matched keys
	const unverified: string[] = [];
	for (const k of matched) {
		for (const e of k.emails ?? []) {
			if (!e.email) continue;
			if (e.email.toLowerCase() === expectEmail.toLowerCase()) {
				present = true;
				if (e.verified !== true) unverified.push(e.email);
			}
		}
	}
	return { ok: present && unverified.length === 0, unverified, checked: true };
}

/** The wizard. Returns true iff a config.json was written. */
export async function runSetup(deps: SetupDeps): Promise<boolean> {
	const { ui, spawn, credsDir } = deps;
	const gnupgHome = join(credsDir, "gnupg");

	/** Fields being assembled; persisted at the end iff all required are present. */
	const acc: {
		name: string | undefined;
		email: string | undefined;
		token: string | undefined;
		signingKey: string | undefined;
		signingKeyFile: string | undefined;
	} = { name: undefined, email: undefined, token: undefined, signingKey: undefined, signingKeyFile: undefined };

	// ── shared sub-steps (used by both fresh setup and per-item reconfigure) ──

	/** Step 3 (hard gate): validate the PAT against the GitHub API and keep it. */
	async function fetchUser(token: string): Promise<Record<string, unknown> | null> {
		const { exitCode, stdout } = await spawn(["gh", "api", "user"], { GH_TOKEN: token });
		if (exitCode !== 0) return null;
		try {
			return JSON.parse(stdout) as Record<string, unknown>;
		} catch {
			return null;
		}
	}

	/** Step 2+3: prompt for a PAT, validate it. Empty/cancel or invalid → false. */
	async function rotatePat(): Promise<boolean> {
		// Masked-PAT entry is deliberately out of scope for v1: the token is
		// visible while typing and the dialog clears on submit — say so up front.
		// Steer to a classic PAT: the agent is a collaborator on repos it does not
		// own, and a fine-grained token cannot write to a repo owned by a different
		// personal account, so it fails 403 on push (README §2 has the full why).
		ui.notify("Use a CLASSIC PAT with the `repo` scope (add `workflow` only if the agent pushes .github/workflows/ changes). A fine-grained token can't write to a repo owned by another personal account, even as a collaborator.", "info");
		ui.notify("Your token is visible while you type; the dialog clears on submit.", "warning");
		const raw = await ui.input("Agent account Personal Access Token (classic, `repo` scope)", "ghp_…");
		const token = (raw ?? "").trim();
		if (token === "") return false; // empty/cancel → abort, write nothing
		const user = await fetchUser(token);
		if (!user) {
			ui.notify("Token validation failed: `gh api user` returned a non-zero exit or unparseable JSON.", "error");
			return false;
		}
		acc.token = token;
		return true;
	}

	/**
	 * Step 4: derive the identity from the validated user (name from `name`/`login`,
	 * the id-based noreply email), then let the human override each. The email is
	 * load-bearing — it must equal the GPG key UID email for the Verified badge.
	 */
	async function rederiveIdentity(): Promise<boolean> {
		if (!acc.token) return false;
		const user = await fetchUser(acc.token);
		if (!user) {
			ui.notify("Could not derive identity: `gh api user` failed.", "error");
			return false;
		}
		const login = typeof user["login"] === "string" ? (user["login"] as string) : "";
		const rawName = user["name"];
		const derivedName = typeof rawName === "string" && rawName !== "" ? rawName : login;
		const derivedEmail = `${String(user["id"])}+${login}@users.noreply.github.com`;
		const nameInput = (await ui.input(`Agent commit name (blank = ${derivedName})`, derivedName)) ?? "";
		acc.name = (nameInput.trim() === "" ? derivedName : nameInput).trim();

		const emailInput = (await ui.input(`Agent commit email (blank = ${derivedEmail})`, derivedEmail)) ?? "";
		acc.email = (emailInput.trim() === "" ? derivedEmail : emailInput).trim();
		return true;
	}

	/** Export a chosen keyring secret key into the bot home, then import it. */
	async function importFromKeyring(): Promise<string | undefined> {
		const { exitCode, stdout } = await spawn(["gpg", "--batch", "--with-colons", "--list-secret-keys"]);
		if (exitCode !== 0) {
			ui.notify("Could not list your gpg secret keys (`--list-secret-keys` failed).", "error");
			return undefined;
		}
		const keys: { fpr: string; label: string }[] = [];
		const lines = stdout.split("\n");
		for (const [i, line] of lines.entries()) {
			const fields = line.split(":");
			const fpr = fields[4];
			if (fields[0] !== "sec" || !fpr) continue;
			let label = fpr;
			for (let j = i + 1; j < lines.length; j++) {
				const next = lines[j]!.split(":");
				if (next[0] === "sec") break;
				const uid = next[9];
				if (next[0] === "uid" && uid) {
					label = uid;
					break;
				}
			}
			keys.push({ fpr, label });
		}
		if (keys.length === 0) {
			ui.notify("No secret keys found in your gpg keyring.", "warning");
			return undefined;
		}
		const choices = keys.map(k => `${k.label} (${k.fpr})`);
		const choice = await ui.select("Choose a secret key to sign with", choices);
		if (!choice) return undefined;
		const idx = choices.indexOf(choice);
		const chosen = idx >= 0 ? keys[idx] : undefined;
		if (!chosen) return undefined;

		// Export the chosen SECRET key to the bot home (0600, never the human
		// keyring mutated), then import it into the isolated bot keyring.
		const exportRes = await spawn(
			["gpg", "--batch", "--pinentry-mode", "loopback", "--passphrase", "", "--armor", "--export-secret-keys", chosen.fpr],
		);
		if (exportRes.exitCode !== 0) {
			ui.notify(`Failed to export the secret key from your gpg keyring (exit ${exportRes.exitCode}): ${exportRes.stderr.trim() || exportRes.stdout.trim()}`, "error");
			return undefined;
		}
		const outPath = join(credsDir, "signing-key.asc");
		writeFileSync(outPath, exportRes.stdout, { mode: FILE_MODE });
		const imported = await importBotKey(credsDir, outPath, spawn);
		return imported.keyId;
	}

	/** Step 7 (soft): register the key's public half on GitHub; never aborts. */
	async function registerPublicKey(keyId: string, login: string, expectEmail: string): Promise<void> {
		const exportRes = await spawn(["gpg", "--armor", "--export", keyId], { GNUPGHOME: gnupgHome });
		if (exportRes.exitCode !== 0 || exportRes.stdout.trim() === "") {
			ui.notify("Signing key is ready, but its public key could not be exported for GitHub registration.", "warning");
			return;
		}
		const pub = exportRes.stdout;
		const res = await spawn(
			["gh", "api", "--method", "POST", "user/gpg_keys", "-f", `armored_public_key=${pub}`],
			{ GH_TOKEN: acc.token! },
		);
		if (res.exitCode !== 0) {
			ui.notify("Could not register the signing key on GitHub automatically — paste the public key below at https://github.com/settings/keys.", "warning");
			// Print the armor so the human can paste it manually. Setup continues.
			ui.notify(pub, "warning");
			return;
		}

		// POST succeeded. Now check whether the UID email will actually be a
		// verified email on the account — see checkKeyEmailVerified's rationale
		// (the bad_email incident). This is still soft: failures only warn.
		const check = await checkKeyEmailVerified(login, keyId, expectEmail, spawn);
		if (!check.checked) {
			// Couldn't read the key list at all — fall back to the manual-verify
			// guidance instead of guessing at the badge state.
			ui.notify(
				`Signing key uploaded, but GitHub's key list could not be read — verify the email linkage manually at https://github.com/settings/keys.`,
				"warning",
			);
			return;
		}
		if (!check.ok) {
			ui.notify(
				`Signing key uploaded, but the UID email ${expectEmail} is not a verified email on the GitHub account ${login} — commits will show "The email in this signature doesn't match the committer email" until it is. Fix: sign in as ${login} → Settings → Emails → enable "Keep my email addresses private" (and confirm the account's primary email), then use "Re-register signing key on GitHub" in /git-bot-setup.`,
				"warning",
			);
			return;
		}
		ui.notify("Verified-badge prerequisites look good.", "info");
	}

	/**
	 * The account login, derived from `gh api user` exactly as rotatePat validates
	 * the PAT — used to address the PUBLIC gpg_keys endpoint for the badge check.
	 */
	async function currentLogin(): Promise<string | undefined> {
		if (!acc.token) return undefined;
		const user = await fetchUser(acc.token);
		return user && typeof user["login"] === "string" ? (user["login"] as string) : undefined;
	}

	/**
	 * Delete any already-uploaded GitHub GPG key whose fingerprint matches the
	 * bot's, so a re-add refreshes the UID-email link. Community-corroborated
	 * behavior: an email verified AFTER a key was uploaded does not refresh the
	 * stored copy — the key must be deleted and re-added for the UID-email link
	 * to register. Soft-fail like the rest of registerPublicKey: if enumeration
	 * or deletion fails we proceed to the POST anyway. Skipped entirely when no
	 * matching key exists (e.g. first registration).
	 */
	async function deleteMatchingRegisteredKeys(keyId: string): Promise<void> {
		const want = normalizeFingerprint(keyId);
		const list = await spawn(["gh", "api", "/user/gpg_keys"], { GH_TOKEN: acc.token! });
		if (list.exitCode !== 0) return;
		let keys: { id: number; public_key_fingerprint?: string }[];
		try {
			const parsed: unknown = JSON.parse(list.stdout);
			if (!Array.isArray(parsed)) return;
			keys = parsed as typeof keys;
		} catch {
			return;
		}
		for (const k of keys) {
			if (typeof k?.id !== "number" || !k.public_key_fingerprint) continue;
			if (normalizeFingerprint(k.public_key_fingerprint) === want) {
				await spawn(["gh", "api", "--method", "DELETE", `user/gpg_keys/${k.id}`], { GH_TOKEN: acc.token! });
			}
		}
	}

	/**
	 * Step 5+6: choose a signing method, resolve the key, then HARD-gate with a
	 * real signing smoke test using the resolved key inside the bot keyring.
	 * On success also SOFT-registers the public half. Returns false to fail-closed.
	 */
	/**
	 * Step 6: with the key resolved into the bot keyring, ask where the secret
	 * should live — an armored FILE in the bot home (portable across hosts/CI)
	 * or ONLY in the isolated bot keyring (no extra secret file on disk).
	 * Applies the choice to `acc` and the filesystem, cleaning up any stale or
	 * intermediate `signing-key.asc`. Returns false if canceled (fail closed).
	 */
	async function askStorageDest(keyId: string): Promise<boolean> {
		const outPath = join(credsDir, "signing-key.asc");
		const storage = await ui.select("Where should the signing secret live?", [
			{
				label: "Save to a file",
				description:
					"Armored secret key written to <credsDir>/signing-key.asc — portable, so the same key can be provisioned on other hosts/CI by copying the file contents (e.g. into Coder secrets) instead of generating a new key per host.",
			},
			{
				label: "Keep in the keyring only",
				description:
					"The secret never leaves the isolated local keyring — no extra secret file on disk, but nothing to migrate: a new host means generating a new key and registering its public half on GitHub again.",
			},
		]);
		if (storage === undefined) return false; // canceled → fail closed, nothing persisted
		if (storage === "Save to a file") {
			let armor: string;
			try {
				armor = await exportBotSecretKey(credsDir, keyId, spawn);
			} catch (err) {
				ui.notify(`Exporting the signing secret failed: ${err instanceof Error ? err.message : String(err)}`, "error");
				return false;
			}
			writeFileSync(outPath, armor, { mode: FILE_MODE });
			acc.signingKey = undefined;
			acc.signingKeyFile = outPath;
			ui.notify(`Signing secret saved to ${outPath} (armored, 0600).`, "info");
		} else {
			// "Keep in the keyring only" — the secret stays in the bot keyring;
			// drop any stale secret file so nothing secret lingers on disk.
			acc.signingKey = keyId;
			acc.signingKeyFile = undefined;
			rmSync(outPath, { force: true });
		}
		return true;
	}

	async function changeSigning(): Promise<boolean> {
		const choice = await ui.select("Signing key", ["Generate a new key", "Import from a file", "Use a key from my gpg keyring"]);

		let keyId: string | undefined;
		if (choice === "Generate a new key") {
			const r = await ensureBotKey(credsDir, acc.email!, spawn);
			keyId = r.keyId;
		} else if (choice === "Import from a file") {
			const path = ((await ui.input("Path to armored, passphrase-less secret key")) ?? "").trim();
			if (path === "") {
				ui.notify("Key import aborted — no path given.", "warning");
				return false;
			}
			// Expand `~` so the imported path (and the copy recorded to config.json)
			// both work — gpg is not a shell and never expands `~`.
			const expandedPath = expandTilde(path);
			const r = await importBotKey(credsDir, expandedPath, spawn);
			keyId = r.keyId;
			acc.signingKey = undefined;
			acc.signingKeyFile = expandedPath;
		} else if (choice === "Use a key from my gpg keyring") {
			keyId = await importFromKeyring();
			if (!keyId) return false;
		} else {
			return false; // canceled the signing choice
		}

		// HARD gate: actually sign throwaway data with the resolved key in the
		// bot keyring. The SpawnFn contract has no stdin channel, so feed the data
		// as a temp file argument rather than piping echo — same gate, deterministic.
		const inputFile = join(credsDir, ".sign-test");
		writeFileSync(inputFile, "test\n", { mode: FILE_MODE });
		const smoke = await spawn(
			["gpg", "--batch", "--pinentry-mode", "loopback", "--passphrase", "", "--local-user", keyId!, "--sign", inputFile],
			{ GNUPGHOME: gnupgHome },
		);
		rmSync(inputFile, { force: true });
		rmSync(`${inputFile}.gpg`, { force: true });
		if (smoke.exitCode !== 0) {
			ui.notify(`Signing smoke test failed (gpg --sign exited ${smoke.exitCode}): ${smoke.stderr.trim() || smoke.stdout.trim()}`, "error");
			return false;
		}

		// Storage-destination choice (skipped for import-from-a-file — it is
		// already file-based). Asked after the smoke gate, before registering.
		if (choice !== "Import from a file") {
			if (!(await askStorageDest(keyId!))) return false;
		}

		const login = (await currentLogin()) ?? "";
		await registerPublicKey(keyId!, login, acc.email!);
		return true;
	}

	/**
	 * Reconfigure: convert the CURRENT bot signing key to file storage in place —
	 * no regeneration, no GitHub call (the public half is already registered and
	 * stays valid because it is the same key). Writes the armored secret to
	 * <credsDir>/signing-key.asc and flips `acc` to file storage.
	 */
	async function exportCurrentSigningKey(): Promise<void> {
		if (acc.signingKeyFile !== undefined) {
			ui.notify(`Signing key is already file-based: ${acc.signingKeyFile}.`, "info");
			return;
		}
		const keyId = acc.signingKey;
		if (!keyId) {
			ui.notify("No signing key is set to export.", "error");
			return;
		}
		const outPath = join(credsDir, "signing-key.asc");
		let armor: string;
		try {
			armor = await exportBotSecretKey(credsDir, keyId, spawn);
		} catch (err) {
			ui.notify(`Exporting the signing secret failed: ${err instanceof Error ? err.message : String(err)}`, "error");
			return;
		}
		writeFileSync(outPath, armor, { mode: FILE_MODE });
		acc.signingKey = undefined;
		acc.signingKeyFile = outPath;
		ui.notify(`Signing secret exported to ${outPath} — same key, so the public half already registered on GitHub stays valid.`, "info");
	}

	/**
	 * Reconfigure-only: re-push the CURRENT bot key's public half to GitHub — the
	 * remediation step after a bad_email badge failure (the UID email is correct
	 * locally but was never a verified email on the account). It deliberately does
	 * NOT generate or import any foreign key material: it resolves the existing
	 * keyId (from `acc.signingKey`, or by re-importing the armored signingKeyFile
	 * so its fingerprint is known), deletes any already-uploaded matching key so
	 * the re-add refreshes the UID-email link, then re-registers. Soft-fail — the
	 * human can always paste the armor manually from the warning path.
	 */
	async function reregisterSigningKey(): Promise<void> {
		if (acc.signingKey === undefined && acc.signingKeyFile === undefined) {
			ui.notify("No signing key is set to re-register — configure a signing key first.", "error");
			return;
		}
		if (!acc.token) {
			ui.notify("No token to register with — rotate the PAT first.", "warning");
			return;
		}
		let keyId = acc.signingKey;
		if (keyId === undefined) {
			// Re-import the existing armored secret so we know its fingerprint for
			// the delete-match and the (never-downloaded) public half — this is the
			// bot's own key, never foreign material.
			keyId = (await importBotKey(credsDir, acc.signingKeyFile!, spawn)).keyId;
		}
		const login = (await currentLogin()) ?? "";
		// See deleteMatchingRegisteredKeys: an email verified after upload doesn't
		// refresh the stored link; delete-then-re-add fixes it.
		await deleteMatchingRegisteredKeys(keyId);
		await registerPublicKey(keyId, login, acc.email!);
	}
	// ── top-level flow ────────────────────────────────────────────────────────

	const existing = await loadBotConfig(credsDir, spawn);

	if (existing) {
		// Reconfigure: seed the current values (redacted — never print a full
		// token) and offer per-item actions in a loop.
		acc.name = existing.name;
		acc.email = existing.email;
		acc.token = existing.token;
		acc.signingKey = existing.signingKey;
		acc.signingKeyFile = existing.signingKeyFile;
		ui.notify(
			`git-bot-identity is configured: ${existing.name} <${existing.email}> · token ${maskToken(existing.token)} · key ${existing.signingKey ?? existing.signingKeyFile ?? "(auto)"}`,
			"info",
		);
		while (true) {
			const action = await ui.select("git-bot-identity is configured — change something?", [
				"Rotate PAT",
				"Change signing key",
				"Export current signing key to a file",
				"Re-register signing key on GitHub",
				"Re-derive identity",
				"Done/abort",
			]);
			if (action === undefined || action === "Done/abort") break;
			if (action === "Rotate PAT") await rotatePat();
			else if (action === "Change signing key") await changeSigning();
			else if (action === "Export current signing key to a file") await exportCurrentSigningKey();
			else if (action === "Re-register signing key on GitHub") await reregisterSigningKey();
			else if (action === "Re-derive identity") await rederiveIdentity();
		}
	} else {
		// Fresh setup: PAT → identity → signing (each a hard gate in turn).
		if (!(await rotatePat())) {
			ui.notify("Setup aborted — no token entered.", "warning");
			return false;
		}
		if (!(await rederiveIdentity())) return false;
		if (!(await changeSigning())) return false;
	}

	// Step 8: persist as pretty JSON, 0600. Warn if we tightened a looser file.
	if (!acc.name || !acc.email || !acc.token) {
		ui.notify("git-bot-identity setup incomplete — nothing written.", "error");
		return false;
	}
	mkdirSync(credsDir, { recursive: true, mode: DIR_MODE });
	const configPath = join(credsDir, CONFIG_FILE);
	const existed = existsSync(configPath);
	let priorMode: number | undefined;
	if (existed) {
		try {
			priorMode = statSync(configPath).mode & 0o777;
		} catch {
			/* ignore: race with a concurrent delete */
		}
	}
	// Exactly one of signingKey | signingKeyFile is recorded, as chosen.
	const cfg: Record<string, string> = { name: acc.name, email: acc.email, token: acc.token };
	if (acc.signingKey !== undefined) cfg.signingKey = acc.signingKey;
	else if (acc.signingKeyFile !== undefined) cfg.signingKeyFile = acc.signingKeyFile;
	writeFileSync(configPath, JSON.stringify(cfg, null, 2) + "\n", { mode: FILE_MODE });
	if (existed && priorMode !== undefined && priorMode !== FILE_MODE) {
		ui.notify(`git-bot-identity config already existed with looser permissions (0${priorMode.toString(8)}); rewrote it with 0600.`, "warning");
	}
	ui.notify("git-bot-identity configured.", "info");
	return true;
}

/**
 * On-launch nudge: when no config exists, drop a non-blocking notification
 * pointing the human at `/git-bot-setup`. Deliberately NOT a dialog — omp
 * presents at most one extension dialog at a time, so an auto-opening launch
 * dialog would occupy that single slot and starve the `/git-bot-setup` command's
 * own dialogs (they queue invisibly behind it). A notification also keeps the
 * `session_start` handler off the SDK's 30s handler-timeout hook — it never
 * blocks on human input. The interactive wizard lives solely in the command.
 * Exported so tests can drive it directly.
 */
export async function notifyIfUnconfigured(deps: SetupDeps): Promise<void> {
	const { ui, spawn, credsDir } = deps;
	const config = await loadBotConfig(credsDir, spawn);
	if (config !== null) return;
	ui.notify("git-bot-identity isn't configured — run /git-bot-setup to set up the agent account.", "warning");
}

/**
 * Wire setup into the extension: register the `/git-bot-setup` command (the sole
 * interactive wizard entry point) and a `session_start` nudge that notifies the
 * human to run it when no config exists. The wizard must receive the PRISTINE
 * spawn — see the execution-boundary note at the top of this file.
 */
export function installSetup(pi: SetupHookApi, opts: { credsDir: string; spawn: SpawnFn }): void {
	const { credsDir, spawn } = opts;

	pi.registerCommand("git-bot-setup", {
		description: "Interactively configure the git-bot agent account (PAT, identity, GPG signing key).",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			await runSetup({ ui: ctx.ui, spawn, credsDir });
		},
	});

	pi.on("session_start", async (_event: SessionStartEvent, ctx: ExtensionContext) => {
		// Only nudge in the interactive TUI where the notification surface exists;
		// never in rpc/json/print. This handler shows NO dialog, so it neither trips
		// the 30s handler timeout nor occupies omp's single dialog slot.
		if (ctx.mode !== "tui" || !ctx.hasUI) return;
		await notifyIfUnconfigured({ ui: ctx.ui, spawn, credsDir });
	});
}
