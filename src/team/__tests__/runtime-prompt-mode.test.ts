import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * Tests for Gemini prompt-mode (headless) spawn flow.
 *
 * Gemini CLI v0.29.7+ uses an Ink-based TUI that does not receive keystrokes
 * via tmux send-keys. The fix passes the initial instruction via the `-i` flag
 * (interactive mode) so the TUI is bypassed entirely. Trust-confirm and send-keys
 * notification are skipped for prompt-mode agents.
 *
 * See: https://github.com/anthropics/claude-code/issues/1000
 */

// Track all tmux calls made during spawn
const tmuxCalls = vi.hoisted(() => ({
  args: [] as string[][],
  capturePaneText: '❯ ready\n',
  lastLiteralSend: '',
}));

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  const { promisify: utilPromisify } = await import('util');

  function mockExecFile(_cmd: string, args: string[], cb: (err: Error | null, stdout: string, stderr: string) => void) {
    tmuxCalls.args.push(args);
    if (args[0] === 'split-window') {
      cb(null, '%42\n', '');
    } else if (args[0] === 'send-keys' && args.includes('-l')) {
      tmuxCalls.lastLiteralSend = args[args.length - 1] ?? '';
      cb(null, '', '');
    } else if (args[0] === 'send-keys') {
      tmuxCalls.lastLiteralSend = '';
      cb(null, '', '');
    } else if (args[0] === 'capture-pane') {
      cb(null, `${tmuxCalls.lastLiteralSend}\n${tmuxCalls.capturePaneText}`, '');
    } else if (args[0] === 'display-message') {
      // pane_dead check → "0" means alive; pane_current_command zsh means shell is ready;
      // pane_in_mode → "0" means not in copy mode.
      const format = args[args.length - 1] ?? '';
      cb(null, format.includes('pane_current_command') ? '0 zsh\n' : '0\n', '');
    } else {
      cb(null, '', '');
    }
    return {} as never;
  }

  // Attach custom promisify so util.promisify(execFile) returns {stdout, stderr}
  (mockExecFile as any)[utilPromisify.custom] = async (_cmd: string, args: string[]) => {
    tmuxCalls.args.push(args);
    if (args[0] === 'split-window') {
      return { stdout: '%42\n', stderr: '' };
    }
    if (args[0] === 'send-keys' && args.includes('-l')) {
      tmuxCalls.lastLiteralSend = args[args.length - 1] ?? '';
      return { stdout: '', stderr: '' };
    }
    if (args[0] === 'send-keys') {
      tmuxCalls.lastLiteralSend = '';
      return { stdout: '', stderr: '' };
    }
    if (args[0] === 'capture-pane') {
      return { stdout: `${tmuxCalls.lastLiteralSend}\n${tmuxCalls.capturePaneText}`, stderr: '' };
    }
    if (args[0] === 'display-message') {
      const format = args[args.length - 1] ?? '';
      return { stdout: format.includes('pane_current_command') ? '0 zsh\n' : '0\n', stderr: '' };
    }
    return { stdout: '', stderr: '' };
  };

  function mockExec(cmd: string, cb: (err: Error | null, stdout: string, stderr: string) => void) {
    if (cmd.includes('display-message') && cmd.includes('#{window_width}')) {
      cb(null, '160\n', '');
    } else if (cmd.includes('display-message') && cmd.includes('#{pane_current_command}')) {
      cb(null, '0 zsh\n', '');
    } else {
      cb(null, '', '');
    }
    return {} as never;
  }

  (mockExec as any)[utilPromisify.custom] = async (cmd: string) => {
    if (cmd.includes('display-message') && cmd.includes('#{window_width}')) {
      return { stdout: '160\n', stderr: '' };
    }
    if (cmd.includes('display-message') && cmd.includes('#{pane_current_command}')) {
      return { stdout: '0 zsh\n', stderr: '' };
    }
    return { stdout: '', stderr: '' };
  };

  return {
    ...actual,
    spawnSync: vi.fn((cmd: string, args: string[] = []) => {
      if (args[0] === '--version') return { status: 0, stdout: '', stderr: '' };
      if (cmd === 'which' || cmd === 'where') {
        const bin = args[0] ?? 'unknown';
        return { status: 0, stdout: `/usr/bin/${bin}\n`, stderr: '' };
      }
      return { status: 0, stdout: '', stderr: '' };
    }),
    exec: mockExec,
    execFile: mockExecFile,
  };
});

import { spawnWorkerForTask, type TeamRuntime } from '../runtime.js';

function makeRuntime(cwd: string, agentType: 'gemini' | 'codex' | 'qwen' | 'grok'): TeamRuntime {
  return {
    teamName: 'test-team',
    sessionName: 'test-session:0',
    leaderPaneId: '%0',
    ownsWindow: false,
    config: {
      teamName: 'test-team',
      workerCount: 1,
      agentTypes: [agentType],
      tasks: [{ subject: 'Test task', description: 'Do something' }],
      cwd,
    },
    workerNames: ['worker-1'],
    workerPaneIds: [],
    activeWorkers: new Map(),
    cwd,
    resolvedBinaryPaths: {
      [agentType]: `/usr/local/bin/${agentType}`,
    },
  };
}

function setupTaskDir(cwd: string): void {
  const tasksDir = join(cwd, '.omq/state/team/test-team/tasks');
  mkdirSync(tasksDir, { recursive: true });
  writeFileSync(join(tasksDir, '1.json'), JSON.stringify({
    id: '1',
    subject: 'Test task',
    description: 'Do something',
    status: 'pending',
    owner: null,
  }));
  const workerDir = join(cwd, '.omq/state/team/test-team/workers/worker-1');
  mkdirSync(workerDir, { recursive: true });
}

describe('spawnWorkerForTask – prompt mode and interactive worker launch', () => {
  let cwd: string;

  beforeEach(() => {
    tmuxCalls.args = [];
    tmuxCalls.capturePaneText = '❯ ready\n';
    tmuxCalls.lastLiteralSend = '';
    delete process.env.OMQ_SHELL_READY_TIMEOUT_MS;
    cwd = mkdtempSync(join(tmpdir(), 'runtime-gemini-prompt-'));
    setupTaskDir(cwd);
  });

  it('gemini worker launch args include -p flag with inbox path', async () => {
    const runtime = makeRuntime(cwd, 'gemini');

    await spawnWorkerForTask(runtime, 'worker-1', 0);

    // Find the send-keys call that launches the worker (contains -l flag)
    const launchCall = tmuxCalls.args.find(
      args => args[0] === 'send-keys' && args.includes('-l')
    );
    expect(launchCall).toBeDefined();
    const launchCmd = launchCall![launchCall!.length - 1];

    // Should contain -p flag for prompt mode
    expect(launchCmd).toContain("'-p'");
    // Should contain the inbox path reference
    expect(launchCmd).toContain('.omq/state/team/test-team/workers/worker-1/inbox.md');
    expect(launchCmd).toContain('execute now');
    expect(launchCmd).toContain('concrete progress');

    rmSync(cwd, { recursive: true, force: true });
  });

  it('gemini worker skips trust-confirm (no "1" sent via send-keys)', async () => {
    const runtime = makeRuntime(cwd, 'gemini');

    await spawnWorkerForTask(runtime, 'worker-1', 0);

    // Collect all literal send-keys messages (the -l flag content)
    const literalMessages = tmuxCalls.args
      .filter(args => args[0] === 'send-keys' && args.includes('-l'))
      .map(args => args[args.length - 1]);

    // Should NOT contain the trust-confirm "1" as a literal send
    const trustConfirmSent = literalMessages.some(msg => msg === '1');
    expect(trustConfirmSent).toBe(false);

    rmSync(cwd, { recursive: true, force: true });
  });

  it('gemini worker writes inbox before spawn', async () => {
    const runtime = makeRuntime(cwd, 'gemini');

    await spawnWorkerForTask(runtime, 'worker-1', 0);

    const inboxPath = join(cwd, '.omq/state/team/test-team/workers/worker-1/inbox.md');
    const content = readFileSync(inboxPath, 'utf-8');
    expect(content).toContain('Initial Task Assignment');
    expect(content).toContain('Test task');
    expect(content).toContain('Do something');

    rmSync(cwd, { recursive: true, force: true });
  });

  it('codex worker launch args start a persistent codex pane without prompt/exec subcommands', async () => {
    const runtime = makeRuntime(cwd, 'codex');

    await spawnWorkerForTask(runtime, 'worker-1', 0);

    // Find the send-keys call that launches the worker (contains -l flag).
    const launchCall = tmuxCalls.args.find(
      args => args[0] === 'send-keys' && args.includes('-l')
    );
    expect(launchCall).toBeDefined();
    const launchCmd = launchCall![launchCall!.length - 1];

    expect(launchCmd).toContain('/usr/local/bin/codex');
    expect(launchCmd).toContain('--dangerously-bypass-approvals-and-sandbox');
    expect(launchCmd).not.toContain("'exec'");
    expect(launchCmd).not.toContain('.omq/state/team/test-team/workers/worker-1/inbox.md');
    expect(launchCmd).not.toContain('execute now');
    expect(launchCmd).not.toContain('concrete progress');

    rmSync(cwd, { recursive: true, force: true });
  });

  it('codex worker uses the interactive inbox notification path like claude', async () => {
    const runtime = makeRuntime(cwd, 'codex');

    await spawnWorkerForTask(runtime, 'worker-1', 0);

    const sendKeysCalls = tmuxCalls.args.filter(
      args => args[0] === 'send-keys' && args.includes('-l')
    );
    expect(sendKeysCalls.length).toBe(2);
    const readInstructionCall = sendKeysCalls.find((args) => (args[args.length - 1] ?? '').includes('execute now'));
    expect(readInstructionCall).toBeDefined();

    rmSync(cwd, { recursive: true, force: true });
  });

  it('non-prompt worker waits for pane readiness before sending inbox instruction', async () => {
    const runtime = makeRuntime(cwd, 'qwen');

    await spawnWorkerForTask(runtime, 'worker-1', 0);

    const captureCalls = tmuxCalls.args.filter(args => args[0] === 'capture-pane');
    expect(captureCalls.length).toBeGreaterThan(0);

    const readInstructionCalls = tmuxCalls.args.filter(
      args => args[0] === 'send-keys' && args.includes('-l') && (args[args.length - 1] ?? '').includes('execute now')
    );
    expect(readInstructionCalls.length).toBe(1);
    expect(tmuxCalls.args).toContainEqual(['set-window-option', '-t', 'test-session:0', 'main-pane-width', '80']);

    rmSync(cwd, { recursive: true, force: true });
  });

  it('non-prompt worker throws when pane never becomes ready and resets task to pending', async () => {
    const runtime = makeRuntime(cwd, 'qwen');
    tmuxCalls.capturePaneText = 'still booting\n';
    process.env.OMQ_SHELL_READY_TIMEOUT_MS = '40';

    await expect(spawnWorkerForTask(runtime, 'worker-1', 0)).rejects.toThrow('worker_pane_not_ready:worker-1');

    const taskPath = join(cwd, '.omq/state/team/test-team/tasks/1.json');
    const task = JSON.parse(readFileSync(taskPath, 'utf-8')) as { status: string; owner: string | null };
    expect(task.status).toBe('pending');
    expect(task.owner).toBeNull();

    rmSync(cwd, { recursive: true, force: true });
  });

  it('returns empty and skips spawn when task is already in_progress (claim already taken)', async () => {
    const taskPath = join(cwd, '.omq/state/team/test-team/tasks/1.json');
    writeFileSync(taskPath, JSON.stringify({
      id: '1',
      subject: 'Test task',
      description: 'Do something',
      status: 'in_progress',
      owner: 'worker-2',
    }), 'utf-8');

    const runtime = makeRuntime(cwd, 'codex');
    const paneId = await spawnWorkerForTask(runtime, 'worker-1', 0);

    expect(paneId).toBe('');
    expect(tmuxCalls.args.some(args => args[0] === 'split-window')).toBe(false);
    expect(tmuxCalls.args.some(args => args[0] === 'send-keys')).toBe(false);
    expect(runtime.activeWorkers.size).toBe(0);

    const task = JSON.parse(readFileSync(taskPath, 'utf-8')) as { status: string; owner: string | null };
    expect(task.status).toBe('in_progress');
    expect(task.owner).toBe('worker-2');
  });
});

describe('spawnWorkerForTask – model passthrough from environment variables', () => {
  let cwd: string;
  const originalEnv = process.env;

  beforeEach(() => {
    tmuxCalls.args = [];
    tmuxCalls.capturePaneText = '❯ ready\n';
    tmuxCalls.lastLiteralSend = '';
    delete process.env.OMQ_SHELL_READY_TIMEOUT_MS;
    // Clear model/provider env vars before each test
    delete process.env.OMQ_EXTERNAL_MODELS_DEFAULT_CODEX_MODEL;
    delete process.env.OMQ_CODEX_DEFAULT_MODEL;
    delete process.env.OMQ_EXTERNAL_MODELS_DEFAULT_GEMINI_MODEL;
    delete process.env.OMQ_GEMINI_DEFAULT_MODEL;
    delete process.env.OMQ_EXTERNAL_MODELS_DEFAULT_GROK_MODEL;
    delete process.env.OMQ_GROK_DEFAULT_MODEL;
    delete process.env.DASHSCOPE_MODEL;
    delete process.env.QODER_MODEL;
    delete process.env.DASHSCOPE_BASE_URL;
    delete process.env.OMQ_ROUTING_FORCE_INHERIT;
    delete process.env.OMQ_ROUTING_FORCE_INHERIT;
    delete process.env.DASHSCOPE_DEFAULT_MAX_MODEL;
    delete process.env.DASHSCOPE_DEFAULT_PLUS_MODEL;
    delete process.env.DASHSCOPE_DEFAULT_TURBO_MODEL;
    delete process.env.DASHSCOPE_DEFAULT_MAX_MODEL;
    delete process.env.DASHSCOPE_DEFAULT_PLUS_MODEL;
    delete process.env.DASHSCOPE_DEFAULT_TURBO_MODEL;
    delete process.env.OMQ_MODEL_HIGH;
    delete process.env.OMQ_MODEL_MEDIUM;
    delete process.env.OMQ_MODEL_LOW;
    cwd = mkdtempSync(join(tmpdir(), 'runtime-model-passthrough-'));
    setupTaskDir(cwd);
  });

  afterEach(() => {
    process.env = originalEnv;
    rmSync(cwd, { recursive: true, force: true });
  });

  it('codex worker passes model from OMQ_EXTERNAL_MODELS_DEFAULT_CODEX_MODEL', async () => {
    process.env.OMQ_EXTERNAL_MODELS_DEFAULT_CODEX_MODEL = 'gpt-4o';
    const runtime = makeRuntime(cwd, 'codex');

    await spawnWorkerForTask(runtime, 'worker-1', 0);

    const launchCall = tmuxCalls.args.find(
      args => args[0] === 'send-keys' && args.includes('-l')
    );
    expect(launchCall).toBeDefined();
    const launchCmd = launchCall![launchCall!.length - 1];

    // Should contain --model flag with the model value
    expect(launchCmd).toContain("'--model'");
    expect(launchCmd).toContain("'gpt-4o'");
  });

  it('codex worker falls back to OMQ_CODEX_DEFAULT_MODEL', async () => {
    process.env.OMQ_CODEX_DEFAULT_MODEL = 'o3-mini';
    const runtime = makeRuntime(cwd, 'codex');

    await spawnWorkerForTask(runtime, 'worker-1', 0);

    const launchCall = tmuxCalls.args.find(
      args => args[0] === 'send-keys' && args.includes('-l')
    );
    expect(launchCall).toBeDefined();
    const launchCmd = launchCall![launchCall!.length - 1];

    expect(launchCmd).toContain("'--model'");
    expect(launchCmd).toContain("'o3-mini'");
  });

  it('codex worker prefers OMQ_EXTERNAL_MODELS_DEFAULT_CODEX_MODEL over legacy fallback', async () => {
    process.env.OMQ_EXTERNAL_MODELS_DEFAULT_CODEX_MODEL = 'gpt-4o';
    process.env.OMQ_CODEX_DEFAULT_MODEL = 'o3-mini';
    const runtime = makeRuntime(cwd, 'codex');

    await spawnWorkerForTask(runtime, 'worker-1', 0);

    const launchCall = tmuxCalls.args.find(
      args => args[0] === 'send-keys' && args.includes('-l')
    );
    expect(launchCall).toBeDefined();
    const launchCmd = launchCall![launchCall!.length - 1];

    expect(launchCmd).toContain("'--model' 'gpt-4o'");
  });

  it('gemini worker passes model from OMQ_EXTERNAL_MODELS_DEFAULT_GEMINI_MODEL', async () => {
    process.env.OMQ_EXTERNAL_MODELS_DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash';
    const runtime = makeRuntime(cwd, 'gemini');

    await spawnWorkerForTask(runtime, 'worker-1', 0);

    const launchCall = tmuxCalls.args.find(
      args => args[0] === 'send-keys' && args.includes('-l')
    );
    expect(launchCall).toBeDefined();
    const launchCmd = launchCall![launchCall!.length - 1];

    expect(launchCmd).toContain("'--model'");
    expect(launchCmd).toContain("'gemini-2.0-flash'");
  });

  it('gemini worker falls back to OMQ_GEMINI_DEFAULT_MODEL', async () => {
    process.env.OMQ_GEMINI_DEFAULT_MODEL = 'gemini-1.5-pro';
    const runtime = makeRuntime(cwd, 'gemini');

    await spawnWorkerForTask(runtime, 'worker-1', 0);

    const launchCall = tmuxCalls.args.find(
      args => args[0] === 'send-keys' && args.includes('-l')
    );
    expect(launchCall).toBeDefined();
    const launchCmd = launchCall![launchCall!.length - 1];

    expect(launchCmd).toContain("'--model'");
    expect(launchCmd).toContain("'gemini-1.5-pro'");
  });

  it('gemini worker prefers OMQ_EXTERNAL_MODELS_DEFAULT_GEMINI_MODEL over legacy fallback', async () => {
    process.env.OMQ_EXTERNAL_MODELS_DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash';
    process.env.OMQ_GEMINI_DEFAULT_MODEL = 'gemini-1.5-pro';
    const runtime = makeRuntime(cwd, 'gemini');

    await spawnWorkerForTask(runtime, 'worker-1', 0);

    const launchCall = tmuxCalls.args.find(
      args => args[0] === 'send-keys' && args.includes('-l')
    );
    expect(launchCall).toBeDefined();
    const launchCmd = launchCall![launchCall!.length - 1];

    expect(launchCmd).toContain("'--model' 'gemini-2.0-flash'");
  });

  it('grok worker passes model from OMQ_EXTERNAL_MODELS_DEFAULT_GROK_MODEL', async () => {
    process.env.OMQ_EXTERNAL_MODELS_DEFAULT_GROK_MODEL = 'grok-4-fast';
    const runtime = makeRuntime(cwd, 'grok');

    await spawnWorkerForTask(runtime, 'worker-1', 0);

    const launchCall = tmuxCalls.args.find(
      args => args[0] === 'send-keys' && args.includes('-l')
    );
    expect(launchCall).toBeDefined();
    const launchCmd = launchCall![launchCall!.length - 1];

    expect(launchCmd).toContain("'--always-approve'");
    expect(launchCmd).toContain("'--model'");
    expect(launchCmd).toContain("'grok-4-fast'");
  });

  it('grok worker falls back to OMQ_GROK_DEFAULT_MODEL', async () => {
    process.env.OMQ_GROK_DEFAULT_MODEL = 'grok-code-fast-1';
    const runtime = makeRuntime(cwd, 'grok');

    await spawnWorkerForTask(runtime, 'worker-1', 0);

    const launchCall = tmuxCalls.args.find(
      args => args[0] === 'send-keys' && args.includes('-l')
    );
    expect(launchCall).toBeDefined();
    const launchCmd = launchCall![launchCall!.length - 1];

    expect(launchCmd).toContain("'--model'");
    expect(launchCmd).toContain("'grok-code-fast-1'");
  });

  it('grok worker prefers OMQ_EXTERNAL_MODELS_DEFAULT_GROK_MODEL over legacy fallback', async () => {
    process.env.OMQ_EXTERNAL_MODELS_DEFAULT_GROK_MODEL = 'grok-4-fast';
    process.env.OMQ_GROK_DEFAULT_MODEL = 'grok-code-fast-1';
    const runtime = makeRuntime(cwd, 'grok');

    await spawnWorkerForTask(runtime, 'worker-1', 0);

    const launchCall = tmuxCalls.args.find(
      args => args[0] === 'send-keys' && args.includes('-l')
    );
    expect(launchCall).toBeDefined();
    const launchCmd = launchCall![launchCall!.length - 1];

    expect(launchCmd).toContain("'--model' 'grok-4-fast'");
  });

  it('direct grok worker does not fall through to a Claude/Bedrock model (maintainer key ask)', async () => {
    // A DIRECT grok launch must resolve its model only from grok env vars.
    // Even with Bedrock/Claude model env present, grok must NOT receive any
    // --model flag (its grok env vars are unset here) and must NOT pick up a
    // Claude/Bedrock model id via resolveClaudeWorkerModel().
    process.env.OMQ_ROUTING_FORCE_INHERIT = '1';
    process.env.DASHSCOPE_MODEL = 'dashscope/qwen-plus-v1:0';
    process.env.DASHSCOPE_DEFAULT_PLUS_MODEL = 'dashscope/qwen-plus-v1:0';
    process.env.OMQ_MODEL_MEDIUM = 'dashscope/qwen-plus-v1:0';
    const runtime = makeRuntime(cwd, 'grok');

    await spawnWorkerForTask(runtime, 'worker-1', 0);

    const launchCall = tmuxCalls.args.find(
      args => args[0] === 'send-keys' && args.includes('-l')
    );
    expect(launchCall).toBeDefined();
    const launchCmd = launchCall![launchCall!.length - 1];

    // grok env vars unset → no --model flag at all. The grok IIFE branch returns
    // undefined and never falls through to resolveClaudeWorkerModel(), so the
    // Claude/Bedrock model id is never passed as a `--model` CLI argument.
    // (The Bedrock ids still appear in the forwarded env prefix via the worker
    //  model-env allowlist, exactly as they would for any non-claude worker —
    //  that is pane startup env, not the grok model selection.)
    expect(launchCmd).toContain("'--always-approve'");
    expect(launchCmd).not.toContain("'--model'");
    expect(launchCmd).not.toContain("'--model' 'dashscope/qwen-plus-v1:0'");
  });

  it('claude worker does not pass model flag (not supported)', async () => {
    process.env.OMQ_EXTERNAL_MODELS_DEFAULT_CODEX_MODEL = 'gpt-4o';
    const runtime = makeRuntime(cwd, 'qwen');

    await spawnWorkerForTask(runtime, 'worker-1', 0);

    const launchCall = tmuxCalls.args.find(
      args => args[0] === 'send-keys' && args.includes('-l')
    );
    expect(launchCall).toBeDefined();
    const launchCmd = launchCall![launchCall!.length - 1];

    // Claude worker should not have --model flag
    expect(launchCmd).not.toContain("'--model'");
  });

  it('claude worker propagates DASHSCOPE_MODEL into the pane startup env', async () => {
    process.env.DASHSCOPE_MODEL = 'qwen-max-latest';
    const runtime = makeRuntime(cwd, 'qwen');

    await spawnWorkerForTask(runtime, 'worker-1', 0);

    const launchCall = tmuxCalls.args.find(
      args => args[0] === 'send-keys' && args.includes('-l')
    );
    expect(launchCall).toBeDefined();
    const launchCmd = launchCall![launchCall!.length - 1];

    expect(launchCmd).toContain('DASHSCOPE_MODEL=');
    expect(launchCmd).toContain('qwen-max-latest');
    expect(launchCmd).not.toContain("'--model'");
  });

  it('claude worker propagates custom provider env needed for inherited model selection', async () => {
    process.env.QODER_MODEL = 'vertex_ai/qwen-plus';
    process.env.DASHSCOPE_BASE_URL = 'https://gateway.example.invalid';
    const runtime = makeRuntime(cwd, 'qwen');

    await spawnWorkerForTask(runtime, 'worker-1', 0);

    const launchCall = tmuxCalls.args.find(
      args => args[0] === 'send-keys' && args.includes('-l')
    );
    expect(launchCall).toBeDefined();
    const launchCmd = launchCall![launchCall!.length - 1];

    expect(launchCmd).toContain('QODER_MODEL=');
    expect(launchCmd).toContain('vertex_ai/qwen-plus');
    expect(launchCmd).toContain('DASHSCOPE_BASE_URL=');
    expect(launchCmd).toContain('https://gateway.example.invalid');
  });

  it('claude worker propagates tiered env model selection variables', async () => {
    process.env.OMQ_ROUTING_FORCE_INHERIT = '1';
    process.env.DASHSCOPE_DEFAULT_MAX_MODEL = 'qwen-max-custom';
    process.env.DASHSCOPE_DEFAULT_PLUS_MODEL = 'qwen-plus-custom';
    process.env.DASHSCOPE_DEFAULT_TURBO_MODEL = 'qwen-turbo-custom';
    process.env.OMQ_MODEL_HIGH = 'qwen-max-override';
    process.env.OMQ_MODEL_MEDIUM = 'qwen-plus-override';
    process.env.OMQ_MODEL_LOW = 'qwen-turbo-override';
    const runtime = makeRuntime(cwd, 'qwen');

    await spawnWorkerForTask(runtime, 'worker-1', 0);

    const launchCall = tmuxCalls.args.find(
      args => args[0] === 'send-keys' && args.includes('-l')
    );
    expect(launchCall).toBeDefined();
    const launchCmd = launchCall![launchCall!.length - 1];

    expect(launchCmd).toContain('OMQ_ROUTING_FORCE_INHERIT=');
    expect(launchCmd).toContain('DASHSCOPE_DEFAULT_MAX_MODEL=');
    expect(launchCmd).toContain('qwen-max-custom');
    expect(launchCmd).toContain('DASHSCOPE_DEFAULT_PLUS_MODEL=');
    expect(launchCmd).toContain('qwen-plus-custom');
    expect(launchCmd).toContain('DASHSCOPE_DEFAULT_TURBO_MODEL=');
    expect(launchCmd).toContain('qwen-turbo-custom');
    expect(launchCmd).toContain('OMQ_MODEL_HIGH=');
    expect(launchCmd).toContain('qwen-max-override');
    expect(launchCmd).toContain('OMQ_MODEL_MEDIUM=');
    expect(launchCmd).toContain('qwen-plus-override');
    expect(launchCmd).toContain('OMQ_MODEL_LOW=');
    expect(launchCmd).toContain('qwen-turbo-override');
  });


  it('codex worker does not pass model flag when no env var is set', async () => {
    const runtime = makeRuntime(cwd, 'codex');

    await spawnWorkerForTask(runtime, 'worker-1', 0);

    const launchCall = tmuxCalls.args.find(
      args => args[0] === 'send-keys' && args.includes('-l')
    );
    expect(launchCall).toBeDefined();
    const launchCmd = launchCall![launchCall!.length - 1];

    // Should not have --model flag when no env var is set
    expect(launchCmd).not.toContain("'--model'");
  });
});
