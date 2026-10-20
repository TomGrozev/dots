import type { SonioxToken } from "./types.ts";

/**
 * Concatenate token texts into a single plain string.
 *
 * Soniox returns a token array where each token has a `text` field (and
 * optionally speaker/language metadata). OpenWhispr expects a single flat
 * `{text: "..."}` string — no speaker tags, no language markers.
 *
 * Rules:
 * - Concatenate `token.text` in order, skipping missing/empty values.
 * - Collapse internal whitespace runs to a single space.
 * - Trim leading/trailing whitespace.
 */
export function renderTranscript(tokens: SonioxToken[]): string {
  return tokens
    .map((t) => (typeof t.text === "string" ? t.text : ""))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}
