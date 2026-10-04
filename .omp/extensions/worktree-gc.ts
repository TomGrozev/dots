// Worktree GC — reap orphaned task-isolation sandboxes.
//
// Subagents spawned with `isolated: true` get a sandbox under the agent-managed
// worktree dir (default `~/.omp/wt`). OMP removes a sandbox when the owning
// session releases it, but a session that is killed (crash, closed terminal,
// OOM, `kill -9`) leaves its sandboxes on disk forever — nothing sweeps them,
// so they pile up across days.
//
// `omp worktree clear` is the harness's own reaper, so we delegate to it rather
// than reimplementing the ownership check: it removes only entries whose owner
// `.omp-isolation-owner.json` no longer names a live omp process (pid + start
// token), and it protects live PR-checkout worktrees. `--all` would remove
// those too, so we never pass it.
//
// We sweep at session start (mops up after sessions that already died) and,
// throttled, on each turn (so a long-lived session also reaps siblings that die
// while it runs). No timers: nothing to leak across session switches.
//
// Env:
//   WORKTREE_GC_DISABLED=1        disable entirely (e.g. to debug)
//   WORKTREE_GC_INTERVAL_MS=60000 minimum gap between turn-driven sweeps
//                                 (default 60 min; 0 sweeps every turn)

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"

const DEFAULT_INTERVAL_MS = 60 * 60_000
const CLEAR_TIMEOUT_MS = 20_000

export default function (pi: ExtensionAPI) {
	if (process.env.WORKTREE_GC_DISABLED === "1") return

	let running = false
	let lastSweep = 0

	async function sweep(ctx: { ui: { notify(message: string, level: string): void } }): Promise<void> {
		if (running) return
		running = true
		lastSweep = Date.now()
		try {
			const res = await pi.exec("omp", ["worktree", "clear", "--json"], { timeout: CLEAR_TIMEOUT_MS })
			if (res.code !== 0) {
				console.warn(`[worktree-gc] clear exited ${res.code}: ${(res.stderr ?? "").trim()}`)
				return
			}
			// `omp worktree clear --json` emits `{ removed, failed, results }`; a
			// malformed payload reaps nothing and is not worth a notification.
			let removed = 0
			try {
				const parsed: unknown = JSON.parse(res.stdout)
				if (parsed !== null && typeof parsed === "object" && "removed" in parsed && typeof parsed.removed === "number") {
					removed = parsed.removed
				}
			} catch {
				removed = 0
			}
			if (removed > 0) ctx.ui.notify(`worktree-gc: removed ${removed} orphaned sandbox(es)`, "info")
		} catch (err) {
			// Fail open: never let a failed sweep disturb the session.
			console.warn("[worktree-gc] sweep failed", err)
		} finally {
			running = false
		}
	}

	pi.on("session_start", async (_event, ctx) => {
		void sweep(ctx)
	})

	pi.on("turn_start", async (_event, ctx) => {
		const configured = Number(process.env.WORKTREE_GC_INTERVAL_MS)
		const interval = Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_INTERVAL_MS
		if (Date.now() - lastSweep < interval) return
		void sweep(ctx)
	})
}
