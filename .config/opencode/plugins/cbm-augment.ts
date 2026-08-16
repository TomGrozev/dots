// Codebase Memory — grep/glob augmentation hook for OpenCode.
// Owned by this dotfiles repo (not auto-managed). Calls the
// codebase-memory-mcp `hook-augment` subcommand to append graph
// results to grep/glob output, matching what other clients get via
// their own hook configuration.
import { spawn } from 'node:child_process';

const BIN = `${process.env.HOME}/.local/bin/codebase-memory-mcp`;

function augment(tool, args) {
  return new Promise((resolve) => {
    const child = spawn(BIN, ['hook-augment'], {
      stdio: ['pipe', 'pipe', 'ignore'],
      env: { ...process.env, CBM_LOG_LEVEL: 'error' },
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.on('error', () => resolve(''));
    child.on('close', () => resolve(out));
    child.stdin.end(JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: tool,
      tool_input: args ?? {},
    }));
  });
}

export const CodebaseMemory = async () => ({
  'tool.execute.after': async (input, output) => {
    const tool = input?.tool === 'grep' ? 'Grep' : input?.tool === 'glob' ? 'Glob' : null;
    if (!tool) return;
    const extra = await augment(tool, output?.args);
    if (extra && typeof output?.output === 'string') {
      output.output += '\n' + extra;
    }
  },
});
// End Codebase Memory hook.
