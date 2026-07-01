import { describe, expect, it } from 'vitest';
import { spawnSync } from 'child_process';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const hookScript = resolve(__dirname, '../../../templates/hooks/pre-tool-use.mjs');

function runPreToolUseHook(command: string) {
  const payload = {
    tool_name: 'Bash',
    tool_input: { command },
  };

  const result = spawnSync('node', [hookScript], {
    input: JSON.stringify(payload),
    encoding: 'utf-8',
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toBeTruthy();
  return JSON.parse(result.stdout.trim()) as Record<string, unknown>;
}

describe('pre-tool-use template source extension detection', () => {
  it('does not warn for .json with stderr redirect', () => {
    const output = runPreToolUseHook(
      'cat ~/.qoder/settings.json 2>/dev/null | python3 -m json.tool',
    );

    expect(output.continue).toBe(true);
    expect(output.suppressOutput).toBe(true);
    expect(output.hookSpecificOutput).toBeUndefined();
  });

  it('still warns for real source files with redirection', () => {
    const output = runPreToolUseHook('cat src/app.js > /tmp/out.txt');
    const hookSpecificOutput = output.hookSpecificOutput as
      | { additionalContext?: string }
      | undefined;

    expect(output.continue).toBe(true);
    expect(hookSpecificOutput?.additionalContext).toContain(
      'Bash command may modify source files',
    );
  });
});
