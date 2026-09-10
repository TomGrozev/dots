import { describe, expect, test } from "bun:test";
import { classifyCommand } from "../.omp/extensions/git-bot-identity/lib/classify";

describe("classifyCommand", () => {
	test("plain git status is read-only", () => {
		expect(classifyCommand("git status")).toBe("read-only");
	});

	test("git log with flags is read-only", () => {
		expect(classifyCommand("git log --oneline -10")).toBe("read-only");
		expect(classifyCommand("git log --all --graph | head")).toBe("read-only");
	});

	test("git diff and show are read-only", () => {
		expect(classifyCommand("git diff HEAD~1")).toBe("read-only");
		expect(classifyCommand("git show abc123")).toBe("read-only");
	});

	test("git add, commit, push, merge, rebase are writes", () => {
		expect(classifyCommand("git add -A")).toBe("write");
		expect(classifyCommand("git commit -m 'x'")).toBe("write");
		expect(classifyCommand("git push origin main")).toBe("write");
		expect(classifyCommand("git merge feature")).toBe("write");
		expect(classifyCommand("git rebase -i HEAD~3")).toBe("write");
		expect(classifyCommand("git checkout -b feat")).toBe("write");
		expect(classifyCommand("git stash")).toBe("write");
		expect(classifyCommand("git reset --hard HEAD~1")).toBe("write");
		expect(classifyCommand("git tag v1.0")).toBe("write");
		expect(classifyCommand("git clean -fd")).toBe("write");
		expect(classifyCommand("git rm -r --cached .")).toBe("write");
	});

	test("unknown git subcommand defaults to write (fail-closed)", () => {
		expect(classifyCommand("git worktree add ../x")).toBe("write");
		expect(classifyCommand("git send-email --to x")).toBe("write");
		expect(classifyCommand("git notes add")).toBe("write");
	});

	test("git with no subcommand defaults to write", () => {
		expect(classifyCommand("git")).toBe("write");
	});

	test("gh read subcommands are read-only", () => {
		expect(classifyCommand("gh pr view 12")).toBe("read-only");
		expect(classifyCommand("gh pr list --state open")).toBe("read-only");
		expect(classifyCommand("gh pr status")).toBe("read-only");
		expect(classifyCommand("gh pr checks 12")).toBe("read-only");
		expect(classifyCommand("gh pr diff 12")).toBe("read-only");
		expect(classifyCommand("gh issue list")).toBe("read-only");
		expect(classifyCommand("gh issue view 3")).toBe("read-only");
		expect(classifyCommand("gh api repos/TomGrozev/dots --jq .description")).toBe("read-only");
		expect(classifyCommand("gh pr checkout 12")).toBe("read-only");
	});

	test("gh write subcommands are writes", () => {
		expect(classifyCommand("gh pr create --fill")).toBe("write");
		expect(classifyCommand("gh pr merge 12 --squash")).toBe("write");
		expect(classifyCommand("gh pr close 12")).toBe("write");
		expect(classifyCommand("gh issue create --title x")).toBe("write");
		expect(classifyCommand("gh api -X POST repos/o/r/issues")).toBe("write");
		// gh flips its default method to POST with field/input flags — no -X needed.
		expect(classifyCommand("gh api repos/o/r/issues -f title=hi")).toBe("write");
		expect(classifyCommand("gh api repos/o/r/issues -F count=1")).toBe("write");
		expect(classifyCommand("gh api --input body.json repos/o/r/issues")).toBe("write");
		expect(classifyCommand("gh api --raw-field x=y repos/o/r/issues")).toBe("write");
		// -X GET + field flags is still a write-class command (fail closed).
		expect(classifyCommand("gh api -X GET repos/o/r/x -f q=y")).toBe("write");
		expect(classifyCommand("gh api --request=PUT repos/o/r/x")).toBe("write");
		expect(classifyCommand("gh release upload v1 out.zip")).toBe("write");
		expect(classifyCommand("gh label create x")).toBe("write");
		expect(classifyCommand("gh repo fork o/r")).toBe("write");
		expect(classifyCommand("gh repo delete o/r")).toBe("write");
	});

	test("readonly modifier flags like -R and --repo are reads, not writes", () => {
		expect(classifyCommand("gh pr list -R TomGrozev/dots")).toBe("read-only");
	});

	test("unknown gh subcommand defaults to write", () => {
		expect(classifyCommand("gh codespace create")).toBe("write");
	});

	test("non-tool-prefixed commands pass through untouched", () => {
		expect(classifyCommand("ls -la")).toBe("none");
		expect(classifyCommand("bun test")).toBe("none");
		expect(classifyCommand("grep -r x .")).toBe("none");
	});

	test("non-tool commands wrapped in pipelines default to none", () => {
		expect(classifyCommand("cat file | jq .")).toBe("none");
	});

	test("command chains with git write segments are writes", () => {
		expect(classifyCommand("git add -A && git commit -m x")).toBe("write");
		expect(classifyCommand("bun test && git push")).toBe("write");
	});

	test("quoted strings are not parsed as operators", () => {
		expect(classifyCommand("echo 'git push'")).toBe("none");
		expect(classifyCommand('echo "commit and push"')).toBe("none");
	});

	test("pipe-fenced unknown segments default to write", () => {
		//sgi is not git/gh; unclassifiable after a connector -> conservative write
		expect(classifyCommand("git status && sgi push")).toBe("write");
	});

	test("shell options before subcommand are handled", () => {
		expect(classifyCommand("git -C /tmp/repo status")).toBe("read-only");
		expect(classifyCommand("git --git-dir=.git log -1")).toBe("read-only");
	});

	test("wrapper commands are peeled and payload classified", () => {
		expect(classifyCommand("env git push")).toBe("write");
		expect(classifyCommand("GIT_TRACE=1 env git status")).toBe("read-only");
		expect(classifyCommand("nice git push")).toBe("write");
		expect(classifyCommand("nohup git push")).toBe("write");
		expect(classifyCommand("timeout 30 git push")).toBe("write");
		expect(classifyCommand("command git status")).toBe("read-only");
		expect(classifyCommand("env -u FOO git status")).toBe("read-only");
	});

	test("rtk proxy prefix is peeled and payload classified", () => {
		// rtk rewrites `git X` to `rtk git X` BEFORE other tool_call handlers run
		// (extension discovery is alphabetical; see rtk.ts SAFETY NOTE), so the
		// bot-identity classifier must see through the prefix or writes slip.
		expect(classifyCommand("rtk git push")).toBe("write");
		expect(classifyCommand("rtk git status")).toBe("read-only");
		expect(classifyCommand("rtk gh pr create")).toBe("write");
		expect(classifyCommand("rtk gh pr view 5")).toBe("read-only");
		// Native rtk subcommands never touch git/gh: not ours to govern.
		expect(classifyCommand("rtk ls")).toBe("none");
		expect(classifyCommand("rtk log")).toBe("none");
		// Nested: rtk + env wrapper.
		expect(classifyCommand("env rtk git push")).toBe("write");
	});

	test("xargs feeding git is classified by payload", () => {
		expect(classifyCommand("printf 'x' | xargs git push")).toBe("write");
		expect(classifyCommand("printf 'x' | xargs git status")).toBe("read-only");
	});

	test("command substitution hiding git is a write", () => {
		expect(classifyCommand("echo $(git push)")).toBe("write");
		expect(classifyCommand("OUT=`git commit -m x`")).toBe("write");
		expect(classifyCommand("diff <(git log) <(gh api x)")).toBe("read-only");
	});

	test("shell -c payloads containing git are writes", () => {
		expect(classifyCommand("bash -c 'git push'")).toBe("write");
		expect(classifyCommand("sh -c 'echo hi'")).toBe("none");
	});
});
