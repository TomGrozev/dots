/**
 * Bot environment composition for write-class git/gh calls.
 *
 * Identity precedence (strongest → weakest): GIT_AUTHOR_NAME and GIT_COMMITTER_NAME env
 * beats every git config scope, so repo-local `user.name` can never override
 * the bot. Transport: `url.<https-with-token>.insteadOf` in bot-scoped config
 * makes existing SSH remotes go HTTPS-with-token — for omp's calls only,
 * because GIT_CONFIG_GLOBAL redirects git's global config to a generated file.
 *
 * The Co-authored-by trailer is NOT an env var — git has no trailer env. It is
 * injected by a bot-scoped `prepare-commit-msg` hook pointed at via
 * `core.hooksPath` on the command-line config scope (GIT_CONFIG_KEY_3 /
 * GIT_CONFIG_VALUE_3, which git applies with -c precedence over repo config).
 *
 * fail-closed wiring lives one layer up: env building only happens after the
 * token has been successfully minted.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface BotEnvConfig {
	/** GitHub App bot login, e.g. `tomgrozev-dots[bot]`. */
	botSlug: string;
	/** Human login for the co-author trailer, e.g. `TomGrozev`. */
	humanName: string;
	/** Human numeric-id noreply, e.g. `1234567+TomGrozev@users.noreply.github.com`. */
	humanNoreply: string;
	/** Installation token (short-lived). */
	token: string;
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
export function buildBotEnv(config: BotEnvConfig): Record<string, string> {
	const botEmail = `${config.botSlug}@users.noreply.github.com`;
	const coAuthor = `Co-authored-by: ${config.humanName} <${config.humanNoreply}>`;
	// The generated global config: token transport + bot identity + no gpg.
	// core.hooksPath is NOT here — repo config would outrank global config for
	// hooksPath, and a repo forcing its own hooks would drop the trailer. The
	// command-line scope (below) outranks repo config, so hooks go there.
	const globalConfig = [
		"[user]",
		`\tname = ${config.botSlug}`,
		`\temail = ${botEmail}`,
		"[url \"https://x-access-token:" + config.token + "@github.com/\"]",
		"\tinsteadOf = git@github.com:",
		"\tinsteadOf = ssh://git@github.com/",
		"[commit]",
		"\tgpgsign = false",
		"[tag]",
		"\tgpgsign = false",
		"[push]",
		"\tgpgsign = false",
		"",
	].join("\n");
	const dir = botConfigDir();
	const globalConfigPath = join(dir, "gitconfig");
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	writeFileSync(globalConfigPath, globalConfig, { mode: 0o600 });
	return {
		GIT_CONFIG_GLOBAL: globalConfigPath,
		GIT_AUTHOR_NAME: config.botSlug,
		GIT_AUTHOR_EMAIL: botEmail,
		GIT_COMMITTER_NAME: config.botSlug,
		GIT_COMMITTER_EMAIL: botEmail,
		// Command-line-scope config (highest precedence, beats repo config):
		// hooks path for the co-author trailer + defense-in-depth no-gpg in case
		// the repo's own config forces signing (a bot author has no key; the
		// human's gpg must never be consulted from an agent run).
		GIT_CONFIG_COUNT: "4",
		GIT_CONFIG_KEY_0: "url.https://x-access-token:" + config.token + "@github.com/.insteadOf",
		GIT_CONFIG_VALUE_0: "git@github.com:",
		GIT_CONFIG_KEY_1: "user.name",
		GIT_CONFIG_VALUE_1: config.botSlug,
		GIT_CONFIG_KEY_2: "commit.gpgsign",
		GIT_CONFIG_VALUE_2: "false",
		GIT_CONFIG_KEY_3: "core.hooksPath",
		GIT_CONFIG_VALUE_3: join(botConfigDir(), "hooks"),
		GH_TOKEN: config.token,
		GH_ENTERPRISE_TOKEN: "",
		GIT_TERMINAL_PROMPT: "0",
		GIT_BOT_COAUTHOR: coAuthor,
	};
}

/**
 * Install the prepare-commit-msg hook that appends the co-author trailer
 * commit-wide. Idempotent: rewrites the hook file on every bot call (cheap,
 * and keeps the trailer in sync with config).
 */
export function installCoauthorHook(config: BotEnvConfig): void {
	const hooksDir = join(botConfigDir(), "hooks");
	const hookPath = join(hooksDir, "prepare-commit-msg");
	const coAuthor = `Co-authored-by: ${config.humanName} <${config.humanNoreply}>`;
	const script = `#!/bin/sh
# Installed by omp git-bot-identity — appends the human co-author trailer.
COMMIT_MSG_FILE="$1"
COMMIT_SOURCE="$2"
# Skip amend/squash merges where a trailer would clutter rebased history:
# only fresh commits (message == HEADS_UP or standard -m/-F/template paths).
case "$COMMIT_SOURCE" in
  merge|commit|squeeze) exit 0 ;;
esac
if grep -qi "^Co-authored-by:" "$COMMIT_MSG_FILE"; then exit 0; fi
printf '%s\\n' "${coAuthor}" >> "$COMMIT_MSG_FILE"
exit 0
`;
	mkdirSync(hooksDir, { recursive: true, mode: 0o700 });
	writeFileSync(hookPath, script, { mode: 0o755 });
}

