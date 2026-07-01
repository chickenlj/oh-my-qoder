import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFileSync } from 'child_process';
import { describe, expect, it } from 'vitest';

const persistentModeScript = join(process.cwd(), 'scripts', 'persistent-mode.mjs');
const preToolScript = join(process.cwd(), 'scripts', 'pre-tool-enforcer.mjs');
const keywordScript = join(process.cwd(), 'scripts', 'keyword-detector.mjs');

function runHook(script: string, payload: Record<string, unknown>, env: Record<string, string> = {}) {
  const stdout = execFileSync(process.execPath, [script], {
    input: JSON.stringify(payload),
    encoding: 'utf-8',
    cwd: process.cwd(),
    env: { ...process.env, QODER_PLUGIN_ROOT: '', ...env },
  });
  return JSON.parse(stdout);
}

function makeTempProject(prefix: string) {
  const cwd = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(cwd, '.omq', 'state', 'sessions', 'session-a'), { recursive: true });
  return cwd;
}

function writeUltragoalState(cwd: string, overrides: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  const state = {
    active: true,
    started_at: now,
    last_checked_at: now,
    session_id: 'session-a',
    project_path: cwd,
    current_phase: 'executing',
    claude_goal_objective: 'Complete issue #3098 ultragoal persistence.',
    ...overrides,
  };
  writeFileSync(
    join(cwd, '.omq', 'state', 'sessions', 'session-a', 'ultragoal-state.json'),
    `${JSON.stringify(state, null, 2)}\n`,
  );
  return state;
}

describe('ultragoal persistence and Qoder /goal enforcement', () => {
  it('allows PreToolUse when active ultragoal has a matching active Qoder /goal', () => {
    const cwd = makeTempProject('omq-ultragoal-pass-');
    writeUltragoalState(cwd);

    const result = runHook(preToolScript, {
      cwd,
      session_id: 'session-a',
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
      goal: { objective: 'Complete issue #3098 ultragoal persistence.', status: 'active' },
    });

    expect(result.hookSpecificOutput?.permissionDecision).not.toBe('deny');
  });

  it('allows ultragoal CLI bootstrap commands before Qoder /goal is visible', () => {
    const cwd = makeTempProject('omq-ultragoal-bootstrap-');
    writeUltragoalState(cwd);

    const createGoals = runHook(preToolScript, {
      cwd,
      session_id: 'session-a',
      tool_name: 'Bash',
      tool_input: { command: 'omq ultragoal create-goals --brief "fix issue"' },
    });
    const completeGoals = runHook(preToolScript, {
      cwd,
      session_id: 'session-a',
      tool_name: 'Bash',
      tool_input: { command: 'omq ultragoal complete-goals' },
    });

    expect(createGoals.hookSpecificOutput?.permissionDecision).not.toBe('deny');
    expect(completeGoals.hookSpecificOutput?.permissionDecision).not.toBe('deny');
  });

  it('denies PreToolUse when active ultragoal has no visible Qoder /goal', () => {
    const cwd = makeTempProject('omq-ultragoal-deny-');
    writeUltragoalState(cwd);

    const result = runHook(preToolScript, {
      cwd,
      session_id: 'session-a',
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
    });

    expect(result.hookSpecificOutput?.permissionDecision).toBe('deny');
    expect(result.hookSpecificOutput?.permissionDecisionReason).toContain('ALLOW_ULTRAGOAL_WITHOUT_GOAL=1');
  });

  it('ignores stale ultragoal state in PreToolUse and Stop enforcement', () => {
    const cwd = makeTempProject('omq-ultragoal-stale-');
    writeUltragoalState(cwd, {
      started_at: '2000-01-01T00:00:00.000Z',
      last_checked_at: '2000-01-01T00:00:00.000Z',
    });

    const preTool = runHook(preToolScript, { cwd, session_id: 'session-a', tool_name: 'Bash', tool_input: {} });
    const stop = runHook(persistentModeScript, { cwd, session_id: 'session-a' });

    expect(preTool.hookSpecificOutput?.permissionDecision).not.toBe('deny');
    expect(stop.continue).toBe(true);
  });

  it('ignores ultragoal state for another worktree', () => {
    const cwd = makeTempProject('omq-ultragoal-worktree-a-');
    const other = makeTempProject('omq-ultragoal-worktree-b-');
    writeUltragoalState(cwd, { project_path: other });

    const preTool = runHook(preToolScript, { cwd, session_id: 'session-a', tool_name: 'Bash', tool_input: {} });
    const stop = runHook(persistentModeScript, { cwd, session_id: 'session-a' });

    expect(preTool.hookSpecificOutput?.permissionDecision).not.toBe('deny');
    expect(stop.continue).toBe(true);
  });

  it('does not reinject Stop continuation after ultragoal is all done', () => {
    const cwd = makeTempProject('omq-ultragoal-done-');
    writeUltragoalState(cwd, { current_phase: 'all-done', all_done: true });

    const stop = runHook(persistentModeScript, { cwd, session_id: 'session-a' });

    expect(stop.continue).toBe(true);
    expect(stop.decision).toBeUndefined();
  });

  it('does not activate ultragoal state for unrelated prose mentions', () => {
    const cwd = makeTempProject('omq-ultragoal-keyword-prose-');

    runHook(keywordScript, {
      cwd,
      session_id: 'session-a',
      prompt: 'Review whether ultragoal keyword activation steals unrelated prompts',
    });

    const statePath = join(cwd, '.omq', 'state', 'sessions', 'session-a', 'ultragoal-state.json');
    expect(existsSync(statePath)).toBe(false);
  });

  it('activates ultragoal session state from explicit natural-language invocation', () => {
    const cwd = makeTempProject('omq-ultragoal-keyword-natural-');

    runHook(keywordScript, { cwd, session_id: 'session-a', prompt: 'run ultragoal for issue #3098' });

    const statePath = join(cwd, '.omq', 'state', 'sessions', 'session-a', 'ultragoal-state.json');
    const state = JSON.parse(execFileSync('cat', [statePath], { encoding: 'utf-8' }));
    expect(state.active).toBe(true);
  });

  it('activates ultragoal session state from keyword-detector', () => {
    const cwd = makeTempProject('omq-ultragoal-keyword-');

    runHook(keywordScript, { cwd, session_id: 'session-a', prompt: '$ultragoal fix issue #3098' });

    const statePath = join(cwd, '.omq', 'state', 'sessions', 'session-a', 'ultragoal-state.json');
    const state = JSON.parse(execFileSync('cat', [statePath], { encoding: 'utf-8' }));
    expect(state.active).toBe(true);
    expect(state.session_id).toBe('session-a');
    expect(state.current_phase).toBe('executing');
  });
});
