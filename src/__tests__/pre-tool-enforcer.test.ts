import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('child_process');
vi.unmock('node:child_process');

import { execFileSync } from 'child_process';
// @ts-expect-error Local hook helper is a JS module loaded directly by the tests.
import { evaluateAgentHeavyPreflight } from '../../scripts/lib/pre-tool-enforcer-preflight.mjs';

const SCRIPT_PATH = join(process.cwd(), 'scripts', 'pre-tool-enforcer.mjs');

function runPreToolEnforcer(input: Record<string, unknown>): Record<string, unknown> {
  return runPreToolEnforcerWithEnv(input);
}

function runPreToolEnforcerWithEnv(
  input: Record<string, unknown>,
  env: Record<string, string> = {},
): Record<string, unknown> {
  const cwd = typeof input.cwd === 'string' ? input.cwd : process.cwd();
  const homeDir = join(cwd, '.test-home');
  const stdout = execFileSync(process.execPath, [SCRIPT_PATH], {
    cwd,
    input: JSON.stringify(input),
    encoding: 'utf-8',
    timeout: 30000,
    env: {
      ...process.env,
      HOME: homeDir,
      QODER_CONFIG_DIR: join(homeDir, '.qwen'),
      NODE_ENV: 'test',
      DISABLE_OMQ: '',
      OMQ_SKIP_HOOKS: '',
      // Reset Bedrock/routing env vars so tests are isolated from the host environment.
      // Tests that exercise Bedrock model-routing behaviour set these explicitly via `env`.
      OMQ_AGENT_PREFLIGHT_CONTEXT_THRESHOLD: '',
      OMQ_ROUTING_FORCE_INHERIT: '',
      OMQ_SUBAGENT_MODEL: '',
      QODER_MODEL: '',
      DASHSCOPE_MODEL: '',
      DASHSCOPE_BASE_URL: '',
      // Reset tier-resolution chain env vars (resolveTierAliasToSafeModel reads these).
      OMQ_MODEL_LOW: '',
      OMQ_MODEL_MEDIUM: '',
      OMQ_MODEL_HIGH: '',
      DASHSCOPE_DEFAULT_LOW_MODEL: '',
      DASHSCOPE_DEFAULT_MEDIUM_MODEL: '',
      DASHSCOPE_DEFAULT_HIGH_MODEL: '',
      ...env,
    },
  });

  return JSON.parse(stdout.trim()) as Record<string, unknown>;
}

function writeJson(filePath: string, data: Record<string, unknown>): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function writeTranscriptWithContext(filePath: string, contextWindow: number, inputTokens: number): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const line = JSON.stringify({
    usage: { context_window: contextWindow, input_tokens: inputTokens },
    context_window: contextWindow,
    input_tokens: inputTokens,
  });
  writeFileSync(filePath, `${line}\n`, 'utf-8');
}


describe('pre-tool-enforcer advisory throttling (issue #3163)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pre-tool-enforcer-advisory-throttle-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function runWithThrottle(toolName: string, nowMs = '1000'): Record<string, unknown> {
    return runPreToolEnforcerWithEnv(
      {
        tool_name: toolName,
        cwd: tempDir,
        session_id: 'session-3163',
      },
      {
        OMQ_PRE_TOOL_ADVISORY_COOLDOWN_MS: '5000',
        OMQ_PRE_TOOL_ADVISORY_NOW_MS: nowMs,
      },
    );
  }

  it('emits the first advisory and suppresses an immediate repeated identical advisory', () => {
    const first = runWithThrottle('Bash');
    const repeated = runWithThrottle('Bash');

    expect(first.continue).toBe(true);
    expect((first.hookSpecificOutput as Record<string, unknown>).additionalContext).toContain(
      'Use parallel execution for independent tasks',
    );
    expect(repeated).toEqual({ continue: true, suppressOutput: true });
  });

  it('still emits a different advisory while the previous advisory is cooling down', () => {
    const first = runWithThrottle('Bash');
    const different = runWithThrottle('Edit');

    expect((first.hookSpecificOutput as Record<string, unknown>).additionalContext).toContain(
      'Use parallel execution for independent tasks',
    );
    expect((different.hookSpecificOutput as Record<string, unknown>).additionalContext).toContain(
      'Verify changes work after editing',
    );
  });

  it('does not throttle repeated hard-gate denials', () => {
    const sessionId = 'session-3163';
    writeJson(join(tempDir, '.omq', 'state', 'sessions', sessionId, 'ultragoal-state.json'), {
      active: true,
      session_id: sessionId,
      project_path: tempDir,
      objective: 'complete the aggregate ultragoal',
      last_checked_at: new Date().toISOString(),
    });

    const input = {
      tool_name: 'Bash',
      cwd: tempDir,
      tool_input: { command: 'echo safe' },
      session_id: sessionId,
    };
    const env = {
      OMQ_PRE_TOOL_ADVISORY_COOLDOWN_MS: '5000',
      OMQ_PRE_TOOL_ADVISORY_NOW_MS: '1000',
    };

    const first = runPreToolEnforcerWithEnv(input, env);
    const repeated = runPreToolEnforcerWithEnv(input, env);

    for (const output of [first, repeated]) {
      const hookSpecificOutput = output.hookSpecificOutput as Record<string, unknown>;
      expect(output.continue).toBe(true);
      expect(hookSpecificOutput.permissionDecision).toBe('deny');
      expect(hookSpecificOutput.permissionDecisionReason).toContain('[ULTRAGOAL /GOAL REQUIRED]');
    }
  });

  it('uses deterministic cooldown interval boundaries', () => {
    const first = runWithThrottle('Bash', '1000');
    const beforeCooldown = runWithThrottle('Bash', '5999');
    const atCooldown = runWithThrottle('Bash', '6000');

    expect((first.hookSpecificOutput as Record<string, unknown>).additionalContext).toContain(
      'Use parallel execution for independent tasks',
    );
    expect(beforeCooldown).toEqual({ continue: true, suppressOutput: true });
    expect((atCooldown.hookSpecificOutput as Record<string, unknown>).additionalContext).toContain(
      'Use parallel execution for independent tasks',
    );
  });

  it('does not let a future throttle timestamp suppress an advisory', () => {
    runWithThrottle('Bash', '10000');

    const output = runWithThrottle('Bash', '1000');

    expect((output.hookSpecificOutput as Record<string, unknown>).additionalContext).toContain(
      'Use parallel execution for independent tasks',
    );
  });

  it('keeps advisory throttle state capped after adding a new entry', () => {
    const sessionId = 'session-3163';
    const throttlePath = join(
      tempDir,
      '.omq',
      'state',
      'sessions',
      sessionId,
      'pre-tool-advisory-throttle.json',
    );
    const entries = Object.fromEntries(
      Array.from({ length: 100 }, (_, index) => [
        `old-${index}`,
        {
          last_emitted_at_ms: 10_000 - index,
          message: `old message ${index}`,
        },
      ]),
    );
    writeJson(throttlePath, { version: 1, entries });

    runWithThrottle('Bash', '20000');

    const state = JSON.parse(readFileSync(throttlePath, 'utf-8')) as {
      entries: Record<string, unknown>;
    };
    expect(Object.keys(state.entries)).toHaveLength(100);
  });

  it('prunes future throttle entries so they cannot consume the cap', () => {
    const sessionId = 'session-3163';
    const throttlePath = join(
      tempDir,
      '.omq',
      'state',
      'sessions',
      sessionId,
      'pre-tool-advisory-throttle.json',
    );
    const entries = Object.fromEntries(
      Array.from({ length: 100 }, (_, index) => [
        `future-${index}`,
        {
          last_emitted_at_ms: 999_000 + index,
          message: `future message ${index}`,
        },
      ]),
    );
    writeJson(throttlePath, { version: 1, entries });

    runWithThrottle('Bash', '20000');

    const state = JSON.parse(readFileSync(throttlePath, 'utf-8')) as {
      entries: Record<string, { last_emitted_at_ms: number }>;
    };
    expect(Object.keys(state.entries)).toHaveLength(1);
    expect(Object.values(state.entries)[0].last_emitted_at_ms).toBe(20_000);
  });
});

describe('pre-tool-enforcer fallback gating (issue #970)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pre-tool-enforcer-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('suppresses unknown-tool fallback when no active mode exists', () => {
    const output = runPreToolEnforcer({
      tool_name: 'ToolSearch',
      cwd: tempDir,
      session_id: 'session-970',
    });

    expect(output).toEqual({ continue: true, suppressOutput: true });
  });

  it('emits boulder fallback for unknown tools when session-scoped mode is active', () => {
    const sessionId = 'session-970';
    writeJson(
      join(tempDir, '.omq', 'state', 'sessions', sessionId, 'ralph-state.json'),
      {
        active: true,
      },
    );

    const output = runPreToolEnforcer({
      tool_name: 'ToolSearch',
      cwd: tempDir,
      session_id: sessionId,
    });

    const hookSpecificOutput = output.hookSpecificOutput as Record<string, unknown>;
    expect(output.continue).toBe(true);
    expect(hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(hookSpecificOutput.additionalContext).toContain('The boulder never stops');
  });

  it('does not fall back to legacy mode files when a valid session_id is provided', () => {
    writeJson(join(tempDir, '.omq', 'state', 'ralph-state.json'), {
      active: true,
    });

    const output = runPreToolEnforcer({
      tool_name: 'ToolSearch',
      cwd: tempDir,
      session_id: 'session-970-legacy',
    });

    expect(output).toEqual({ continue: true, suppressOutput: true });
  });

  it('uses legacy mode files when session_id is not provided', () => {
    writeJson(join(tempDir, '.omq', 'state', 'ultrawork-state.json'), {
      active: true,
    });

    const output = runPreToolEnforcer({
      tool_name: 'ToolSearch',
      cwd: tempDir,
    });

    const hookSpecificOutput = output.hookSpecificOutput as Record<string, unknown>;
    expect(output.continue).toBe(true);
    expect(hookSpecificOutput.additionalContext).toContain('The boulder never stops');
  });

  // === Team-routing enforcement tests (issue #1006) ===

  it('injects team-routing redirect when Task called without team_name during active team session', () => {
    const sessionId = 'session-1006';
    writeJson(
      join(tempDir, '.omq', 'state', 'sessions', sessionId, 'team-state.json'),
      {
        active: true,
        team_name: 'fix-ts-errors',
      },
    );

    const output = runPreToolEnforcer({
      tool_name: 'Task',
      toolInput: {
        subagent_type: 'oh-my-qoder:executor',
        description: 'Fix type errors',
        prompt: 'Fix all type errors in src/auth/',
      },
      cwd: tempDir,
      session_id: sessionId,
    });

    const hookSpecificOutput = output.hookSpecificOutput as Record<string, unknown>;
    expect(output.continue).toBe(true);
    expect(hookSpecificOutput.additionalContext).toContain('TEAM ROUTING REQUIRED');
    expect(hookSpecificOutput.additionalContext).toContain('fix-ts-errors');
    expect(hookSpecificOutput.additionalContext).toContain('team_name=');
  });

  it('does NOT inject team-routing redirect when Task called WITH team_name', () => {
    const sessionId = 'session-1006b';
    writeJson(
      join(tempDir, '.omq', 'state', 'sessions', sessionId, 'team-state.json'),
      {
        active: true,
        team_name: 'fix-ts-errors',
      },
    );

    const output = runPreToolEnforcer({
      tool_name: 'Task',
      toolInput: {
        subagent_type: 'oh-my-qoder:executor',
        team_name: 'fix-ts-errors',
        name: 'worker-1',
        description: 'Fix type errors',
        prompt: 'Fix all type errors in src/auth/',
      },
      cwd: tempDir,
      session_id: sessionId,
    });

    const hookSpecificOutput = output.hookSpecificOutput as Record<string, unknown>;
    expect(output.continue).toBe(true);
    // Should be a normal spawn message, not a redirect
    expect(String(hookSpecificOutput.additionalContext)).not.toContain('TEAM ROUTING REQUIRED');
    expect(String(hookSpecificOutput.additionalContext)).toContain('Spawning agent');
  });

  it('does NOT inject team-routing redirect when no team state is active', () => {
    const output = runPreToolEnforcer({
      tool_name: 'Task',
      toolInput: {
        subagent_type: 'oh-my-qoder:executor',
        description: 'Fix type errors',
        prompt: 'Fix all type errors in src/auth/',
      },
      cwd: tempDir,
      session_id: 'session-no-team',
    });

    const hookSpecificOutput = output.hookSpecificOutput as Record<string, unknown>;
    expect(output.continue).toBe(true);
    expect(String(hookSpecificOutput.additionalContext)).not.toContain('TEAM ROUTING REQUIRED');
    expect(String(hookSpecificOutput.additionalContext)).toContain('Spawning agent');
  });

  it('suppresses built-in TaskCreate task-list operation chatter', () => {
    const output = runPreToolEnforcer({
      tool_name: 'TaskCreate',
      toolInput: {
        title: 'Inspect hook behavior',
        status: 'pending',
      },
      cwd: tempDir,
      session_id: 'session-taskcreate-builtin',
    });

    expect(output).toEqual({ continue: true, suppressOutput: true });
  });

  it('suppresses built-in TaskUpdate task-list operation chatter', () => {
    const output = runPreToolEnforcer({
      tool_name: 'TaskUpdate',
      toolInput: {
        id: 'task-1',
        status: 'in_progress',
      },
      cwd: tempDir,
      session_id: 'session-taskupdate-builtin',
    });

    expect(output).toEqual({ continue: true, suppressOutput: true });
  });

  it('preserves Agent spawn warnings for real subagent delegation', () => {
    const output = runPreToolEnforcer({
      tool_name: 'Agent',
      toolInput: {
        subagent_type: 'oh-my-qoder:executor',
        description: 'Fix type errors',
        prompt: 'Fix all type errors in src/auth/',
      },
      cwd: tempDir,
      session_id: 'session-agent-spawn',
    });

    const hookSpecificOutput = output.hookSpecificOutput as Record<string, unknown>;
    expect(output.continue).toBe(true);
    expect(String(hookSpecificOutput.additionalContext)).toContain('Spawning agent: oh-my-qoder:executor');
  });

  it('reads team state from legacy path when session_id is absent', () => {
    writeJson(join(tempDir, '.omq', 'state', 'team-state.json'), {
      active: true,
      team_name: 'legacy-team',
    });

    const output = runPreToolEnforcer({
      tool_name: 'Task',
      toolInput: {
        subagent_type: 'oh-my-qoder:executor',
        description: 'Fix something',
        prompt: 'Fix it',
      },
      cwd: tempDir,
    });

    const hookSpecificOutput = output.hookSpecificOutput as Record<string, unknown>;
    expect(output.continue).toBe(true);
    expect(hookSpecificOutput.additionalContext).toContain('TEAM ROUTING REQUIRED');
    expect(hookSpecificOutput.additionalContext).toContain('legacy-team');
  });

  it('routes Task calls from canonical team state when coarse team-state drifts away', () => {
    const sessionId = 'session-canonical-team';
    const canonicalTeamDir = join(tempDir, '.omq', 'state', 'team', 'canonical-team');
    writeJson(join(canonicalTeamDir, 'manifest.json'), {
      name: 'canonical-team',
      task: 'Canonical team task',
      leader: {
        session_id: sessionId,
        worker_id: 'leader-fixed',
        role: 'leader',
      },
      created_at: new Date().toISOString(),
      leader_cwd: tempDir,
      team_state_root: join(tempDir, '.omq', 'state'),
    });
    writeJson(join(canonicalTeamDir, 'phase-state.json'), {
      current_phase: 'executing',
      updated_at: new Date().toISOString(),
    });

    const output = runPreToolEnforcer({
      tool_name: 'Task',
      toolInput: {
        subagent_type: 'oh-my-qoder:executor',
        description: 'Fix type errors',
        prompt: 'Fix all type errors in src/auth/',
      },
      cwd: tempDir,
      session_id: sessionId,
    });

    const hookSpecificOutput = output.hookSpecificOutput as Record<string, unknown>;
    expect(output.continue).toBe(true);
    expect(hookSpecificOutput.additionalContext).toContain('TEAM ROUTING REQUIRED');
    expect(hookSpecificOutput.additionalContext).toContain('canonical-team');
  });

  it('respects session isolation — ignores team state from different session', () => {
    writeJson(
      join(tempDir, '.omq', 'state', 'sessions', 'other-session', 'team-state.json'),
      {
        active: true,
        team_name: 'other-team',
      },
    );

    const output = runPreToolEnforcer({
      tool_name: 'Task',
      toolInput: {
        subagent_type: 'oh-my-qoder:executor',
        description: 'Fix something',
        prompt: 'Fix it',
      },
      cwd: tempDir,
      session_id: 'my-session',
    });

    const hookSpecificOutput = output.hookSpecificOutput as Record<string, unknown>;
    expect(output.continue).toBe(true);
    expect(String(hookSpecificOutput.additionalContext)).not.toContain('TEAM ROUTING REQUIRED');
  });

  it('keeps known tool messages unchanged (Bash, Read)', () => {
    const bash = runPreToolEnforcer({
      tool_name: 'Bash',
      cwd: tempDir,
      session_id: 'session-known-bash',
    });
    const bashOutput = bash.hookSpecificOutput as Record<string, unknown>;
    expect(bashOutput.additionalContext).toBe(
      'Use parallel execution for independent tasks. Use run_in_background for long operations (npm install, builds, tests).',
    );

    const read = runPreToolEnforcer({
      tool_name: 'Read',
      cwd: tempDir,
      session_id: 'session-known-read',
    });
    const readOutput = read.hookSpecificOutput as Record<string, unknown>;
    expect(readOutput.additionalContext).toBe(
      'Read multiple files in parallel when possible for faster analysis.',
    );
  });

  it('suppresses routine pre-tool reminders when OMQ_QUIET=1', () => {
    const bash = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Bash',
        cwd: tempDir,
      },
      { OMQ_QUIET: '1' },
    );

    expect(bash).toEqual({ continue: true, suppressOutput: true });

    const read = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Read',
        cwd: tempDir,
      },
      { OMQ_QUIET: '1' },
    );

    expect(read).toEqual({ continue: true, suppressOutput: true });
  });

  it('keeps active-mode and team-routing enforcement visible when OMQ_QUIET is enabled', () => {
    const sessionId = 'session-1646';
    writeJson(
      join(tempDir, '.omq', 'state', 'sessions', sessionId, 'ralph-state.json'),
      {
        active: true,
        session_id: sessionId,
      },
    );
    writeJson(
      join(tempDir, '.omq', 'state', 'sessions', sessionId, 'team-state.json'),
      {
        active: true,
        session_id: sessionId,
        team_name: 'quiet-team',
      },
    );

    const modeOutput = runPreToolEnforcerWithEnv(
      {
        tool_name: 'ToolSearch',
        cwd: tempDir,
        session_id: sessionId,
      },
      { OMQ_QUIET: '2' },
    );

    expect(String((modeOutput.hookSpecificOutput as Record<string, unknown>).additionalContext))
      .toContain('The boulder never stops');

    const taskOutput = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Task',
        toolInput: {
          subagent_type: 'oh-my-qoder:executor',
          description: 'Fix type errors',
          prompt: 'Fix all type errors in src/auth/',
        },
        cwd: tempDir,
        session_id: sessionId,
      },
      { OMQ_QUIET: '2' },
    );

    expect(String((taskOutput.hookSpecificOutput as Record<string, unknown>).additionalContext))
      .toContain('TEAM ROUTING REQUIRED');
  });

  it('suppresses routine agent spawn chatter at OMQ_QUIET=2 but not enforcement', () => {
    const output = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Task',
        toolInput: {
          subagent_type: 'oh-my-qoder:executor',
          description: 'Fix type errors',
          prompt: 'Fix all type errors in src/auth/',
        },
        cwd: tempDir,
        session_id: 'session-1646-quiet',
      },
      { OMQ_QUIET: '2' },
    );

    expect(output).toEqual({ continue: true, suppressOutput: true });
  });

  it('warns without blocking when Task prompt uses fallback or workaround language', () => {
    const output = runPreToolEnforcer({
      tool_name: 'Task',
      toolInput: {
        subagent_type: 'oh-my-qoder:executor',
        description: 'Implement a fallback',
        prompt: 'Add a workaround if the normal architecture is hard.',
      },
      cwd: tempDir,
      session_id: 'session-slop-warning',
    });

    const hookSpecificOutput = output.hookSpecificOutput as Record<string, unknown>;
    const context = String(hookSpecificOutput.additionalContext);
    expect(output.continue).toBe(true);
    expect(hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(context).toContain('[SLOP WARNING]');
    expect(context).toContain('Do not make potential slop');
    expect(context).toContain('consult the architect');
    expect(context).toContain('ask the user to confirm constraints');
    expect(context).toContain('Spawning agent');
    expect(hookSpecificOutput).not.toHaveProperty('permissionDecision');
  });

  it('keeps slop warning visible even when routine reminders are quieted', () => {
    const output = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Bash',
        toolInput: {
          command: 'node scripts/add-fallback-workaround.mjs',
        },
        cwd: tempDir,
        session_id: 'session-slop-warning-quiet',
      },
      { OMQ_QUIET: '2' },
    );

    const hookSpecificOutput = output.hookSpecificOutput as Record<string, unknown>;
    const context = String(hookSpecificOutput.additionalContext);
    expect(output.continue).toBe(true);
    expect(context).toContain('[SLOP WARNING]');
    expect(context).not.toContain('Use parallel execution');
  });

  it('does not warn for documentation edits that describe workaround terms as nouns', () => {
    const output = runPreToolEnforcer({
      tool_name: 'Write',
      toolInput: {
        file_path: join(tempDir, 'docs', 'troubleshooting.md'),
        content: [
          '# Troubleshooting',
          '',
          'Document workaround for a specific bug in the troubleshooting guide.',
          'This section explains when the workaround term appears in instructions.',
        ].join('\n'),
      },
      cwd: tempDir,
      session_id: 'session-slop-doc-text',
    });

    const hookSpecificOutput = output.hookSpecificOutput as Record<string, unknown>;
    expect(output.continue).toBe(true);
    expect(String(hookSpecificOutput.additionalContext)).not.toContain('[SLOP WARNING]');
  });

  it('does not warn for self-referential pre-tool enforcer edits that document the rule', () => {
    const output = runPreToolEnforcer({
      tool_name: 'Edit',
      toolInput: {
        file_path: 'scripts/pre-tool-enforcer.mjs',
        old_string: 'const SLOP_FALLBACK_LANGUAGE_PATTERN = /fallback|workaround/i;',
        new_string: [
          '// The fallback/workaround detector should avoid warning on rule documentation.',
          'const SLOP_FALLBACK_LANGUAGE_PATTERN = /fallback|workaround/i;',
        ].join('\n'),
      },
      cwd: tempDir,
      session_id: 'session-slop-self-reference',
    });

    const hookSpecificOutput = output.hookSpecificOutput as Record<string, unknown>;
    expect(output.continue).toBe(true);
    expect(String(hookSpecificOutput.additionalContext)).not.toContain('[SLOP WARNING]');
  });

  it('still warns for action-shaped fallback narration outside documentation contexts', () => {
    const output = runPreToolEnforcer({
      tool_name: 'Task',
      toolInput: {
        subagent_type: 'oh-my-qoder:executor',
        description: 'Implement fallback routing',
        prompt: 'Please implement a fallback layer for the flaky API.',
      },
      cwd: tempDir,
      session_id: 'session-slop-action-shaped',
    });

    const hookSpecificOutput = output.hookSpecificOutput as Record<string, unknown>;
    expect(output.continue).toBe(true);
    expect(String(hookSpecificOutput.additionalContext)).toContain('[SLOP WARNING]');
  });

  it('warns for natural work-around phrasing with direct noun objects', () => {
    const output = runPreToolEnforcer({
      tool_name: 'Task',
      toolInput: {
        subagent_type: 'oh-my-qoder:executor',
        description: 'Skip architecture for flaky API failures',
        prompt: 'Please work around flaky API failures by skipping the normal architecture.',
      },
      cwd: tempDir,
      session_id: 'session-slop-work-around-noun-object',
    });

    const hookSpecificOutput = output.hookSpecificOutput as Record<string, unknown>;
    expect(output.continue).toBe(true);
    expect(String(hookSpecificOutput.additionalContext)).toContain('[SLOP WARNING]');
  });

  it('warns for fall back on cached responses phrasing', () => {
    const output = runPreToolEnforcer({
      tool_name: 'Task',
      toolInput: {
        subagent_type: 'oh-my-qoder:executor',
        description: 'Add API fallback',
        prompt: 'If the API fails, fall back on cached responses.',
      },
      cwd: tempDir,
      session_id: 'session-slop-fall-back-on',
    });

    const hookSpecificOutput = output.hookSpecificOutput as Record<string, unknown>;
    expect(output.continue).toBe(true);
    expect(String(hookSpecificOutput.additionalContext)).toContain('[SLOP WARNING]');
  });

  it('warns for single-word fallback to cached responses phrasing', () => {
    const output = runPreToolEnforcer({
      tool_name: 'Task',
      toolInput: {
        subagent_type: 'oh-my-qoder:executor',
        description: 'Add API fallback',
        prompt: 'If the API fails, fallback to cached responses.',
      },
      cwd: tempDir,
      session_id: 'session-slop-fallback-to',
    });

    const hookSpecificOutput = output.hookSpecificOutput as Record<string, unknown>;
    expect(output.continue).toBe(true);
    expect(String(hookSpecificOutput.additionalContext)).toContain('[SLOP WARNING]');
  });

  it('does not treat markdown headings alone as documentation context for Task prompts', () => {
    const output = runPreToolEnforcer({
      tool_name: 'Task',
      toolInput: {
        subagent_type: 'oh-my-qoder:executor',
        description: 'Implement fallback routing',
        prompt: [
          '## Implementation',
          '',
          'Please implement a fallback layer and explain why.',
        ].join('\n'),
      },
      cwd: tempDir,
      session_id: 'session-slop-markdown-task',
    });

    const hookSpecificOutput = output.hookSpecificOutput as Record<string, unknown>;
    expect(output.continue).toBe(true);
    expect(String(hookSpecificOutput.additionalContext)).toContain('[SLOP WARNING]');
  });

  it('does not warn for documentation edits that quote action-shaped work-around wording', () => {
    const output = runPreToolEnforcer({
      tool_name: 'Write',
      toolInput: {
        file_path: join(tempDir, 'docs', 'architecture-notes.md'),
        content: [
          '# Architecture notes',
          '',
          'Explain why the phrase "Please work around flaky API failures" should be reviewed carefully.',
        ].join('\n'),
      },
      cwd: tempDir,
      session_id: 'session-slop-doc-action-shaped',
    });

    const hookSpecificOutput = output.hookSpecificOutput as Record<string, unknown>;
    expect(output.continue).toBe(true);
    expect(String(hookSpecificOutput.additionalContext)).not.toContain('[SLOP WARNING]');
  });

  it('does not warn for read-only search tools that mention fallback as the query', () => {
    const output = runPreToolEnforcer({
      tool_name: 'Grep',
      toolInput: {
        pattern: 'fallback|workaround',
      },
      cwd: tempDir,
      session_id: 'session-slop-search',
    });

    const hookSpecificOutput = output.hookSpecificOutput as Record<string, unknown>;
    expect(output.continue).toBe(true);
    expect(String(hookSpecificOutput.additionalContext)).not.toContain('[SLOP WARNING]');
    expect(String(hookSpecificOutput.additionalContext)).toContain('Combine searches in parallel');
  });

  it('does not warn for benign technical fallback descriptions from issue #2939', () => {
    const benignPrompts = [
      'Preserve the fail-soft fallback value when LAST_INSERT_ID() returns 0 after a failed INSERT.',
      'Describe the fallback to default config when the project config file is missing.',
      'Add a workaround for commit cf9703f so the regression note links to the upstream change.',
      'Keep the memory workaround note, but do not change runtime behavior.',
    ];

    for (const [index, prompt] of benignPrompts.entries()) {
      const output = runPreToolEnforcer({
        tool_name: 'Task',
        toolInput: {
          subagent_type: 'oh-my-qoder:executor',
          description: 'Handle benign fallback documentation',
          prompt,
        },
        cwd: tempDir,
        session_id: `session-slop-benign-${index}`,
      });

      const hookSpecificOutput = output.hookSpecificOutput as Record<string, unknown>;
      expect(output.continue).toBe(true);
      expect(String(hookSpecificOutput.additionalContext)).not.toContain('[SLOP WARNING]');
    }
  });

  it('warns when benign and risky fallback phrasing coexist in one segment', () => {
    const output = runPreToolEnforcer({
      tool_name: 'Task',
      toolInput: {
        subagent_type: 'oh-my-qoder:executor',
        description: 'Preserve benign fallback and reject risky routing fallback',
        prompt: 'Preserve the fail-soft fallback value, and fallback to weaker model if the preferred agent is unavailable.',
      },
      cwd: tempDir,
      session_id: 'session-slop-mixed-benign-risky',
    });

    const hookSpecificOutput = output.hookSpecificOutput as Record<string, unknown>;
    expect(output.continue).toBe(true);
    expect(String(hookSpecificOutput.additionalContext)).toContain('[SLOP WARNING]');
  });

  it('does not warn when fallback/workaround phrases only appear in quoted or code contexts', () => {
    const output = runPreToolEnforcer({
      tool_name: 'Task',
      toolInput: {
        subagent_type: 'oh-my-qoder:executor',
        description: 'Review quoted technical phrases',
        prompt: [
          'Review the quoted phrase "fallback to default config" in the migration notes.',
          'The code sample says `workaround the requirement`, but do not implement that behavior.',
          '```ts',
          'const message = "fallback to weaker model";',
          '```',
        ].join('\n'),
      },
      cwd: tempDir,
      session_id: 'session-slop-quoted-code',
    });

    const hookSpecificOutput = output.hookSpecificOutput as Record<string, unknown>;
    expect(output.continue).toBe(true);
    expect(String(hookSpecificOutput.additionalContext)).not.toContain('[SLOP WARNING]');
  });

  it('does not warn for primary-path extra/additional naming from issue #3012', () => {
    const output = runPreToolEnforcer({
      tool_name: 'Edit',
      toolInput: {
        file_path: join(tempDir, 'token.go'),
        old_string: 'type tokenRequest struct {}',
        new_string: [
          'type extraSecretFetch struct {',
          '\tpath string',
          '}',
          '',
          'type tokenRequest struct {',
          '\textraSecrets []extraSecretFetch',
          '}',
          '',
          '// Fetch additional SM paths as part of the primary dual-secret design.',
          'func fetchTokenSecrets(extraSecrets []extraSecretFetch) {}',
        ].join('\n'),
      },
      cwd: tempDir,
      session_id: 'session-slop-extra-additional-primary-path',
    });

    const hookSpecificOutput = output.hookSpecificOutput as Record<string, unknown>;
    expect(output.continue).toBe(true);
    expect(String(hookSpecificOutput.additionalContext)).not.toContain('[SLOP WARNING]');
  });

  it('does not warn for Task prompts that describe extra/additional primary-path fields', () => {
    const output = runPreToolEnforcer({
      tool_name: 'Task',
      toolInput: {
        subagent_type: 'oh-my-qoder:executor',
        description: 'Implement primary dual-secret token fetch',
        prompt: [
          'Implement the primary dual-secret path using extraSecretFetch.',
          'The request type should include extraSecrets []extraSecretFetch.',
          'Comments may describe additional SM paths because both paths are intentional.',
        ].join('\n'),
      },
      cwd: tempDir,
      session_id: 'session-slop-task-extra-additional-primary-path',
    });

    const hookSpecificOutput = output.hookSpecificOutput as Record<string, unknown>;
    expect(output.continue).toBe(true);
    expect(String(hookSpecificOutput.additionalContext)).not.toContain('[SLOP WARNING]');
  });

  it('still warns for real SLOP intent from issue #2939', () => {
    const slopPrompts = [
      'If the preferred agent is unavailable, fallback to weaker model to keep going.',
      'Please workaround the requirement instead of implementing the requested workflow.',
    ];

    for (const [index, prompt] of slopPrompts.entries()) {
      const output = runPreToolEnforcer({
        tool_name: 'Task',
        toolInput: {
          subagent_type: 'oh-my-qoder:executor',
          description: 'Implement risky fallback',
          prompt,
        },
        cwd: tempDir,
        session_id: `session-slop-real-${index}`,
      });

      const hookSpecificOutput = output.hookSpecificOutput as Record<string, unknown>;
      expect(output.continue).toBe(true);
      expect(String(hookSpecificOutput.additionalContext)).toContain('[SLOP WARNING]');
    }
  });

  it('blocks agent-heavy Task preflight when transcript context budget is exhausted', () => {
    const transcriptPath = join(tempDir, 'transcript.jsonl');
    writeTranscriptWithContext(transcriptPath, 1000, 800); // 80%

    const output = evaluateAgentHeavyPreflight({
      toolName: 'Task',
      transcriptPath,
    });

    expect(output?.decision).toBe('block');
    expect(String(output?.reason)).toContain('Preflight context guard');
    expect(String(output?.reason)).toContain('Safe recovery');
  });

  it('falls back to the default preflight threshold when the env value is invalid', () => {
    const transcriptPath = join(tempDir, 'transcript.jsonl');
    writeTranscriptWithContext(transcriptPath, 1000, 800); // 80%

    const output = evaluateAgentHeavyPreflight({
      toolName: 'Task',
      transcriptPath,
      env: {
        ...process.env,
        OMQ_AGENT_PREFLIGHT_CONTEXT_THRESHOLD: 'abc',
      },
    });

    expect(output?.decision).toBe('block');
    expect(String(output?.reason)).toContain('threshold: 72%');
  });

  it('allows non-agent-heavy tools even when transcript context is high', () => {
    const transcriptPath = join(tempDir, 'transcript.jsonl');
    writeTranscriptWithContext(transcriptPath, 1000, 900); // 90%

    const output = runPreToolEnforcer({
      tool_name: 'Read',
      cwd: tempDir,
      transcript_path: transcriptPath,
      session_id: 'session-1373',
    });

    expect(output.continue).toBe(true);
    expect(output.decision).toBeUndefined();
  });

  it('clears awaiting confirmation from session-scoped mode state when a skill is invoked', () => {
    const sessionId = 'session-confirm';
    const sessionStateDir = join(tempDir, '.omq', 'state', 'sessions', sessionId);
    mkdirSync(sessionStateDir, { recursive: true });
    writeJson(join(sessionStateDir, 'ralph-state.json'), {
      active: true,
      awaiting_confirmation: true,
    });
    writeJson(join(sessionStateDir, 'ultrawork-state.json'), {
      active: true,
      awaiting_confirmation: true,
    });

    const output = runPreToolEnforcer({
      tool_name: 'Skill',
      toolInput: {
        skill: 'oh-my-qoder:ralph',
      },
      cwd: tempDir,
      session_id: sessionId,
    });

    expect(output.continue).toBe(true);
    expect((output.hookSpecificOutput as Record<string, unknown>).additionalContext).toContain(
      'The boulder never stops',
    );
    expect(
      JSON.parse(readFileSync(join(sessionStateDir, 'ralph-state.json'), 'utf-8')).awaiting_confirmation,
    ).toBeUndefined();
    expect(
      JSON.parse(readFileSync(join(sessionStateDir, 'ultrawork-state.json'), 'utf-8')).awaiting_confirmation,
    ).toBeUndefined();
  });

  // === Model routing / forceInherit tests (issue #1868 catch-22) ===

  it('allows tier alias "medium" through when OMQ_SUBAGENT_MODEL is set and forceInherit is enabled', () => {
    const output = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Agent',
        toolInput: { subagent_type: 'oh-my-qoder:architect', model: 'medium' },
      },
      {
        OMQ_ROUTING_FORCE_INHERIT: 'true',
        OMQ_SUBAGENT_MODEL: 'qwen-plus',
      },
    );

    // Tier alias + OMQ_SUBAGENT_MODEL configured → allow through
    expect(output.continue).toBe(true);
    expect(JSON.stringify(output)).not.toContain('MODEL ROUTING');
  });

  // --- ANTHROPIC_DEFAULT_*_MODEL resolution (eliminates mandatory OMQ_SUBAGENT_MODEL) ---

  it('allows tier alias "medium" via DASHSCOPE_DEFAULT_MEDIUM_MODEL without OMQ_SUBAGENT_MODEL', () => {
    const output = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Agent',
        toolInput: { subagent_type: 'oh-my-qoder:architect', model: 'medium' },
        cwd: tempDir,
        session_id: 'session-tier-default-sonnet',
      },
      {
        OMQ_ROUTING_FORCE_INHERIT: 'true',
        OMQ_SUBAGENT_MODEL: '',
        DASHSCOPE_DEFAULT_MEDIUM_MODEL: 'qwen-plus',
      },
    );

    expect(output.continue).toBe(true);
    expect(JSON.stringify(output)).not.toContain('MODEL ROUTING');
  });

  it('allows tier alias "high" via DASHSCOPE_DEFAULT_HIGH_MODEL without OMQ_SUBAGENT_MODEL', () => {
    const output = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Agent',
        toolInput: { subagent_type: 'oh-my-qoder:architect', model: 'high' },
        cwd: tempDir,
        session_id: 'session-tier-default-opus',
      },
      {
        OMQ_ROUTING_FORCE_INHERIT: 'true',
        OMQ_SUBAGENT_MODEL: '',
        DASHSCOPE_DEFAULT_HIGH_MODEL: 'qwen-max-v1',
      },
    );

    expect(output.continue).toBe(true);
    expect(JSON.stringify(output)).not.toContain('MODEL ROUTING');
  });

  it('allows tier alias "low" via DASHSCOPE_DEFAULT_LOW_MODEL without OMQ_SUBAGENT_MODEL', () => {
    const output = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Agent',
        toolInput: { subagent_type: 'oh-my-qoder:executor', model: 'low' },
        cwd: tempDir,
        session_id: 'session-tier-default-haiku',
      },
      {
        OMQ_ROUTING_FORCE_INHERIT: 'true',
        OMQ_SUBAGENT_MODEL: '',
        DASHSCOPE_DEFAULT_LOW_MODEL: 'qwen-turbo-20251001-v1:0',
      },
    );

    expect(output.continue).toBe(true);
    expect(JSON.stringify(output)).not.toContain('MODEL ROUTING');
  });

  it('allows tier alias "high" via DASHSCOPE_DEFAULT_HIGH_MODEL without OMQ_SUBAGENT_MODEL', () => {
    const output = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Agent',
        toolInput: { subagent_type: 'oh-my-qoder:architect', model: 'high' },
        cwd: tempDir,
        session_id: 'session-tier-default-fable',
      },
      {
        OMQ_ROUTING_FORCE_INHERIT: 'true',
        OMQ_SUBAGENT_MODEL: '',
        DASHSCOPE_DEFAULT_HIGH_MODEL: 'qwen-max',
      },
    );

    expect(output.continue).toBe(true);
    expect(JSON.stringify(output)).not.toContain('MODEL ROUTING');
  });

  it('allows tier alias "high" via DASHSCOPE_DEFAULT_HIGH_MODEL env without OMQ_SUBAGENT_MODEL', () => {
    const output = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Agent',
        toolInput: { subagent_type: 'oh-my-qoder:executor', model: 'high' },
        cwd: tempDir,
        session_id: 'session-tier-fable-cc-bedrock-env',
      },
      {
        OMQ_ROUTING_FORCE_INHERIT: 'true',
        OMQ_SUBAGENT_MODEL: '',
        DASHSCOPE_DEFAULT_HIGH_MODEL: 'qwen-max',
      },
    );

    expect(output.continue).toBe(true);
    expect(JSON.stringify(output)).not.toContain('MODEL ROUTING');
  });

  it('blocks tier alias "high" when no fable model env is configured (issue #3246)', () => {
    const output = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Agent',
        toolInput: { subagent_type: 'oh-my-qoder:architect', model: 'high' },
        cwd: tempDir,
        session_id: 'session-tier-fable-no-env',
      },
      {
        OMQ_ROUTING_FORCE_INHERIT: 'true',
        OMQ_SUBAGENT_MODEL: '',
      },
    );

    const hookOutput = output.hookSpecificOutput as Record<string, unknown>;
    expect(hookOutput.permissionDecisionReason as string).toContain('MODEL ROUTING');
  });

  it.each([
    ['medium', 'DASHSCOPE_DEFAULT_MEDIUM_MODEL', 'qwen-plus', 'session-tier-proxy-sonnet'],
    ['high', 'DASHSCOPE_DEFAULT_HIGH_MODEL', 'qwen-max', 'session-tier-proxy-opus'],
    ['low', 'DASHSCOPE_DEFAULT_LOW_MODEL', 'qwen-turbo', 'session-tier-proxy-haiku'],
  ])('allows tier alias %s via DASHSCOPE_DEFAULT_*_MODEL when non-standard routing is active', (tier, envKey, proxyModel, sessionId) => {
    const output = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Agent',
        toolInput: { subagent_type: 'oh-my-qoder:executor', model: tier },
        cwd: tempDir,
        session_id: sessionId,
      },
      {
        OMQ_ROUTING_FORCE_INHERIT: 'true',
        OMQ_SUBAGENT_MODEL: '',
        [envKey]: proxyModel,
      },
    );

    expect(output.continue).toBe(true);
    expect(JSON.stringify(output)).not.toContain('MODEL ROUTING');
  });

  it('blocks tier alias when proxy ANTHROPIC_DEFAULT_*_MODEL is only whitespace', () => {
    const output = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Agent',
        toolInput: { subagent_type: 'oh-my-qoder:executor', model: 'medium' },
        cwd: tempDir,
        session_id: 'session-tier-proxy-empty',
      },
      {
        OMQ_ROUTING_FORCE_INHERIT: 'true',
        OMQ_SUBAGENT_MODEL: '',
        DASHSCOPE_DEFAULT_MEDIUM_MODEL: '   ',
      },
    );

    const hookOutput = output.hookSpecificOutput as Record<string, unknown>;
    expect(hookOutput.permissionDecisionReason as string).toContain('MODEL ROUTING');
  });

  it('preserves provider-specific validation for CLAUDE_CODE_BEDROCK_*_MODEL in proxy mode', () => {
    const output = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Agent',
        toolInput: { subagent_type: 'oh-my-qoder:executor', model: 'medium' },
        cwd: tempDir,
        session_id: 'session-tier-proxy-invalid-bedrock-var',
      },
      {
        OMQ_ROUTING_FORCE_INHERIT: 'true',
        OMQ_SUBAGENT_MODEL: '',
        DASHSCOPE_DEFAULT_MEDIUM_MODEL: 'glm-5.1:cloud',
      },
    );

    const hookOutput = output.hookSpecificOutput as Record<string, unknown>;
    expect(hookOutput.permissionDecisionReason as string).toContain('MODEL ROUTING');
  });

  it('allows DASHSCOPE_DEFAULT_*_MODEL in config force-inherit mode when no normal Qwen model is active', () => {
    const configDir = join(tempDir, '.omq');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'config.json'), JSON.stringify({ routing: { forceInherit: true } }));

    const output = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Agent',
        toolInput: { subagent_type: 'oh-my-qoder:executor', model: 'medium' },
        cwd: tempDir,
        session_id: 'session-tier-config-proxy-default',
      },
      {
        OMQ_ROUTING_FORCE_INHERIT: 'true',
        OMQ_SUBAGENT_MODEL: '',
        DASHSCOPE_DEFAULT_MEDIUM_MODEL: 'qwen-plus',
      },
    );

    expect(output.continue).toBe(true);
    expect(JSON.stringify(output)).not.toContain('MODEL ROUTING');
  });

  it('rejects proxy ANTHROPIC_DEFAULT_*_MODEL when env force-inherit runs under a normal Claude active model', () => {
    const output = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Agent',
        toolInput: { subagent_type: 'oh-my-qoder:executor', model: 'medium' },
        cwd: tempDir,
        session_id: 'session-tier-env-force-normal-claude-proxy-default',
      },
      {
        OMQ_ROUTING_FORCE_INHERIT: 'true',
        OMQ_SUBAGENT_MODEL: '',
        DASHSCOPE_MODEL: 'qwen-plus',
        DASHSCOPE_DEFAULT_MEDIUM_MODEL: 'glm-5.1:cloud',
      },
    );

    const hookOutput = output.hookSpecificOutput as Record<string, unknown>;
    expect(hookOutput.permissionDecisionReason as string).toContain('MODEL ROUTING');
  });

  it('OMQ_SUBAGENT_MODEL takes priority over ANTHROPIC_DEFAULT_*_MODEL when both set', () => {
    const output = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Agent',
        toolInput: { subagent_type: 'oh-my-qoder:architect', model: 'medium' },
        cwd: tempDir,
        session_id: 'session-tier-priority',
      },
      {
        OMQ_ROUTING_FORCE_INHERIT: 'true',
        OMQ_SUBAGENT_MODEL: 'qwen-plus',
        DASHSCOPE_DEFAULT_MEDIUM_MODEL: 'qwen-plus-v1:0',
      },
    );

    expect(output.continue).toBe(true);
    expect(JSON.stringify(output)).not.toContain('MODEL ROUTING');
  });

  it('accepts ANTHROPIC_DEFAULT_*_MODEL with [1m] suffix — CC handles [1m] correctly for explicit tier alias calls', () => {
    // Live-tested 2026-04-16: `claude -p --model sonnet` succeeds when
    // DASHSCOPE_DEFAULT_MEDIUM_MODEL=qwen-plus[1m].
    // CC resolves [1m]-suffixed values correctly for explicit model= calls;
    // only the inheritance path (stripping [1m] from session model) is broken.
    // resolveTierAliasToSafeModel uses isProviderSpecificModelId (not isSubagentSafeModelId)
    // so [1m]-suffixed provider IDs are valid routing targets.
    const output = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Agent',
        toolInput: { subagent_type: 'oh-my-qoder:executor', model: 'medium' },
        cwd: tempDir,
        session_id: 'session-tier-default-lm',
      },
      {
        OMQ_ROUTING_FORCE_INHERIT: 'true',
        OMQ_SUBAGENT_MODEL: '',
        DASHSCOPE_DEFAULT_MEDIUM_MODEL: 'qwen-plus[1m]',
      },
    );

    expect(output.continue).toBe(true);
    expect(JSON.stringify(output)).not.toContain('MODEL ROUTING');
  });

  it('resolves via DASHSCOPE_DEFAULT_MEDIUM_MODEL as sole configured env var', () => {
    const output = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Agent',
        toolInput: { subagent_type: 'oh-my-qoder:executor', model: 'medium' },
        cwd: tempDir,
        session_id: 'session-tier-cc-bedrock-env',
      },
      {
        OMQ_ROUTING_FORCE_INHERIT: 'true',
        OMQ_SUBAGENT_MODEL: '',
        DASHSCOPE_DEFAULT_MEDIUM_MODEL: 'qwen-plus-20250929-v1:0',
      },
    );

    expect(output.continue).toBe(true);
    expect(JSON.stringify(output)).not.toContain('MODEL ROUTING');
  });

  it('OMQ_MODEL_MEDIUM is not used as routing proof; DASHSCOPE_DEFAULT_MEDIUM_MODEL resolves the alias', () => {
    // OMQ_MODEL_* is excluded from the resolution chain because CC itself does not read it
    // for tier-alias routing. DASHSCOPE_DEFAULT_MEDIUM_MODEL (even with [1m]) is accepted
    // since CC handles that suffix correctly for explicit model= calls.
    const output = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Agent',
        toolInput: { subagent_type: 'oh-my-qoder:executor', model: 'medium' },
        cwd: tempDir,
        session_id: 'session-tier-omq-model-fallback',
      },
      {
        OMQ_ROUTING_FORCE_INHERIT: 'true',
        OMQ_SUBAGENT_MODEL: '',
        OMQ_MODEL_MEDIUM: 'qwen-plus',
        DASHSCOPE_DEFAULT_MEDIUM_MODEL: 'qwen-plus[1m]',
      },
    );

    expect(output.continue).toBe(true);
    expect(JSON.stringify(output)).not.toContain('MODEL ROUTING');
  });

  it('blocks tier alias when only OMQ_MODEL_* is set (not a CC-side routing proof)', () => {
    // OMQ_MODEL_* proves OMQ-bridge routing, not CC model resolution. Without a CC-native
    // var (ANTHROPIC_DEFAULT_* or CLAUDE_CODE_BEDROCK_*), CC cannot route the tier alias
    // and the downstream Agent/Task call would fail — so the hook must deny.
    const output = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Agent',
        toolInput: { subagent_type: 'oh-my-qoder:executor', model: 'medium' },
        cwd: tempDir,
        session_id: 'session-tier-omq-model-only',
      },
      {
        OMQ_ROUTING_FORCE_INHERIT: 'true',
        OMQ_SUBAGENT_MODEL: '',
        OMQ_MODEL_MEDIUM: 'qwen-plus',
        DASHSCOPE_DEFAULT_MEDIUM_MODEL: '',
      },
    );

    const hookOutput = output.hookSpecificOutput as Record<string, unknown>;
    expect(hookOutput.permissionDecisionReason as string).toContain('MODEL ROUTING');
  });

  it('blocks tier alias when NO safe model env is configured at all', () => {
    const output = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Agent',
        toolInput: { subagent_type: 'oh-my-qoder:architect', model: 'medium' },
        cwd: tempDir,
        session_id: 'session-tier-alias-no-env',
      },
      {
        OMQ_ROUTING_FORCE_INHERIT: 'true',
        OMQ_SUBAGENT_MODEL: '',
        DASHSCOPE_DEFAULT_MEDIUM_MODEL: '',
      },
    );

    const hookOutput = output.hookSpecificOutput as Record<string, unknown>;
    expect(hookOutput.permissionDecisionReason as string).toContain('MODEL ROUTING');
  });

  it('agent-definition deny works via DASHSCOPE_DEFAULT_*_MODEL without OMQ_SUBAGENT_MODEL', () => {
    const pluginRoot = join(tempDir, 'bare-model-default-env');
    const agentsDir = join(pluginRoot, 'agents');
    mkdirSync(agentsDir, { recursive: true });
    // Use a qwen model with [1m] suffix in the agent definition so the enforcer denies it.
    // The [1m] suffix makes isSubagentSafeModelId return false, but normalizeToTierAlias
    // still resolves it to 'high', enabling the deny-with-guidance path.
    writeFileSync(
      join(agentsDir, 'critic.md'),
      '---\nname: critic\nmodel: qwen-max[1m]\n---\nPlugin critic body.',
    );

    const output = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Agent',
        toolInput: {
          subagent_type: 'oh-my-qoder:critic',
          description: 'Review spec',
          prompt: 'Review this spec',
        },
        cwd: tempDir,
        session_id: 'session-agent-def-default-env',
      },
      {
        OMQ_ROUTING_FORCE_INHERIT: 'true',
        OMQ_SUBAGENT_MODEL: '',
        DASHSCOPE_DEFAULT_HIGH_MODEL: 'qwen-max',
        QODER_PLUGIN_ROOT: pluginRoot,
      },
    );

    const hookOutput = output.hookSpecificOutput as Record<string, unknown>;
    expect(output.continue).toBe(true);
    expect(hookOutput.permissionDecision).toBe('deny');
    expect(hookOutput.permissionDecisionReason as string).toContain('[MODEL ROUTING]');
    expect(hookOutput.permissionDecisionReason as string).toContain('qwen-max[1m]');
  });

  it('allows tier alias when OMQ_SUBAGENT_MODEL is a valid provider-specific model ID', () => {
    const output = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Agent',
        toolInput: { subagent_type: 'oh-my-qoder:executor', model: 'medium' },
        cwd: tempDir,
        session_id: 'session-tier-alias-bare',
      },
      {
        OMQ_ROUTING_FORCE_INHERIT: 'true',
        OMQ_SUBAGENT_MODEL: 'qwen-plus',
      },
    );

    expect(output.continue).toBe(true);
    expect(JSON.stringify(output)).not.toContain('MODEL ROUTING');
  });

  it('blocks tier alias when OMQ_SUBAGENT_MODEL has a [1m] extended-context suffix', () => {
    const output = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Agent',
        toolInput: { subagent_type: 'oh-my-qoder:executor', model: 'high' },
        cwd: tempDir,
        session_id: 'session-tier-alias-lm',
      },
      {
        OMQ_ROUTING_FORCE_INHERIT: 'true',
        OMQ_SUBAGENT_MODEL: 'qwen-plus[1m]',
      },
    );

    const hookOutput = output.hookSpecificOutput as Record<string, unknown>;
    expect(hookOutput.permissionDecisionReason as string).toContain('MODEL ROUTING');
  });


  it('still blocks model ID with [1m] suffix even when OMQ_SUBAGENT_MODEL is set', () => {
    const output = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Agent',
        toolInput: { subagent_type: 'oh-my-qoder:executor', model: 'qwen-plus[1m]' },
        cwd: tempDir,
        session_id: 'session-bare-anthropic',
      },
      {
        OMQ_ROUTING_FORCE_INHERIT: 'true',
        OMQ_SUBAGENT_MODEL: 'qwen-plus',
      },
    );

    const hookOutput = output.hookSpecificOutput as Record<string, unknown>;
    expect(hookOutput.permissionDecisionReason as string).toContain('MODEL ROUTING');
  });

  // === Agent definition model routing (issue: subagent_type bare-model-id on Bedrock) ===

  it('denies Agent call when a discovered plugin agent definition has an unsafe model ID with [1m] suffix', () => {
    const pluginRoot = join(tempDir, 'bare-model-plugin-agent');
    const agentsDir = join(pluginRoot, 'agents');
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(
      join(agentsDir, 'critic.md'),
      '---\nname: critic\nmodel: qwen-max[1m]\n---\nPlugin critic body.',
    );

    const output = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Agent',
        toolInput: {
          subagent_type: 'oh-my-qoder:critic',
          description: 'Review spec',
          prompt: 'Review this spec',
        },
        cwd: tempDir,
        session_id: 'session-agent-def-model',
      },
      {
        OMQ_ROUTING_FORCE_INHERIT: 'true',
        OMQ_SUBAGENT_MODEL: 'qwen-plus',
        DASHSCOPE_DEFAULT_HIGH_MODEL: 'qwen-max',
        QODER_PLUGIN_ROOT: pluginRoot,
      },
    );

    const hookOutput = output.hookSpecificOutput as Record<string, unknown>;
    expect(output.continue).toBe(true);
    expect(hookOutput.permissionDecision).toBe('deny');
    expect(hookOutput.permissionDecisionReason as string).toContain('[MODEL ROUTING]');
    expect(hookOutput.permissionDecisionReason as string).toContain('qwen-max[1m]');
  });

  it('denies Task call when a discovered plugin agent definition has an unsafe model ID with [1m] suffix', () => {
    const pluginRoot = join(tempDir, 'bare-model-plugin-task');
    const agentsDir = join(pluginRoot, 'agents');
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(
      join(agentsDir, 'executor.md'),
      '---\nname: executor\nmodel: qwen-plus[1m]\n---\nPlugin executor body.',
    );

    const output = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Task',
        toolInput: {
          subagent_type: 'oh-my-qoder:executor',
          description: 'Implement feature',
          prompt: 'Do the thing',
        },
        cwd: tempDir,
        session_id: 'session-task-def-model',
      },
      {
        OMQ_ROUTING_FORCE_INHERIT: 'true',
        OMQ_SUBAGENT_MODEL: 'qwen-plus',
        DASHSCOPE_DEFAULT_MEDIUM_MODEL: 'qwen-plus',
        QODER_PLUGIN_ROOT: pluginRoot,
      },
    );

    const hookOutput = output.hookSpecificOutput as Record<string, unknown>;
    expect(output.continue).toBe(true);
    expect(hookOutput.permissionDecision).toBe('deny');
    expect(hookOutput.permissionDecisionReason as string).toContain('[MODEL ROUTING]');
  });

  it('deny message includes the unsafe model from a plugin definition and suggests the tier alias', () => {
    const pluginRoot = join(tempDir, 'bare-model-plugin-message');
    const agentsDir = join(pluginRoot, 'agents');
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(
      join(agentsDir, 'critic.md'),
      '---\nname: critic\nmodel: qwen-max[1m]\n---\nPlugin critic body.',
    );

    const output = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Agent',
        toolInput: {
          subagent_type: 'oh-my-qoder:critic',
          description: 'Review spec',
          prompt: 'Review this spec',
        },
        cwd: tempDir,
        session_id: 'session-deny-message',
      },
      {
        OMQ_ROUTING_FORCE_INHERIT: 'true',
        OMQ_SUBAGENT_MODEL: 'qwen-plus',
        DASHSCOPE_DEFAULT_HIGH_MODEL: 'qwen-max',
        QODER_PLUGIN_ROOT: pluginRoot,
      },
    );

    const reason = (output.hookSpecificOutput as Record<string, unknown>).permissionDecisionReason as string;
    expect(reason).toContain('qwen-max[1m]');
    expect(reason).toContain('high'); // tier alias suggestion
    expect(reason).toContain('qwen-max'); // resolved safe model in guidance
  });

  it('allows tier alias with OMQ_SUBAGENT_MODEL set (escape hatch for denied subagent_type calls)', () => {
    const output = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Agent',
        toolInput: {
          subagent_type: 'oh-my-qoder:critic',
          model: 'high',
          description: 'Review spec',
          prompt: 'Review this spec',
        },
        cwd: tempDir,
        session_id: 'session-tier-alias-escape',
      },
      {
        OMQ_ROUTING_FORCE_INHERIT: 'true',
        OMQ_SUBAGENT_MODEL: 'qwen-plus',
      },
    );

    expect(output.continue).toBe(true);
    expect(JSON.stringify(output)).not.toContain('MODEL ROUTING');
  });

  it('still blocks tier alias when OMQ_SUBAGENT_MODEL is not configured', () => {
    const output = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Agent',
        toolInput: {
          subagent_type: 'oh-my-qoder:critic',
          model: 'high',
          description: 'Review spec',
          prompt: 'Review this spec',
        },
        cwd: tempDir,
        session_id: 'session-tier-alias-no-subagent-model',
      },
      {
        OMQ_ROUTING_FORCE_INHERIT: 'true',
        OMQ_SUBAGENT_MODEL: '',
      },
    );

    const hookOutput = output.hookSpecificOutput as Record<string, unknown>;
    expect(hookOutput.permissionDecision as string).toBe('deny');
    expect(hookOutput.permissionDecisionReason as string).toContain('MODEL ROUTING');
  });

  it('does NOT deny subagent_type call when forceInherit is disabled', () => {
    const output = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Agent',
        toolInput: {
          subagent_type: 'oh-my-qoder:critic',
          description: 'Review spec',
          prompt: 'Review this spec',
        },
        cwd: tempDir,
        session_id: 'session-no-force-inherit',
      },
      {
        OMQ_ROUTING_FORCE_INHERIT: 'false',
        OMQ_SUBAGENT_MODEL: '',
      },
    );

    expect(output.continue).toBe(true);
    expect(JSON.stringify(output)).not.toContain('MODEL ROUTING');
  });

  it('does not deny shipped agent definitions that use routable tier aliases in frontmatter', () => {
    const output = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Agent',
        toolInput: {
          subagent_type: 'oh-my-qoder:critic',
          description: 'Review spec',
          prompt: 'Review this spec',
        },
        cwd: tempDir,
        session_id: 'session-shipped-tier-alias',
      },
      {
        OMQ_ROUTING_FORCE_INHERIT: 'true',
        OMQ_SUBAGENT_MODEL: 'qwen-plus-v1:0',
      },
    );

    expect(output.continue).toBe(true);
    expect(JSON.stringify(output)).not.toContain('MODEL ROUTING');
  });

  it('does not throw or deny when subagent_type is a non-string value', () => {
    const output = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Agent',
        toolInput: {
          subagent_type: 42 as unknown as string,
          description: 'Some task',
          prompt: 'Do something',
        },
        cwd: tempDir,
        session_id: 'session-non-string-subagent-type',
      },
      {
        OMQ_ROUTING_FORCE_INHERIT: 'true',
        OMQ_SUBAGENT_MODEL: 'qwen-plus',
      },
    );

    expect(output.continue).toBe(true);
    expect(JSON.stringify(output)).not.toContain('MODEL ROUTING');
  });

  it('treats path-traversal subagent_type as unknown agent and does not deny', () => {
    const output = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Agent',
        toolInput: {
          subagent_type: 'oh-my-qoder:../docs/CLAUDE',
          description: 'Some task',
          prompt: 'Do something',
        },
        cwd: tempDir,
        session_id: 'session-path-traversal',
      },
      {
        OMQ_ROUTING_FORCE_INHERIT: 'true',
        OMQ_SUBAGENT_MODEL: 'qwen-plus',
      },
    );

    expect(output.continue).toBe(true);
    expect(JSON.stringify(output)).not.toContain('MODEL ROUTING');
  });

  it('falls back to script-relative agents dir when QODER_PLUGIN_ROOT points to a non-existent path and allows shipped tier aliases', () => {
    const output = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Agent',
        toolInput: {
          subagent_type: 'oh-my-qoder:critic',
          description: 'Review spec',
          prompt: 'Review this spec',
        },
        cwd: tempDir,
        session_id: 'session-stale-plugin-root',
      },
      {
        OMQ_ROUTING_FORCE_INHERIT: 'true',
        OMQ_SUBAGENT_MODEL: 'qwen-plus',
        QODER_PLUGIN_ROOT: '/nonexistent/path/that/does/not/exist',
      },
    );

    expect(output.continue).toBe(true);
    expect(JSON.stringify(output)).not.toContain('MODEL ROUTING');
  });

  it('falls back to script-relative agents dir when QODER_PLUGIN_ROOT/agents exists but lacks the specific agent file, and allows shipped tier aliases', () => {
    // QODER_PLUGIN_ROOT/agents/ exists (non-empty check passes) but does not contain critic.md
    const pluginRoot = join(tempDir, 'partial-plugin');
    const pluginAgentsDir = join(pluginRoot, 'agents');
    mkdirSync(pluginAgentsDir, { recursive: true });
    // Write a different agent file so the dir exists but critic.md is absent
    writeFileSync(join(pluginAgentsDir, 'other-agent.md'), '---\nname: other\n---\nBody.');

    const output = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Agent',
        toolInput: {
          subagent_type: 'oh-my-qoder:critic',
          description: 'Review spec',
          prompt: 'Review this spec',
        },
        cwd: tempDir,
        session_id: 'session-partial-plugin',
      },
      {
        OMQ_ROUTING_FORCE_INHERIT: 'true',
        OMQ_SUBAGENT_MODEL: 'qwen-plus',
        QODER_PLUGIN_ROOT: pluginRoot,
      },
    );

    expect(output.continue).toBe(true);
    expect(JSON.stringify(output)).not.toContain('MODEL ROUTING');
  });

  it('does not deny when model: appears inside a body --- block (not real frontmatter)', () => {
    // File starts with normal text, then a horizontal-rule --- section containing model:
    const pluginRoot = join(tempDir, 'fake-plugin-body-hr');
    const agentsDir = join(pluginRoot, 'agents');
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(
      join(agentsDir, 'body-hr-agent.md'),
      'Some introductory text.\n\n---\nmodel: qwen-max\n---\n\nMore body text.',
    );

    const output = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Agent',
        toolInput: {
          subagent_type: 'oh-my-qoder:body-hr-agent',
          description: 'Some task',
          prompt: 'Do something',
        },
        cwd: tempDir,
        session_id: 'session-body-hr-model',
      },
      {
        OMQ_ROUTING_FORCE_INHERIT: 'true',
        OMQ_SUBAGENT_MODEL: 'qwen-plus',
        QODER_PLUGIN_ROOT: pluginRoot,
      },
    );

    // A mid-body --- block is not frontmatter; must not trigger a deny
    expect(output.continue).toBe(true);
    expect(JSON.stringify(output)).not.toContain('MODEL ROUTING');
  });

  it('does not deny when model: appears only in the agent body (not frontmatter)', () => {
    // Frontmatter has no model key; body text contains "model: qwen-max"
    const pluginRoot = join(tempDir, 'fake-plugin-body');
    const agentsDir = join(pluginRoot, 'agents');
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(
      join(agentsDir, 'body-model-agent.md'),
      '---\nname: body-model-agent\n---\nThis agent can spawn sub-agents.\nmodel: qwen-max is sometimes used in the body text.',
    );

    const output = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Agent',
        toolInput: {
          subagent_type: 'oh-my-qoder:body-model-agent',
          description: 'Some task',
          prompt: 'Do something',
        },
        cwd: tempDir,
        session_id: 'session-body-model',
      },
      {
        OMQ_ROUTING_FORCE_INHERIT: 'true',
        OMQ_SUBAGENT_MODEL: 'qwen-plus',
        QODER_PLUGIN_ROOT: pluginRoot,
      },
    );

    // model: in the body must not trigger a deny — frontmatter has no model field
    expect(output.continue).toBe(true);
    expect(JSON.stringify(output)).not.toContain('MODEL ROUTING');
  });

  it('strips surrounding quotes from quoted YAML model values and still denies unsafe model IDs', () => {
    // Create a temporary agent definition with a quoted model scalar
    const pluginRoot = join(tempDir, 'fake-plugin');
    const agentsDir = join(pluginRoot, 'agents');
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(
      join(agentsDir, 'quoted-model-agent.md'),
      '---\nname: quoted-model-agent\nmodel: "qwen-max[1m]"\n---\nAgent body.',
    );

    const output = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Agent',
        toolInput: {
          subagent_type: 'oh-my-qoder:quoted-model-agent',
          description: 'Review spec',
          prompt: 'Review this spec',
        },
        cwd: tempDir,
        session_id: 'session-quoted-model',
      },
      {
        OMQ_ROUTING_FORCE_INHERIT: 'true',
        OMQ_SUBAGENT_MODEL: 'qwen-plus',
        DASHSCOPE_DEFAULT_HIGH_MODEL: 'qwen-max',
        QODER_PLUGIN_ROOT: pluginRoot,
      },
    );

    // Quoted model "qwen-max[1m]" must be stripped of quotes before the safety check
    const hookOutput = output.hookSpecificOutput as Record<string, unknown>;
    expect(output.continue).toBe(true);
    expect(hookOutput.permissionDecision).toBe('deny');
    expect(hookOutput.permissionDecisionReason as string).toContain('[MODEL ROUTING]');
    expect(hookOutput.permissionDecisionReason as string).toContain('qwen-max[1m]');
  });

  it('allows a valid provider-specific model ID written with YAML quotes', () => {
    // Same setup but model is a valid Bedrock ID — should NOT be denied
    const pluginRoot = join(tempDir, 'fake-plugin-2');
    const agentsDir = join(pluginRoot, 'agents');
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(
      join(agentsDir, 'bedrock-quoted-agent.md'),
      '---\nname: bedrock-quoted-agent\nmodel: "qwen-plus"\n---\nAgent body.',
    );

    const output = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Agent',
        toolInput: {
          subagent_type: 'oh-my-qoder:bedrock-quoted-agent',
          description: 'Do something',
          prompt: 'Do it',
        },
        cwd: tempDir,
        session_id: 'session-bedrock-quoted',
      },
      {
        OMQ_ROUTING_FORCE_INHERIT: 'true',
        OMQ_SUBAGENT_MODEL: 'qwen-plus',
        QODER_PLUGIN_ROOT: pluginRoot,
      },
    );

    expect(output.continue).toBe(true);
    expect(JSON.stringify(output)).not.toContain('MODEL ROUTING');
  });

  it('strips UTF-8 BOM before frontmatter parsing so agent-definition model check still fires', () => {
    const pluginRoot = join(tempDir, 'fake-plugin-bom');
    const agentsDir = join(pluginRoot, 'agents');
    mkdirSync(agentsDir, { recursive: true });
    // Write agent file with BOM prefix (\uFEFF)
    writeFileSync(
      join(agentsDir, 'bom-agent.md'),
      '\uFEFF---\nname: bom-agent\nmodel: qwen-max[1m]\n---\nAgent body with BOM.',
    );

    const output = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Agent',
        toolInput: {
          subagent_type: 'oh-my-qoder:bom-agent',
          description: 'BOM test',
          prompt: 'Test BOM handling',
        },
        cwd: tempDir,
        session_id: 'session-bom-test',
      },
      {
        OMQ_ROUTING_FORCE_INHERIT: 'true',
        OMQ_SUBAGENT_MODEL: 'qwen-plus',
        DASHSCOPE_DEFAULT_HIGH_MODEL: 'qwen-max',
        QODER_PLUGIN_ROOT: pluginRoot,
      },
    );

    // BOM must be stripped so the frontmatter regex matches and the unsafe
    // [1m]-suffixed model ID triggers a deny — not silently bypassed.
    const hookOutput = output.hookSpecificOutput as Record<string, unknown>;
    expect(output.continue).toBe(true);
    expect(hookOutput.permissionDecision).toBe('deny');
    expect(hookOutput.permissionDecisionReason as string).toContain('[MODEL ROUTING]');
    expect(hookOutput.permissionDecisionReason as string).toContain('bom-agent');
  });

  it('does NOT deny Agent call without subagent_type in forceInherit mode (normal inheritance unchanged)', () => {
    const output = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Agent',
        toolInput: {
          description: 'Some task',
          prompt: 'Do something',
        },
        cwd: tempDir,
        session_id: 'session-no-subagent-type',
      },
      {
        OMQ_ROUTING_FORCE_INHERIT: 'true',
      },
    );

    expect(output.continue).toBe(true);
    expect(JSON.stringify(output)).not.toContain('MODEL ROUTING');
  });

  it('does NOT deny when subagent_type refers to an unknown agent (no definition file)', () => {
    const output = runPreToolEnforcerWithEnv(
      {
        tool_name: 'Agent',
        toolInput: {
          subagent_type: 'oh-my-qoder:nonexistent-agent-xyz',
          description: 'Some task',
          prompt: 'Do something',
        },
        cwd: tempDir,
        session_id: 'session-unknown-agent',
      },
      {
        OMQ_ROUTING_FORCE_INHERIT: 'true',
        OMQ_SUBAGENT_MODEL: 'qwen-plus',
      },
    );

    expect(output.continue).toBe(true);
    expect(JSON.stringify(output)).not.toContain('MODEL ROUTING');
  });

  it('does not write skill-active-state for unknown custom skills', () => {
    const sessionId = 'session-1581';

    const output = runPreToolEnforcer({
      tool_name: 'Skill',
      toolInput: {
        skill: 'phase-resume',
      },
      cwd: tempDir,
      session_id: sessionId,
    });

    expect(output).toEqual({ continue: true, suppressOutput: true });
    expect(
      existsSync(join(tempDir, '.omq', 'state', 'sessions', sessionId, 'skill-active-state.json')),
    ).toBe(false);
  });
});

// === Force-agent-delegation tests (issue #3095) ===

describe('pre-tool-enforcer force-agent-delegation enforcement', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pre-tool-enforcer-fad-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function writeDelegationConfig(rules: Array<Record<string, unknown>>, enforce = true): void {
    writeJson(join(tempDir, '.omq', 'config.json'), {
      routing: {
        forceDelegation: { enforce, rules },
      },
    });
  }

  it('does nothing when force-delegation config is absent (default off)', () => {
    for (let i = 0; i < 5; i++) {
      const output = runPreToolEnforcer({
        tool_name: 'Read',
        toolInput: { file_path: `${tempDir}/file-${i}.ts` },
        cwd: tempDir,
        session_id: 'session-fad-no-config',
      });
      expect(output.continue).toBe(true);
      const hookOutput = (output.hookSpecificOutput as Record<string, unknown>) || {};
      expect(hookOutput.permissionDecision).toBeUndefined();
    }
  });

  it('does nothing when enforce: false even if rules are defined', () => {
    writeDelegationConfig(
      [{ pattern: 'Read', threshold: { count: 2, windowSeconds: 60 } }],
      false,
    );
    for (let i = 0; i < 5; i++) {
      const output = runPreToolEnforcer({
        tool_name: 'Read',
        toolInput: { file_path: `${tempDir}/file-${i}.ts` },
        cwd: tempDir,
        session_id: 'session-fad-disabled',
      });
      expect(output.continue).toBe(true);
      const hookOutput = (output.hookSpecificOutput as Record<string, unknown>) || {};
      expect(hookOutput.permissionDecision).toBeUndefined();
    }
  });

  it('allows tool calls under the configured threshold', () => {
    writeDelegationConfig([
      { pattern: 'Read', threshold: { count: 5, windowSeconds: 60 } },
    ]);
    for (let i = 0; i < 4; i++) {
      const output = runPreToolEnforcer({
        tool_name: 'Read',
        toolInput: { file_path: `${tempDir}/file-${i}.ts` },
        cwd: tempDir,
        session_id: 'session-fad-under',
      });
      const hookOutput = (output.hookSpecificOutput as Record<string, unknown>) || {};
      expect(hookOutput.permissionDecision).toBeUndefined();
    }
  });

  it('blocks the call that crosses the threshold and surfaces the configured deny message', () => {
    const denyMessage =
      'Too many Reads — spawn Agent(subagent_type=\'oh-my-qoder:explore\', model=\'haiku\'). Bypass: ALLOW_RAW_READ=1.';
    writeDelegationConfig([
      {
        pattern: 'Read',
        threshold: { count: 3, windowSeconds: 60 },
        denyMessage,
        bypassEnv: 'ALLOW_RAW_READ',
      },
    ]);

    let lastOutput: Record<string, unknown> = {};
    for (let i = 0; i < 3; i++) {
      lastOutput = runPreToolEnforcer({
        tool_name: 'Read',
        toolInput: { file_path: `${tempDir}/file-${i}.ts` },
        cwd: tempDir,
        session_id: 'session-fad-block',
      });
    }

    const hookOutput = lastOutput.hookSpecificOutput as Record<string, unknown>;
    expect(lastOutput.continue).toBe(true);
    expect(hookOutput.hookEventName).toBe('PreToolUse');
    expect(hookOutput.permissionDecision).toBe('deny');
    expect(hookOutput.permissionDecisionReason).toBe(denyMessage);
  });

  it('respects the per-rule bypass env var', () => {
    writeDelegationConfig([
      {
        pattern: 'Read',
        threshold: { count: 2, windowSeconds: 60 },
        bypassEnv: 'ALLOW_RAW_READ',
      },
    ]);

    for (let i = 0; i < 5; i++) {
      const output = runPreToolEnforcerWithEnv(
        {
          tool_name: 'Read',
          toolInput: { file_path: `${tempDir}/file-${i}.ts` },
          cwd: tempDir,
          session_id: 'session-fad-bypass',
        },
        { ALLOW_RAW_READ: '1' },
      );
      const hookOutput = (output.hookSpecificOutput as Record<string, unknown>) || {};
      expect(hookOutput.permissionDecision).toBeUndefined();
    }
  });

  it('matches only the configured pattern and ignores other tools', () => {
    writeDelegationConfig([
      { pattern: 'Read', threshold: { count: 2, windowSeconds: 60 } },
    ]);

    for (let i = 0; i < 5; i++) {
      const output = runPreToolEnforcer({
        tool_name: 'Bash',
        toolInput: { command: `echo ${i}` },
        cwd: tempDir,
        session_id: 'session-fad-other-tool',
      });
      const hookOutput = (output.hookSpecificOutput as Record<string, unknown>) || {};
      expect(hookOutput.permissionDecision).toBeUndefined();
    }
  });

  it('supports alternation patterns for Read|Grep|Glob', () => {
    writeDelegationConfig([
      {
        pattern: 'Read|Grep|Glob',
        threshold: { count: 3, windowSeconds: 60 },
        denyMessage: 'Investigation budget exhausted — delegate to explore agent.',
      },
    ]);

    runPreToolEnforcer({ tool_name: 'Read', cwd: tempDir, session_id: 'session-fad-alt' });
    runPreToolEnforcer({ tool_name: 'Grep', cwd: tempDir, session_id: 'session-fad-alt', toolInput: { pattern: 'foo' } });
    const third = runPreToolEnforcer({
      tool_name: 'Glob',
      cwd: tempDir,
      session_id: 'session-fad-alt',
      toolInput: { pattern: '**/*.ts' },
    });

    const hookOutput = third.hookSpecificOutput as Record<string, unknown>;
    expect(hookOutput.permissionDecision).toBe('deny');
    expect(String(hookOutput.permissionDecisionReason)).toContain('Investigation budget');
  });
});

describe('pre-tool-enforcer agents.<name>.model injection (issue #3242)', () => {
  let tempDir: string;
  let xdgConfigHome: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pre-tool-enforcer-agent-model-'));
    xdgConfigHome = join(tempDir, 'xdg-config');
    mkdirSync(join(xdgConfigHome, 'qoder-omq'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function writeUserConfig(jsonc: string): void {
    writeFileSync(join(xdgConfigHome, 'qoder-omq', 'config.jsonc'), jsonc);
  }

  function writeProjectConfig(jsonc: string): void {
    const dir = join(tempDir, '.claude');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'omq.jsonc'), jsonc);
  }

  function run(input: Record<string, unknown>, env: Record<string, string> = {}): Record<string, unknown> {
    return runPreToolEnforcerWithEnv(
      { cwd: tempDir, ...input },
      { XDG_CONFIG_HOME: xdgConfigHome, OMQ_ROUTING_FORCE_INHERIT: 'false', ...env },
    );
  }

  function updatedModel(output: Record<string, unknown>): unknown {
    const hookOutput = output.hookSpecificOutput as Record<string, unknown> | undefined;
    const updatedInput = hookOutput?.updatedInput as Record<string, unknown> | undefined;
    return updatedInput?.model;
  }

  it('injects configured model via updatedInput for native Task calls without a model param', () => {
    writeUserConfig('{ "agents": { "explore": { "model": "medium" } } }');
    const output = run({
      tool_name: 'Task',
      toolInput: { subagent_type: 'oh-my-qoder:explore', prompt: 'x', description: 'find files' },
      session_id: 'session-3242-inject',
    });
    expect(updatedModel(output)).toBe('medium');
  });

  it('does not inject when no per-agent override is configured', () => {
    writeUserConfig('{ "agents": {} }');
    const output = run({
      tool_name: 'Task',
      toolInput: { subagent_type: 'oh-my-qoder:explore', prompt: 'x', description: 'find files' },
      session_id: 'session-3242-no-override',
    });
    expect(updatedModel(output)).toBeUndefined();
  });

  it('preserves an explicit model param and does not inject', () => {
    writeUserConfig('{ "agents": { "explore": { "model": "medium" } } }');
    const output = run({
      tool_name: 'Task',
      toolInput: { subagent_type: 'oh-my-qoder:explore', model: 'high', prompt: 'x', description: 'find files' },
      session_id: 'session-3242-explicit-model',
    });
    expect(updatedModel(output)).toBeUndefined();
  });

  it('normalizes full Claude model IDs to a CC tier alias', () => {
    writeUserConfig('{ "agents": { "executor": { "model": "qwen-max" } } }');
    const output = run({
      tool_name: 'Task',
      toolInput: { subagent_type: 'oh-my-qoder:executor', prompt: 'x', description: 'do work' },
      session_id: 'session-3242-normalize',
    });
    expect(updatedModel(output)).toBe('high');
  });

  it('lets project config override user config', () => {
    writeUserConfig('{ "agents": { "explore": { "model": "low" } } }');
    writeProjectConfig('{ "agents": { "explore": { "model": "medium" } } }');
    const output = run({
      tool_name: 'Task',
      toolInput: { subagent_type: 'oh-my-qoder:explore', prompt: 'x', description: 'find files' },
      session_id: 'session-3242-project-override',
    });
    expect(updatedModel(output)).toBe('medium');
  });

  it('resolves deprecated subagent aliases to the canonical config key', () => {
    writeUserConfig('{ "agents": { "codeReviewer": { "model": "high" } } }');
    const output = run({
      tool_name: 'Agent',
      toolInput: { subagent_type: 'oh-my-qoder:code-reviewer', prompt: 'x', description: 'review code' },
      session_id: 'session-3242-alias',
    });
    expect(updatedModel(output)).toBe('high');
  });

  it('does not inject under forceInherit even when an override is configured', () => {
    writeUserConfig('{ "agents": { "explore": { "model": "medium" } } }');
    const output = run(
      {
        tool_name: 'Task',
        toolInput: { subagent_type: 'oh-my-qoder:explore', prompt: 'x', description: 'find files' },
        session_id: 'session-3242-force-inherit',
      },
      { OMQ_ROUTING_FORCE_INHERIT: 'true' },
    );
    expect(updatedModel(output)).toBeUndefined();
  });

  it('still injects the configured model when the advisory message is throttled (suppressOutput)', () => {
    writeUserConfig('{ "agents": { "explore": { "model": "medium" } } }');
    const input = {
      tool_name: 'Task',
      toolInput: { subagent_type: 'oh-my-qoder:explore', prompt: 'x', description: 'find files' },
      session_id: 'session-3242-throttle',
    };
    // Pin the throttle clock so the second identical call lands inside the cooldown
    // window and is advisory-throttled.
    const throttleEnv = {
      OMQ_PRE_TOOL_ADVISORY_COOLDOWN_MS: '5000',
      OMQ_PRE_TOOL_ADVISORY_NOW_MS: '1000',
    };

    const first = run(input, throttleEnv);
    const throttled = run(input, throttleEnv);

    // First call: advisory emitted alongside the injection.
    expect(updatedModel(first)).toBe('medium');
    // Second identical call: advisory suppressed, but the model injection MUST survive.
    expect(throttled.suppressOutput).toBe(true);
    expect(throttled.hookSpecificOutput).toBeDefined();
    expect(updatedModel(throttled)).toBe('medium');
  });
});
