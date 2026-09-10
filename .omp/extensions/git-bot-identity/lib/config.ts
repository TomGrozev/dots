/**
 * Bot credential discovery. Reads the human-managed config at
 * ~/.config/git-bot-identity/ (config.json + app.pem) into a typed bundle.
 *
 * Absent or malformed creds are NOT an error — they mean "fail closed on
 * writes" and are reported as `null` so the caller can block with a clear
 * message instead of inventing a fallback identity.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const CONFIG_DIR = join(homedir(), ".config", "git-bot-identity");
export const CONFIG_FILE = "config.json";
export const KEYPATH = "app.pem";

export interface BotConfig {
	appId: string;
	installationId: string;
	/** Bot login including the `[bot]` suffix, e.g. `tomgrozev-dots[bot]`. */
	botSlug: string;
	humanName: string;
	/** Human numeric-id noreply email used for Co-authored-by. */
	humanNoreply: string;
	/** Raw PKCS#8 PEM of the GitHub App private key. */
	privateKeyPem: string;
}

const REQUIRED_KEYS = ["appId", "installationId", "botSlug", "humanName", "humanNoreply"] as const;

/**
 * Load bot credentials from `dir` (readonly injection point; production calls
 * use CONFIG_DIR). Returns null when anything is missing/malformed — decided
 * by the caller to fail closed.
 */
export function loadBotConfig(dir: string = CONFIG_DIR): BotConfig | null {
	let raw: string;
	try {
		raw = readFileSync(join(dir, CONFIG_FILE), "utf8");
	} catch {
		return null;
	}
	let parsed: Record<string, unknown>;
	try {
		parsed = JSON.parse(raw) as Record<string, unknown>;
	} catch {
		return null;
	}
	const fields: Record<string, string> = {};
	for (const key of REQUIRED_KEYS) {
		const value = parsed[key];
		if (typeof value !== "string" || value.trim() === "") return null;
		fields[key] = value;
	}
	let pem: string;
	try {
		pem = readFileSync(join(dir, KEYPATH), "utf8");
	} catch {
		return null;
	}
	if (!pem.includes("BEGIN") || !pem.includes("KEY")) return null;
	return {
		appId: fields["appId"] ?? "",
		installationId: fields["installationId"] ?? "",
		botSlug: fields["botSlug"] ?? "",
		humanName: fields["humanName"] ?? "",
		humanNoreply: fields["humanNoreply"] ?? "",
		privateKeyPem: pem,
	};
}
