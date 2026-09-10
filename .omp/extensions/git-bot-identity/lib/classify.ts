/**
 * Write-detection for git/gh invocations.
 *
 * The classifier is the security seam: it decides whether a bash call carries
 * the bot identity (env injection) or runs untouched. Two failure modes, both
 * bad, solved the same way — fail closed:
 *
 *  1. A write classified as a read → runs with the human's identity (unacceptable).
 *  2. A read classified as a write → creds-absent sessions hard-fail on benign
 *     commands; tolerable only when the command could plausibly hide a write.
 *
 * So: git/gh segments must be PROVEN read-only by an explicit verb allowlist;
 * anything unknown is a write. Non-tool text filters after a bare `|` pipe
 * don't change the class (the tool segment fully determines it), but sequencing
 * connectors (`&&`, `||`, `;`) mixed with a tool segment force the write class —
 * the unclassified side could invoke git itself.
 *
 * Known bypass shapes are handled explicitly: command substitution, process
 * substitution, wrapper commands (env/exec/command/nice/nohup/timeout/time),
 * `xargs git …`, and shell strings (`bash -c 'git push'`). Gross obfuscation
 * beyond these (base64 round-trips, eval of computed strings) is out of scope:
 * the bash tool's own approval layer is the boundary for those.
 */

export type SegmentClass = "read-only" | "write" | "none";

/** git subcommands that provably never mutate refs, index, or working tree. */
const GIT_READONLY = new Set([
	"status",
	"log",
	"diff",
	"show",
	"blame",
	"describe",
	"rev-parse",
	"cat-file",
	"ls-files",
	"ls-remote",
	"ls-tree",
	"help",
	"version",
	"grep",
	"shortlog",
	"whatchanged",
	"archive",
	"count-objects",
]);

/**
 * Global options accepted before the git subcommand. Options ending without a
 * value are one word; value-taking ones (`-C <path>`, `--git-dir <dir>`, `-c
 * <k=v>`) consume the following word — and `--foo=bar` attaches its value.
 */
const GIT_FLAG_WITH_VALUE = new Set(["-C", "--git-dir", "--work-tree", "--namespace", "-c", "--super-prefix"]);



const SHELL_HEADS = new Set(["bash", "sh", "zsh", "dash", "ksh", "eval", "source", "."]);

/**
 * Wrapper commands transparently re-dispatching to the next word. Includes
 * `rtk`: the rtk extension rewrites `git X` → `rtk git X` in its own
 * `tool_call` handler (bound before this extension's — discovery is
 * alphabetical), so every command this classifier sees in an rtk-enabled
 * session carries the prefix. `rtk git status` runs git with our injected
 * env (child process), so classification peels through to the payload.
 */
const WRAPPER_COMMANDS = new Set(["env", "command", "exec", "nice", "nohup", "time", "rtk"]);

/** Wrapper commands consuming their first argument (duration/path) before the payload. */
const WRAPPER_WITH_ARG = new Set(["timeout"]);


/** gh subcommands entirely read-only, or special-cased below. */
const GH_READONLY = new Set(["api", "auth", "browse", "completion", "config", "help", "search", "status", "version", "cache", "codespace", "extension", "gist", "label"]);

/**
 * gh nouns that carry both read and write verbs; only these verbs are reads.
 * e.g. `comment`, `ready`, `create`, `merge` are writes and deliberately absent.
 */
const GH_NOUN_READ_VERBS: Record<string, Set<string>> = {
	pr: new Set(["view", "list", "status", "checks", "diff", "checkout"]),
	issue: new Set(["view", "list", "status"]),
	release: new Set(["view", "list", "download"]),
	run: new Set(["view", "list", "watch", "download"]),
	workflow: new Set(["view", "list"]),
	repo: new Set(["view", "list"]),
	project: new Set(["list", "view"]),
	ruleset: new Set(["list", "view"]),
	"ssh-key": new Set(["list"]),
	"gpg-key": new Set(["list"]),
	template: new Set(["list"]),
};

/** Strip double- and single-quoted regions (replacing their content with spaces). */
function stripQuoted(cmd: string): string {
	let out = "";
	let quote: '"' | "'" | null = null;
	for (const ch of cmd) {
		if (quote === null) {
			if (ch === '"' || ch === "'") {
				quote = ch;
				out += " ";
			} else {
				out += ch;
			}
		} else {
			out += ch === quote ? " " : " ";
			if (ch === quote) quote = null;
		}
	}
	return out;
}

/** Extract the contents of all quoted regions, for substitution/string guards. */
function quotedContents(cmd: string): string[] {
	const contents: string[] = [];
	let quote: '"' | "'" | null = null;
	let current = "";
	for (const ch of cmd) {
		if (quote === null) {
			if (ch === '"' || ch === "'") quote = ch;
		} else if (ch === quote) {
			contents.push(current);
			current = "";
			quote = null;
		} else {
			current += ch;
		}
	}
	// Unterminated quote: scanner would fail at execution anyway; still return it.
	if (quote !== null) contents.push(current);
	return contents;
}


const CONNECTOR_RE = /&&|\|\||;|\|/g;

/**
 * Extract the inner command strings of top-level substitutions in a raw line:
 * `$(…)`, backticks, `<(…)`, `>(…)`. Balances parens so nested `$(… $(…) …)`
 * yields the OUTER string (which is then recursed on, finding the inner one).
 */
function extractSubstitutions(command: string): string[] {
	const results: string[] = [];
	for (let i = 0; i < command.length; i++) {
		const ch = command[i];
		let opener: string | null = null;
		let closer: string | null = null;
		if ((ch === "$" && command[i + 1] === "(") || ch === "<" || ch === ">") {
			if (command[i + 1] === "(" || ch === "<" || ch === ">") {
				opener = ch === "$" ? "$(" : ch;
				closer = ")";
			}
		}
		if (ch === "`") {
			const end = command.indexOf("`", i + 1);
			if (end !== -1) {
				results.push(command.slice(i + 1, end));
				i = end;
			}
			continue;
		}
		if (!opener) continue;
		// For <( and >( ensure the paren follows the angle directly.
		if ((opener === "<" || opener === ">") && command[i + 1] !== "(") continue;
		let depth = 1;
		const start = i + (opener === "$(" ? 2 : 2);
		let j = start;
		for (; j < command.length && depth > 0; j++) {
			const c = command[j];
			if (c === "(") depth++;
			else if (c === ")") depth--;
		}
		if (depth === 0) results.push(command.slice(start, j - 1));
		i = j - 1;
	}
	return results;
}

interface SegmentInfo {
	/** Connector that preceded this segment: "" for the first, or one of `&& || ; |`. */
	connector: string;
	argv: string[];
}

/** Split the (quote-stripped) line into argv segments, remembering the connector before each. */
function splitSegments(cmd: string): SegmentInfo[] {
	const stripped = stripQuoted(cmd);
	const segments: SegmentInfo[] = [];
	let last = 0;
	let connector = "";
	for (const match of stripped.matchAll(CONNECTOR_RE)) {
		const text = stripped.slice(last, match.index ?? 0).trim();
		if (text) segments.push({ connector, argv: text.split(/\s+/) });
		connector = match[0];
		last = (match.index ?? 0) + match[0].length;
	}
	const tail = stripped.slice(last).trim();
	if (tail) segments.push({ connector, argv: tail.split(/\s+/) });
	return segments;
}

/**
 * Decision for one git argv (without the leading "git").
 * Returns the class for known shapes; "write" for unknown ones.
 */
function classifyGit(argv: string[]): SegmentClass | undefined {
	// Skip global options to find the subcommand.
	let index = 0;
	while (index < argv.length) {
		const word = argv[index] ?? "";
		if (word.startsWith("--") && word.includes("=")) {
			index += 1;
		} else if (GIT_FLAG_WITH_VALUE.has(word)) {
			index += 2;
		} else if (word.startsWith("-") && word !== "-") {
			index += 1;
		} else {
			break;
		}
	}
	if (index >= argv.length) return "write"; // flags only, no subcommand
	const sub = argv[index];
	if (!sub) return "write";
	if (sub === "branch") {
		// `git branch` (no args) lists; anything else creates/deletes/renames.
		return argv.length === index + 1 ? "read-only" : "write";
	}
	if (sub === "remote") {
		// `git remote` and `git remote -v` list; `get-url`/`show <n>` read.
		const rest = argv.slice(index + 1).filter(arg => arg !== "-v");
		if (rest.length === 0) return "read-only";
		if (rest[0] === "get-url" || rest[0] === "show") return "read-only";
		return "write";
	}
	if (sub === "config") {
		// Reads only with an explicit read verb or bare flag Shape.
		const rest = argv.slice(index + 1);
		if (rest.length === 0) return "read-only";
		if (rest.some(a => a === "--get" || a === "--get-all" || a === "--list" || a === "--get-regexp" || a === "-l")) return "read-only";
		if (rest.every(a => a.startsWith("-"))) return "read-only";
		return "write";
	}
	if (sub === "reflog") {
		// `git reflog` / `git reflog show <ref>` read; delete/expire/write write.
		const rest = argv.slice(index + 1);
		return (rest.length === 0 || rest[0] === "show") && rest.every(a => !a.startsWith("-") || a === "--no-abbrev" || a === "--date") ? "read-only" : "write";
	}
	if (GIT_READONLY.has(sub)) return "read-only";
	return "write";
}

/**
 * Decision for one gh argv (without the leading "gh").
 * Returns the class for known shapes; "write" for unknown ones.
 */
function classifyGh(argv: string[]): SegmentClass | undefined {
	const sub = argv[0];
	if (!sub) return "write";
	if (GH_READONLY.has(sub)) {
		if (sub === "api") {
			// Only GET (explicit or default) is a read.
			let method: string | undefined;
			for (let i = 0; i < argv.length; i++) {
				const arg = argv[i] ?? "";
				if (arg === "-X" || arg === "--method" || arg === "--request") {
					method = argv[i + 1];
				} else if (arg.startsWith("--method=") || arg.startsWith("--request=")) {
					method = arg.split("=")[1];
				}
			}
			return method === undefined || /^get$/i.test(method ?? "") ? "read-only" : "write";
		}
		if (sub === "auth" || sub === "config") {
			// Both carry verb writes (login/logout/refresh/token, set).
			const rest = argv.slice(1);
			if (rest.length === 0) return "read-only";
			const writeVerbs = new Set(["login", "logout", "refresh", "token", "switch", "setup-git", "set"]);
			if (rest.some(r => writeVerbs.has(r))) return "write";
			if (rest.every(r => r.startsWith("-") || r === "status" || r === "get")) return "read-only";
			return "write";
		}
		// Nouns with destructive verbs among their shapes.
		const readVerbsByNoun: Record<string, Set<string>> = {
			cache: new Set(["list"]),
			codespace: new Set(["list", "view", "logs"]),
			extension: new Set(["list", "browse"]),
			gist: new Set(["view", "list"]),
			label: new Set(["list"]),
		};
		const readVerbs = readVerbsByNoun[sub];
		if (readVerbs) {
			const rest = argv.slice(1).filter(a => !a.startsWith("-"));
			const verb = rest[0] ?? "list";
			return readVerbs.has(verb) ? "read-only" : "write";
		}
		return "read-only";
	}
	const verbs = GH_NOUN_READ_VERBS[sub];
	if (verbs) {
		const rest = argv.slice(1).filter(a => !a.startsWith("-"));
		const verb = rest[0] ?? "";
		return verb && verbs.has(verb) ? "read-only" : "write";
	}
	return "write";
}

/** Classify one argv whose first word is git or gh. Fails closed to "write". */
function classifyToolSegment(argv: string[]): SegmentClass {
	const tool = argv[0];
	if (tool === "git") return classifyGit(argv.slice(1)) ?? "write";
	if (tool === "gh") return classifyGh(argv.slice(1)) ?? "write";
	return "none";
}

/**
 * Peel wrapper commands off an argv so their payload can be classified.
 * Returns the payload argv, or null when the wrapper swallows the command
 * (e.g. `timeout 30` with nothing after).
 */
function peelWrappers(argv: string[]): string[] | null {
	let rest = argv;
	// Leading VAR=val words (shell-style env assignments) before the payload.
	while (rest[0] && /^[A-Za-z_][A-Za-z0-9_]*=/.test(rest[0])) rest = rest.slice(1);
	for (;;) {
		const head = rest[0];
		if (!head) return null;
		if (WRAPPER_COMMANDS.has(head)) {
			if (head === "rtk") {
				// `rtk [-v|-vv|--ultra-compact|--skip-env] <tool> <args…>`: rtk's own
				// global options all appear before the dispatched tool. None of them
				// consume a separate value word, so skip flag words only.
				rest = rest.slice(1);
				while (rest[0] && (rest[0] === "-v" || rest[0] === "-h" || rest[0] === "--help" || rest[0] === "-V" || rest[0] === "--version" || /^-v+$/u.test(rest[0]) || /^--[a-z][\w-]*(=.*)?$/u.test(rest[0]))) {
					rest = rest.slice(1);
				}
				continue;
			}
			// `env [-flags] [VAR=val …] cmd`: peel known flags and VAR=val words.
			rest = rest.slice(1);
			while (rest[0] && (rest[0] === "-i" || rest[0] === "-0" || rest[0] === "-u" || rest[0] === "--unset" || /^--\w+([=].*)?$/.test(rest[0]))) {
				if (rest[0] === "-u" || rest[0] === "--unset") {
					rest = rest.slice(2); // -u NAME consumes its value
					continue;
				}
				rest = rest.slice(1);
			}
			while (rest[0] && /^[A-Za-z_][A-Za-z0-9_]*=/.test(rest[0])) rest = rest.slice(1);
			continue;
		}
		if (WRAPPER_WITH_ARG.has(head)) {
			rest = rest.slice(2);
			continue;
		}
		if (head === "xargs") {
			// `xargs [flags] cmd [args…]` — first non-flag word is the command.
			rest = rest.slice(1);
			while (rest[0] && rest[0].startsWith("-")) rest = rest.slice(1);
			return rest; // classify the xargs payload as the segment's tool
		}
		return rest;
	}
}

/**
 * Recursively classify a raw command line. Substitutions (`$(…)`, backticks,
 * `<(…)`, `>(…)`), and shell-string payloads (`bash -c '…'`) are classified on
 * their own and AND-combined: any nested "write" fails the whole line.
 */
export function classifyCommand(command: string, depth = 0): SegmentClass {
	if (depth > 8) return "write"; // unresolvable nesting: fail closed
	const segments = splitSegments(command);
	if (segments.length === 0) return "none";

	let sawTool = false;
	let sawChainBuilder = false; // a &&/;/||-connected segment that is not a known read
	for (const segment of segments) {
		const head = segment.argv[0];
		if (head && SHELL_HEADS.has(head)) {
			// Classify each quoted chunk that mentions git/gh; a shell head whose
			// payload never names the tools is not ours to govern.
			let inner: SegmentClass = "none";
			for (const chunk of quotedContents(command)) {
				if (!/\b(?:git|gh)\b/.test(chunk)) continue;
				const cls = classifyCommand(chunk, depth + 1);
				if (cls === "write") return "write";
				if (cls === "read-only") inner = "read-only";
}
			if (inner === "read-only") sawTool = true;
			continue;
}
		const payload = peelWrappers(segment.argv);
		if (!payload || payload.length === 0) {
			// Wrapper with no visible payload (`timeout 30`): could be anything.
			if (sawTool) return "write";
			sawChainBuilder ||= segment.connector !== "" && segment.connector !== "|";
			continue;
}
		const cls = classifyToolSegment(payload);
		if (cls === "none") {
			if (sawTool && segment.connector !== "" && segment.connector !== "|") return "write";
			if (segment.connector !== "" && segment.connector !== "|") sawChainBuilder = true;
			continue;
}
		sawTool = true;
		if (cls === "write") return "write";
}
	// Raw-line substitutions: classify the inner command strings recursively.
	for (const inner of extractSubstitutions(command)) {
		const cls = classifyCommand(inner, depth + 1);
		if (cls === "write") return "write";
		if (cls === "read-only") sawTool = true;
}
	// Tool present, all reads, but an unclassifiable segment was sequencing-
	// connected (e.g. `git status && sgi push` — "sgi" may be a git wrapper):
	// inject bot env so any git in that other command is still governed.
	if (sawTool && sawChainBuilder) return "write";
	return sawTool ? "read-only" : "none";
}

