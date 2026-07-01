import { describe, expect, it } from 'vitest';
import {
  formatOmqCliInvocation,
  resolveOmqCliPrefix,
  rewriteOmqCliInvocations,
} from '../utils/omq-cli-rendering.js';

describe('omq CLI rendering', () => {
  it('uses omq when the binary is available', () => {
    expect(resolveOmqCliPrefix({ omqAvailable: true, env: {} as NodeJS.ProcessEnv })).toBe('omq');
    expect(formatOmqCliInvocation('team api claim-task', { omqAvailable: true, env: {} as NodeJS.ProcessEnv }))
      .toBe('omq team api claim-task');
  });

  it('falls back to the plugin bridge when omq is unavailable but QODER_PLUGIN_ROOT is set', () => {
    const env = { QODER_PLUGIN_ROOT: '/tmp/plugin-root' } as NodeJS.ProcessEnv;
    expect(resolveOmqCliPrefix({ omqAvailable: false, env }))
      .toBe('node "$QODER_PLUGIN_ROOT"/bridge/cli.cjs');
    expect(formatOmqCliInvocation('autoresearch --mission "m"', { omqAvailable: false, env }))
      .toBe('node "$QODER_PLUGIN_ROOT"/bridge/cli.cjs autoresearch --mission "m"');
  });

  it('rewrites inline and list-form omq commands for plugin installs', () => {
    const env = { QODER_PLUGIN_ROOT: '/tmp/plugin-root' } as NodeJS.ProcessEnv;
    const input = [
      'Run `omq autoresearch --mission "m" --eval "e"`.',
      '- omq team api claim-task --input \'{}\' --json',
      '> omq ask codex --agent-prompt critic "check"',
    ].join('\n');

    const output = rewriteOmqCliInvocations(input, { omqAvailable: false, env });

    expect(output).toContain('`node "$QODER_PLUGIN_ROOT"/bridge/cli.cjs autoresearch --mission "m" --eval "e"`');
    expect(output).toContain('- node "$QODER_PLUGIN_ROOT"/bridge/cli.cjs team api claim-task --input \'{}\' --json');
    expect(output).toContain('> node "$QODER_PLUGIN_ROOT"/bridge/cli.cjs ask codex --agent-prompt critic "check"');
  });

  it('routes ask invocations through the plugin bridge inside an active Claude session when QODER_PLUGIN_ROOT is set', () => {
    const env = {
      QODER_PLUGIN_ROOT: '/tmp/plugin-root',
      CLAUDECODE: '1',
      QODER_SESSION_ID: 'session-123',
    } as NodeJS.ProcessEnv;

    expect(resolveOmqCliPrefix({ omqAvailable: false, env })).toBe('node "$QODER_PLUGIN_ROOT"/bridge/cli.cjs');
    expect(formatOmqCliInvocation('ask codex --prompt "check"', { omqAvailable: false, env }))
      .toBe('node "$QODER_PLUGIN_ROOT"/bridge/cli.cjs ask codex --prompt "check"');

    const input = [
      'Run `omq ask codex "review"`.',
      '> omq ask gemini --prompt "improve docs"',
    ].join('\n');

    const output = rewriteOmqCliInvocations(input, { omqAvailable: false, env });
    expect(output).toContain('`node "$QODER_PLUGIN_ROOT"/bridge/cli.cjs ask codex "review"`');
    expect(output).toContain('> node "$QODER_PLUGIN_ROOT"/bridge/cli.cjs ask gemini --prompt "improve docs"');
  });

  it('leaves text unchanged when omq remains the selected prefix', () => {
    const input = 'Use `omq team status demo` and\nomq team wait demo';
    expect(rewriteOmqCliInvocations(input, { omqAvailable: true, env: {} as NodeJS.ProcessEnv })).toBe(input);
  });
});
