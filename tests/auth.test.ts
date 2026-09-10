import { describe, expect, test } from "bun:test";
import { generatePrivateKeyPEM, signAppJwt, mintInstallationToken, TokenCache, type FetchLike } from "../.omp/extensions/git-bot-identity/lib/auth";
import { createPrivateKey, createPublicKey, createVerify } from "node:crypto";

/** RFC 7515: RS256 over header.payload with PKCS#1 v1.5 and SHA-256. */
function verifyRs256(jwt: string, publicKeyPem: string): { valid: boolean; header?: Record<string, unknown>; payload?: Record<string, unknown> } {
	const [h, p, s] = jwt.split(".");
	if (!h || !p || !s) return { valid: false };
	const data = `${h}.${p}`;
	const sig = Buffer.from(s, "base64url");
	const verifier = createVerify("RSA-SHA256");
	verifier.update(data);
	verifier.end();
	const valid = verifier.verify(createPublicKey(publicKeyPem), sig);
	const header = JSON.parse(Buffer.from(h, "base64url").toString());
	const payload = JSON.parse(Buffer.from(p, "base64url").toString());
	return { valid, header, payload };
}

describe("generatePrivateKeyPEM", () => {
	test("generates a parseable PKCS#8 RSA 2048 key", () => {
		const pem = generatePrivateKeyPEM();
		expect(pem).toContain("BEGIN PRIVATE KEY");
		const key = createPrivateKey(pem);
		expect(key.asymmetricKeyType).toBe("rsa");
		const jwk = key.export({ format: "jwk" }) as { kty: string; n: string };
		expect(jwk.kty).toBe("RSA");
		expect(Buffer.from(jwk.n, "base64url").length * 8).toBe(2048);
	});
});

describe("signAppJwt", () => {
	test("produces a verifiable RS256 JWT with iss/iat/exp and correct alg", () => {
		const pem = generatePrivateKeyPEM();
		const appId = "123456";
		const before = Math.floor(Date.now() / 1000);
		const jwt = signAppJwt(pem, appId);
		const after = Math.floor(Date.now() / 1000);
		const { valid, header, payload } = verifyRs256(jwt, pem);
		expect(valid).toBe(true);
		expect(header?.alg).toBe("RS256");
		expect(header?.typ).toBe("JWT");
		expect(payload?.iss).toBe(appId);
		const iat = payload?.iat as number;
		expect(iat).toBeGreaterThanOrEqual(before);
		expect(payload?.exp).toBe(iat + 600);
		expect(payload?.exp).toBeLessThanOrEqual(after + 600);
	});
	test("rejects a non-RS256-ready garbage key with a thrown error", () => {
		expect(() => signAppJwt("not a pem", "123")).toThrow();
	});
});

describe("mintInstallationToken", () => {
	/** Minimal stand-in for GitHub's JWT check: verifies signature shape via 201 JSON. */
	test("posts the JWT and returns the token with expiry", async () => {
		const pem = generatePrivateKeyPEM();
		const jwt = signAppJwt(pem, "42");
		const fetchCalls: { url: string; init: RequestInit }[] = [];
		const fakeFetch: FetchLike = async (url, init) => {
			fetchCalls.push({ url: String(url), init: init ?? {} });
			return new Response(JSON.stringify({ token: "ghs_installtoken123", expires_at: "2099-01-01T00:00:00Z" }), { status: 201 });
		};
		const result = await mintInstallationToken({
			jwt,
			installationId: "987",
			fetchImpl: fakeFetch,
		});
		expect(result.token).toBe("ghs_installtoken123");
		expect(result.expiresAtMs).toBe(Date.parse("2099-01-01T00:00:00Z"));
		expect(fetchCalls.length).toBe(1);
		expect(fetchCalls[0]?.url).toBe("https://api.github.com/app/installations/987/access_tokens");
		const headers = new Headers(fetchCalls[0]?.init.headers);
		expect(headers.get("Authorization")).toBe(`Bearer ${jwt}`);
		expect(headers.get("Accept")).toBe("application/vnd.github+json");
	});
	test("non-2xx response throws with status and body excerpt", async () => {
		const pem = generatePrivateKeyPEM();
		const jwt = signAppJwt(pem, "42");
		const fakeFetch: FetchLike = async () => new Response(JSON.stringify({ message: "Bad credentials" }), { status: 401 });
		let error: unknown;
		try {
			await mintInstallationToken({ jwt, installationId: "987", fetchImpl: fakeFetch });
		} catch (e) {
			error = e;
		}
		expect(error).toBeInstanceOf(Error);
		expect(String((error as Error).message)).toContain("401");
	});
});

describe("TokenCache", () => {
	test("mints once and reuses within TTL", async () => {
		let mints = 0;
		const cache = new TokenCache(async () => {
			mints++;
			return { token: `t${mints}`, expiresAtMs: Date.now() + 3600_000 };
		});
		expect(await cache.get()).toBe("t1");
		expect(await cache.get()).toBe("t1");
		expect(mints).toBe(1);
	});

	test("re-mints when under 10 minutes remain", async () => {
		let mints = 0;
		const cache = new TokenCache(async () => {
			mints++;
			return { token: `t${mints}`, expiresAtMs: Date.now() + 9 * 60_000 }; // 9 min < red line
		});
		expect(await cache.get()).toBe("t1");
		expect(await cache.get()).toBe("t2");
		expect(mints).toBe(2);
	});

	test("re-mints at exactly 10 minutes (boundary is inside red zone)", async () => {
		let mints = 0;
		const cache = new TokenCache(async () => {
			mints++;
			return { token: `t${mints}`, expiresAtMs: Date.now() + 600_000 };
		});
		await cache.get();
		expect(await cache.get()).toBe("t2");
	});

	test("expired token re-mints", async () => {
		let mints = 0;
		const cache = new TokenCache(async () => {
			mints++;
			return { token: `t${mints}`, expiresAtMs: Date.now() - 1 };
		});
		await cache.get();
		expect(await cache.get()).toBe("t2");
	});

	test("failed mint propagates and CLEARS cache so next get retries", async () => {
		let calls = 0;
		const cache = new TokenCache(async () => {
			calls++;
			if (calls === 1) throw new Error("key unreadable");
			return { token: "t-ok", expiresAtMs: Date.now() + 3600_000 };
		});
		await expect(cache.get()).rejects.toThrow("key unreadable");
		expect(await cache.get()).toBe("t-ok");
	});

	test("concurrent gets share one in-flight mint", async () => {
		let mints = 0;
		const cache = new TokenCache(async () => {
			mints++;
			await Bun.sleep(10);
			return { token: "shared", expiresAtMs: Date.now() + 3600_000 };
		});
		const [a, b, c] = await Promise.all([cache.get(), cache.get(), cache.get()]);
		expect(a).toBe("shared");
		expect(b).toBe("shared");
		expect(c).toBe("shared");
		expect(mints).toBe(1);
	});
});
