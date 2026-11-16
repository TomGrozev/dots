/**
 * Bot environment composition for write-class git/gh calls.
 *
 * Identity precedence (strongest → weakest): GIT_AUTHOR_NAME and GIT_COMMITTER_NAME env
 * beats every git config scope, so repo-local `user.name` can never override
 * the bot. Transport and identity are expressed entirely through git's
 * command-line config scope env vars (GIT_CONFIG_COUNT / GIT_CONFIG_KEY_n /
 * GIT_CONFIG_VALUE_n), which git applies at `-c` precedence — above global and
 * repo config — so `url.<https-with-token>.insteadOf` makes existing SSH remotes
 * go HTTPS-with-token for omp's calls only. No per-call config file is written;
 * the token never lands on disk.
 *
 * The Co-authored-by trailer is NOT an env var — git has no trailer env. It is
 * injected by a bot-scoped `prepare-commit-msg` hook pointed at via
 * `core.hooksPath` on the same command-line config scope.
 *
 * GPG signing: bot commits are signed with the bot's OWN passphrase-less key
 * (see lib/gpg.ts). GNUPGHOME is pointed at the bot home and `signingkey` /
 * `commit.gpgsign` are set on the command-line scope, so the human's keyring
 * and git config are completely shadowed — git only ever sees the bot key. No
 * pinentry is needed (the key is passphrase-less), so there is no GPG_TTY
 * passthrough. If signing fails, the write fails — we never fall back to an
 * unsigned commit or the human key.
 *
 * fail-closed wiring lives one layer up: env building only happens after the
 * agent credentials have been verified present.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface BotEnvConfig {
	/** Agent account display name; used for author/committer. */
	name: string;
	/** Agent account email (the GPG key UID email for Verified). */
	email: string;
	/** Human login for the co-author trailer, e.g. `TomGrozev`. */
	humanName: string;
	/** Human numeric-id noreply, e.g. `1234567+TomGrozev@users.noreply.github.com`. */
	humanNoreply: string;
	/** Personal Access Token for the agent account (static, from config.json). */
	token: string;
	/** Bot GPG signing key id; when present, bot commits are signed with it. */
	signingKey?: string;
}

/** Bot scratch/config dir. GIT_BOT_CONFIG_DIR overrides it — used by tests to
 * redirect all scaffold writes away from the production path. Resolved at
 * call time (not module init) so test setup can set the env var first. */
export function botConfigDir(): string {
	return process.env.GIT_BOT_CONFIG_DIR ?? join(homedir(), ".config", "git-bot-identity");
}

/**
 * Compose the env overlay applied to a write-class call. Every entry is additive;
 * the caller merges over the tool call's existing env.
 */
export function coAuthorTrailer(config: BotEnvConfig): string {
	return `Co-authored-by: ${config.humanName} <${config.humanNoreply}>`;
}

export function buildBotEnv(config: BotEnvConfig): Record<string, string> {
	const coAuthor = coAuthorTrailer(config);
	const tokenInsteadOf = `url.https://x-access-token:${config.token}@github.com/.insteadOf`;
	// All bot-scoped git config rides the command-line scope (GIT_CONFIG_*),
	// which git applies at `-c` precedence — above global and repo config. This
	// keeps repo-local `user.*` from overriding the bot, forces the co-author
	// hook path over any repo hooks, and avoids writing the token to disk: no
	// per-call config file exists to race a read against a write or to leak.
	const pairs: Array<[string, string]> = [
		["user.name", config.name],
		["user.email", config.email],
	];
	if (config.signingKey) {
		pairs.push(["user.signingkey", config.signingKey], ["commit.gpgsign", "true"]);
	}
	pairs.push(
		[tokenInsteadOf, "git@github.com:"],
		[tokenInsteadOf, "ssh://git@github.com/"],
		["core.hooksPath", join(botConfigDir(), "hooks")],
	);

	const env: Record<string, string> = {
		// Static, credential-less deny config (written once by createDefault;
		// see lib/neutralize.ts), so the human's global git config stays
		// shadowed. Never per-call, never holds a secret.
		GIT_CONFIG_GLOBAL: join(botConfigDir(), "deny-gitconfig"),
		GIT_CONFIG_COUNT: String(pairs.length),
		GNUPGHOME: join(botConfigDir(), "gnupg"),
		GIT_AUTHOR_NAME: config.name,
		GIT_AUTHOR_EMAIL: config.email,
		GIT_COMMITTER_NAME: config.name,
		GIT_COMMITTER_EMAIL: config.email,
		GH_TOKEN: config.token,
		GH_ENTERPRISE_TOKEN: "",
		GIT_TERMINAL_PROMPT: "0",
		GIT_BOT_COAUTHOR: coAuthor,
	};
	pairs.forEach(([key, value], i) => {
		env[`GIT_CONFIG_KEY_${i}`] = key;
		env[`GIT_CONFIG_VALUE_${i}`] = value;
	});
	return env;
}

/**
 * Env for omp's in-process native commit path (`/commit` and eval `commit`).
 * That path does not run a `git` child, so the shim and `buildBotEnv` cannot
 * reach it; it reads identity and signing from the process environment and git
 * config directly. This overlay carries identity, signing, and the co-author
 * trailer marker, but deliberately no PAT.
 */
export function buildBotCommitEnv(config: BotEnvConfig): Record<string, string> {
	const pairs: Array<[string, string]> = [
		["user.name", config.name],
		["user.email", config.email],
	];
	if (config.signingKey) {
		pairs.push(["user.signingkey", config.signingKey], ["commit.gpgsign", "true"]);
	} else {
		// The native path also reads the human's global config. Force signing
		// off so a human signing key is never pulled into a bot commit.
		pairs.push(["commit.gpgsign", "false"]);
	}
	pairs.push(["core.hooksPath", join(botConfigDir(), "hooks")]);

	const env: Record<string, string> = {
		GIT_CONFIG_COUNT: String(pairs.length),
		GNUPGHOME: join(botConfigDir(), "gnupg"),
		GIT_AUTHOR_NAME: config.name,
		GIT_AUTHOR_EMAIL: config.email,
		GIT_COMMITTER_NAME: config.name,
		GIT_COMMITTER_EMAIL: config.email,
		GIT_BOT_COAUTHOR: coAuthorTrailer(config),
		GIT_BOT_NATIVE: "1",
	};
	pairs.forEach(([key, value], i) => {
		env[`GIT_CONFIG_KEY_${i}`] = key;
		env[`GIT_CONFIG_VALUE_${i}`] = value;
	});
	return env;
}

/**
 * Install the co-author hooks. `prepare-commit-msg` covers git CLI commits;
 * `commit-msg` covers omp's native commit path, which runs that hook but not
 * `prepare-commit-msg`. Both are idempotent: a message that already carries a
 * Co-authored-by line is left alone.
 */
export function installCoauthorHook(config: BotEnvConfig): void {
	const hooksDir = join(botConfigDir(), "hooks");
	const coAuthor = coAuthorTrailer(config);
	const trailer = `if [ -s "$COMMIT_MSG_FILE" ] && [ "$(tail -c 1 "$COMMIT_MSG_FILE" | wc -l)" -eq 0 ]; then
  printf '\\n' >> "$COMMIT_MSG_FILE"
fi
printf '\\n%s\\n' "${coAuthor}" >> "$COMMIT_MSG_FILE"
exit 0
`;
	const prepare = `#!/bin/sh
# Installed by omp git-bot-identity: appends the human co-author trailer.
COMMIT_MSG_FILE="$1"
COMMIT_SOURCE="$2"
# Skip merge/squash and commit-source cases where a trailer would clutter
# rebased history: only fresh commits (standard -m/-F/template paths) get the
# trailer.
case "$COMMIT_SOURCE" in
  merge|squash|commit) exit 0 ;;
esac
if grep -qi "^Co-authored-by:" "$COMMIT_MSG_FILE"; then exit 0; fi
${trailer}`;
	const commitMsg = `#!/bin/sh
# Installed by omp git-bot-identity: appends the human co-author trailer.
COMMIT_MSG_FILE="$1"
# Only the native path runs this hook without prepare-commit-msg. CLI commits
# are handled by prepare-commit-msg and its source rules.
if [ "\${GIT_BOT_NATIVE:-}" != "1" ]; then exit 0; fi
if grep -qi "^Co-authored-by:" "$COMMIT_MSG_FILE"; then exit 0; fi
${trailer}`;
	mkdirSync(hooksDir, { recursive: true, mode: 0o700 });
	writeFileSync(join(hooksDir, "prepare-commit-msg"), prepare, { mode: 0o755 });
	writeFileSync(join(hooksDir, "commit-msg"), commitMsg, { mode: 0o755 });
}
