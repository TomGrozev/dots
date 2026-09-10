/**
 * GitHub App authentication: JWT minting, installation-token minting, and the
 * in-memory token cache with red-zone re-minting. Fail-closed by construction:
 * every mint failure propagates to the caller, which turns it into a blocked
 * tool call — never a silent fallback to the human identity.
 */
import { createSign, generateKeyPairSync, createPrivateKey } from "node:crypto";

/** Mint a throwaway RSA 2048 private key (PKCS#8 PEM) — for tests and onboarding scaffolding. */
export function generatePrivateKeyPEM(): string {
	const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
	return privateKey.export({ type: "pkcs8", format: "pem" }).toString().trim() + "\n";
}

function base64url(input: Buffer | string): string {
	return Buffer.from(input).toString("base64url");
}

/** JWT lifetime: GitHub caps App JWTs at 10 minutes. */
const JWT_TTL_SECONDS = 600;

/** RS256-sign a GitHub App JWT. `appId` is the numeric App ID (iss). */
export function signAppJwt(privateKeyPem: string, appId: string): string {
	const key = createPrivateKey(privateKeyPem); // throws on garbage input — fail closed
	const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
	const now = Math.floor(Date.now() / 1000);
	const payload = base64url(JSON.stringify({ iss: appId, iat: now, exp: now + JWT_TTL_SECONDS }));
	const signer = createSign("RSA-SHA256");
	signer.update(`${header}.${payload}`);
	signer.end();
	const signature = signer.sign(key, "base64url");
	return `${header}.${payload}.${signature}`;
}

export interface MintedToken {
	token: string;
	/** Absolute epoch ms when the installation token expires. */
	expiresAtMs: number;
}

/** Fetch-like callable; loose so tests can pass simple async doubles. */
export type FetchLike = (url: string | URL, init?: RequestInit) => Promise<Response>;

export interface MintOptions {
	jwt: string;
	installationId: string;
	fetchImpl?: FetchLike;
}


/** Default red line: re-mint when less than 10 minutes of token life remain. */
export const RED_ZONE_MS = 10 * 60_000;

/**
 * Exchange a signed App JWT for a short-lived installation token
 * (POST /app/installations/:id/access_tokens). Non-2xx → throws with the
 * status and a body excerpt; the caller fails closed.
 */
export async function mintInstallationToken({ jwt, installationId, fetchImpl = fetch }: MintOptions): Promise<MintedToken> {
	const response = await fetchImpl(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${jwt}`,
			Accept: "application/vnd.github+json",
			"X-GitHub-Api-Version": "2022-11-28",
			"User-Agent": "omp-git-bot-identity",
			"Content-Length": "0",
		},
	});
	if (!response.ok) {
		const body = (await response.text()).slice(0, 200);
		throw new Error(`installation token mint failed: HTTP ${response.status} ${body}`);
	}
	const json = (await response.json()) as { token?: string; expires_at?: string };
	if (!json.token || !json.expires_at) {
		throw new Error("installation token mint failed: response missing token/expires_at");
	}
	return { token: json.token, expiresAtMs: Date.parse(json.expires_at) };
}

/** Abstraction over minting so tests can fake it; production impl lives in config.ts. */
export type TokenMinter = () => Promise<MintedToken>;

/**
 * Process-wide installation-token cache. One in-flight mint at a time (dedup);
 * any mint failure propagates AND clears the cached state so the next get()
 * retries rather than serving a stale value.
 */
export class TokenCache {
	private cached: MintedToken | null = null;
	private inFlight: Promise<string> | null = null;

	constructor(private readonly minter: TokenMinter) {}

	get(): Promise<string> {
		const now = Date.now();
		if (this.cached && this.cached.expiresAtMs - now > RED_ZONE_MS) {
			return Promise.resolve(this.cached.token);
		}
		if (this.inFlight) return this.inFlight;
		this.cached = null;
		this.inFlight = this.minter()
			.then(minted => {
				this.cached = minted;
				return minted.token;
			})
			.finally(() => {
				this.inFlight = null;
			});
		return this.inFlight;
	}
}
