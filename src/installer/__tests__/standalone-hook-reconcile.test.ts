import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const originalClaudeConfigDir = process.env.QODER_CONFIG_DIR;
const originalPluginRoot = process.env.QODER_PLUGIN_ROOT;
const originalHome = process.env.HOME;

let testClaudeDir: string;
let testHomeDir: string;

async function loadInstaller() {
  vi.resetModules();
  return import('../index.js');
}

function writePluginFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function writeCompletePluginPayload(root: string): void {
  writePluginFile(join(root, 'dist', 'hooks', 'skill-bridge.cjs'), 'console.log("skill bridge");\n');
  writePluginFile(join(root, 'bridge', 'cli.cjs'), 'console.log("bridge");\n');
  writePluginFile(join(root, 'hooks', 'hooks.json'), JSON.stringify({
    hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'node test.mjs' }] }] },
  }));
  writePluginFile(join(root, 'skills', 'plan', 'SKILL.md'), '# plan\n');
  writePluginFile(join(root, 'commands', 'omq-setup.md'), 'Read skills/omq-setup/SKILL.md and pass $ARGUMENTS.\n');
  writePluginFile(join(root, '.claude-plugin', 'plugin.json'), JSON.stringify({
    name: 'oh-my-qoder',
    commands: './commands/',
    skills: ['./skills/plan/'],
  }, null, 2));
  writePluginFile(join(root, 'package.json'), JSON.stringify({ name: 'oh-my-qoder', version: '9.9.9' }, null, 2));
}

describe('install() standalone hook reconciliation', () => {
  beforeEach(() => {
    testClaudeDir = mkdtempSync(join(tmpdir(), 'omq-standalone-hooks-'));
    testHomeDir = mkdtempSync(join(tmpdir(), 'omq-home-'));
    mkdirSync(testHomeDir, { recursive: true });
    writeFileSync(join(testHomeDir, 'CLAUDE.md'), '# test home claude');
    process.env.QODER_CONFIG_DIR = testClaudeDir;
    process.env.HOME = testHomeDir;
    delete process.env.QODER_PLUGIN_ROOT;
  });

  afterEach(() => {
    rmSync(testClaudeDir, { recursive: true, force: true });
    rmSync(testHomeDir, { recursive: true, force: true });
    if (originalClaudeConfigDir !== undefined) {
      process.env.QODER_CONFIG_DIR = originalClaudeConfigDir;
    } else {
      delete process.env.QODER_CONFIG_DIR;
    }
    if (originalPluginRoot !== undefined) {
      process.env.QODER_PLUGIN_ROOT = originalPluginRoot;
    } else {
      delete process.env.QODER_PLUGIN_ROOT;
    }
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
  });

  it('restores OMQ settings hooks for standalone installs during forced reconciliation', async () => {
    const settingsPath = join(testClaudeDir, 'settings.json');
    mkdirSync(testClaudeDir, { recursive: true });
    writeFileSync(settingsPath, JSON.stringify({ hooks: {} }, null, 2));

    const { install } = await loadInstaller();
    const result = install({
      force: true,
      skipQoderCheck: true,
    });

    const writtenSettings = JSON.parse(readFileSync(settingsPath, 'utf-8')) as {
      hooks?: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
    };

    expect(result.success).toBe(true);
    expect(result.hooksConfigured).toBe(true);
    expect(writtenSettings.hooks?.UserPromptSubmit?.[0]?.hooks?.[0]?.command).toBe(
      `node "${join(testClaudeDir, 'hooks', 'keyword-detector.mjs').replace(/\\/g, '/')}"`,
    );
    expect(writtenSettings.hooks?.SessionStart?.[0]?.hooks?.[0]?.command).toBe(
      `node "${join(testClaudeDir, 'hooks', 'session-start.mjs').replace(/\\/g, '/')}"`,
    );
    expect((writtenSettings as { statusLine?: { command?: string } }).statusLine?.command).toContain(
      `${join(testClaudeDir, 'hud', 'omq-hud.mjs').replace(/\\/g, '/')}`,
    );
    expect((writtenSettings as { statusLine?: { command?: string } }).statusLine?.command).toContain('omq-hud-cache.sh');
    expect(readFileSync(join(testClaudeDir, 'hud', 'omq-hud-cache.sh'), 'utf-8')).toContain('HUD cached statusLine launcher');
    expect(readFileSync(join(testClaudeDir, 'hud', 'omq-hud.mjs'), 'utf-8')).toContain(
      'const { getClaudeConfigDir } = await import(pathToFileURL(join(__dirname, "lib", "config-dir.mjs")).href);',
    );
    expect(readFileSync(join(testClaudeDir, 'hud', 'lib', 'config-dir.mjs'), 'utf-8')).toContain(
      'export function getQoderConfigDir()',
    );
    expect(readFileSync(join(testClaudeDir, 'hooks', 'lib', 'config-dir.mjs'), 'utf-8')).toContain(
      'export function getQoderConfigDir()',
    );
    expect(readFileSync(join(testClaudeDir, 'hooks', 'keyword-detector.mjs'), 'utf-8')).toContain('Ralph keywords');
    expect(readFileSync(join(testClaudeDir, 'hooks', 'pre-tool-use.mjs'), 'utf-8')).toContain('PreToolUse');
    expect(readFileSync(join(testClaudeDir, 'hooks', 'code-simplifier.mjs'), 'utf-8')).toContain('Code Simplifier');
  });

  it('installs standalone hooks with all runtime helper imports', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'omq-standalone-hook-project-'));
    try {
      mkdirSync(join(projectDir, '.git'), { recursive: true });

      const { install } = await loadInstaller();
      const result = install({
        force: true,
        skipQoderCheck: true,
      });

      expect(result.success).toBe(true);
      expect(existsSync(join(testClaudeDir, 'hooks', 'lib', 'state-root.mjs'))).toBe(true);
      expect(existsSync(join(testClaudeDir, 'hooks', 'lib', 'model-routing-override-message.mjs'))).toBe(true);

      const hookInputs: Array<{ file: string; input: Record<string, unknown> }> = [
        {
          file: 'session-start.mjs',
          input: { hook_event_name: 'SessionStart', session_id: 'ci-upgrade-test', cwd: projectDir },
        },
        {
          file: 'keyword-detector.mjs',
          input: { hook_event_name: 'UserPromptSubmit', session_id: 'ci-upgrade-test', cwd: projectDir, prompt: 'hello' },
        },
        {
          file: 'pre-tool-use.mjs',
          input: { hook_event_name: 'PreToolUse', session_id: 'ci-upgrade-test', cwd: projectDir, tool_name: 'Read', tool_input: {} },
        },
        {
          file: 'post-tool-use.mjs',
          input: { hook_event_name: 'PostToolUse', session_id: 'ci-upgrade-test', cwd: projectDir, tool_name: 'Read', tool_input: {}, tool_response: 'ok' },
        },
        {
          file: 'post-tool-use-failure.mjs',
          input: { hook_event_name: 'PostToolUseFailure', session_id: 'ci-upgrade-test', cwd: projectDir, tool_name: 'Read', tool_input: {}, error: 'synthetic failure' },
        },
        {
          file: 'persistent-mode.mjs',
          input: { hook_event_name: 'Stop', session_id: 'ci-upgrade-test', cwd: projectDir },
        },
        {
          file: 'code-simplifier.mjs',
          input: { hook_event_name: 'Stop', session_id: 'ci-upgrade-test', cwd: projectDir },
        },
      ];

      for (const { file, input } of hookInputs) {
        const raw = execFileSync(process.execPath, [join(testClaudeDir, 'hooks', file)], {
          input: JSON.stringify(input),
          encoding: 'utf-8',
          env: {
            ...process.env,
            QODER_CONFIG_DIR: testClaudeDir,
            HOME: testHomeDir,
            USERPROFILE: testHomeDir,
          },
          timeout: 15000,
        }).trim();

        const parsed = JSON.parse(raw) as { continue?: boolean };
        expect(parsed.continue, file).toBe(true);
      }
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it('preserves non-OMQ ~/.qoder/hooks commands while adding standalone OMQ hooks', async () => {
    const settingsPath = join(testClaudeDir, 'settings.json');
    mkdirSync(testClaudeDir, { recursive: true });
    writeFileSync(settingsPath, JSON.stringify({
      hooks: {
        UserPromptSubmit: [
          {
            hooks: [
              {
                type: 'command',
                command: 'node $HOME/.qoder/hooks/other-plugin.mjs',
              },
            ],
          },
        ],
      },
    }, null, 2));

    const { install } = await loadInstaller();
    const result = install({
      force: true,
      skipQoderCheck: true,
    });

    const writtenSettings = JSON.parse(readFileSync(settingsPath, 'utf-8')) as {
      hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
    };
    const commands = writtenSettings.hooks.UserPromptSubmit.map(group => group.hooks[0]?.command);

    expect(result.success).toBe(true);
    expect(commands).toContain('node $HOME/.qoder/hooks/other-plugin.mjs');
    expect(commands).toContain(
      `node "${join(testClaudeDir, 'hooks', 'keyword-detector.mjs').replace(/\\/g, '/')}"`,
    );
  });

  it('removes legacy OMQ settings hooks in plugin mode without re-injecting them', async () => {
    const settingsPath = join(testClaudeDir, 'settings.json');
    const pluginRoot = join(testClaudeDir, 'plugins', 'installed', 'omq', 'oh-my-qoder', '9.9.9');
    mkdirSync(pluginRoot, { recursive: true });
    writeCompletePluginPayload(pluginRoot);

    mkdirSync(testClaudeDir, { recursive: true });
    writeFileSync(settingsPath, JSON.stringify({
      hooks: {
        UserPromptSubmit: [
          {
            hooks: [
              {
                type: 'command',
                command: 'node $HOME/.qoder/hooks/keyword-detector.mjs',
              },
            ],
          },
          {
            hooks: [
              {
                type: 'command',
                command: 'node $HOME/.qoder/hooks/other-plugin.mjs',
              },
            ],
          },
        ],
      },
    }, null, 2));
    process.env.QODER_PLUGIN_ROOT = pluginRoot;

    const { install } = await loadInstaller();
    const result = install({
      force: true,
      skipQoderCheck: true,
    });

    const writtenSettings = JSON.parse(readFileSync(settingsPath, 'utf-8')) as {
      hooks?: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
      statusLine?: { command?: string };
    };
    const commands = writtenSettings.hooks?.UserPromptSubmit?.map(group => group.hooks[0]?.command) ?? [];

    expect(result.success).toBe(true);
    expect(result.hooksConfigured).toBe(true);
    expect(commands).toEqual(['node $HOME/.qoder/hooks/other-plugin.mjs']);
    expect(commands).not.toContain(
      `node "${join(testClaudeDir, 'hooks', 'keyword-detector.mjs').replace(/\\/g, '/')}"`,
    );
    expect(writtenSettings.statusLine?.command).toContain(
      `${join(testClaudeDir, 'hud', 'omq-hud.mjs').replace(/\\/g, '/')}`,
    );
  });
});

// ── Plugin-provided hooks: duplicate prevention (#2252) ─────────────────────

describe('install() plugin-provided hook deduplication (#2252)', () => {
  let fakePluginRoot: string;

  beforeEach(() => {
    testClaudeDir = mkdtempSync(join(tmpdir(), 'omq-hook-dedup-'));
    testHomeDir = mkdtempSync(join(tmpdir(), 'omq-home-dedup-'));
    mkdirSync(testHomeDir, { recursive: true });
    writeFileSync(join(testHomeDir, 'CLAUDE.md'), '# test home claude');
    process.env.QODER_CONFIG_DIR = testClaudeDir;
    process.env.HOME = testHomeDir;
    delete process.env.QODER_PLUGIN_ROOT;
  });

  afterEach(() => {
    if (fakePluginRoot) {
      rmSync(fakePluginRoot, { recursive: true, force: true });
    }
    rmSync(testClaudeDir, { recursive: true, force: true });
    rmSync(testHomeDir, { recursive: true, force: true });
    if (originalClaudeConfigDir !== undefined) {
      process.env.QODER_CONFIG_DIR = originalClaudeConfigDir;
    } else {
      delete process.env.QODER_CONFIG_DIR;
    }
    if (originalPluginRoot !== undefined) {
      process.env.QODER_PLUGIN_ROOT = originalPluginRoot;
    } else {
      delete process.env.QODER_PLUGIN_ROOT;
    }
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
  });

  function setupPluginWithHooks() {
    // Create a fake plugin root with the complete runtime payload required
    // before installer code may trust plugin-provided hooks.
    fakePluginRoot = mkdtempSync(join(tmpdir(), 'omq-fake-plugin-'));
    writeCompletePluginPayload(fakePluginRoot);

    // Register plugin in installed_plugins.json
    const pluginsDir = join(testClaudeDir, 'plugins');
    mkdirSync(pluginsDir, { recursive: true });
    writeFileSync(join(pluginsDir, 'installed_plugins.json'), JSON.stringify({
      'oh-my-qoder': [{ installPath: fakePluginRoot }],
    }));

    // Mark plugin as enabled in settings.json
    mkdirSync(testClaudeDir, { recursive: true });
    writeFileSync(join(testClaudeDir, 'settings.json'), JSON.stringify({
      enabledPlugins: { 'oh-my-qoder': true },
    }, null, 2));
  }

  it('hasPluginProvidedHookFiles returns true when hooks.json exists in plugin root', async () => {
    setupPluginWithHooks();
    const { hasPluginProvidedHookFiles } = await loadInstaller();
    expect(hasPluginProvidedHookFiles()).toBe(true);
  });

  it('hasPluginProvidedHookFiles returns false when no plugin provides hooks', async () => {
    const { hasPluginProvidedHookFiles } = await loadInstaller();
    expect(hasPluginProvidedHookFiles()).toBe(false);
  });

  it('skips standalone hook scripts when plugin provides hooks.json', async () => {
    setupPluginWithHooks();

    const { install } = await loadInstaller();
    install({ force: true, skipQoderCheck: true });

    // Standalone hook scripts should NOT be copied to ~/.qoder/hooks/
    expect(existsSync(join(testClaudeDir, 'hooks', 'keyword-detector.mjs'))).toBe(false);
    expect(existsSync(join(testClaudeDir, 'hooks', 'pre-tool-use.mjs'))).toBe(false);
    expect(existsSync(join(testClaudeDir, 'hooks', 'session-start.mjs'))).toBe(false);
  });

  it('does not write OMQ hook entries to settings.json when plugin provides hooks', async () => {
    setupPluginWithHooks();

    const { install } = await loadInstaller();
    const result = install({ force: true, skipQoderCheck: true });

    const writtenSettings = JSON.parse(
      readFileSync(join(testClaudeDir, 'settings.json'), 'utf-8'),
    ) as { hooks?: Record<string, unknown> };

    expect(result.success).toBe(true);
    // OMQ hooks should NOT be in settings.json — plugin handles them via hooks.json
    expect(writtenSettings.hooks).toBeUndefined();
  });

  it('removes stale OMQ hook entries from settings.json when plugin provides hooks', async () => {
    // Pre-populate settings.json with stale OMQ hook entries (simulating prior standalone install)
    mkdirSync(testClaudeDir, { recursive: true });
    writeFileSync(join(testClaudeDir, 'settings.json'), JSON.stringify({
      enabledPlugins: { 'oh-my-qoder': true },
      hooks: {
        UserPromptSubmit: [
          {
            hooks: [{
              type: 'command',
              command: 'node "$HOME/.qoder/hooks/keyword-detector.mjs"',
            }],
          },
        ],
        SessionStart: [
          {
            hooks: [{
              type: 'command',
              command: 'node "$HOME/.qoder/hooks/session-start.mjs"',
            }],
          },
        ],
      },
    }, null, 2));

    setupPluginWithHooks();

    const { install } = await loadInstaller();
    const result = install({ force: true, skipQoderCheck: true });

    const writtenSettings = JSON.parse(
      readFileSync(join(testClaudeDir, 'settings.json'), 'utf-8'),
    ) as { hooks?: Record<string, unknown> };

    expect(result.success).toBe(true);
    // Stale OMQ hook entries should be cleaned up by legacy cleanup,
    // and NOT re-added because plugin provides hooks
    expect(writtenSettings.hooks).toBeUndefined();
  });

  it('preserves non-OMQ hooks in settings.json when pruning plugin duplicates', async () => {
    // Set up plugin first (creates settings.json with enabledPlugins)
    setupPluginWithHooks();

    // Then overwrite settings.json with mixed OMQ + non-OMQ hooks
    writeFileSync(join(testClaudeDir, 'settings.json'), JSON.stringify({
      enabledPlugins: { 'oh-my-qoder': true },
      hooks: {
        UserPromptSubmit: [
          {
            hooks: [{
              type: 'command',
              command: 'node $HOME/.qoder/hooks/other-plugin.mjs',
            }],
          },
          {
            hooks: [{
              type: 'command',
              command: 'node "$HOME/.qoder/hooks/keyword-detector.mjs"',
            }],
          },
        ],
      },
    }, null, 2));

    const { install } = await loadInstaller();
    install({ force: true, skipQoderCheck: true });

    const writtenSettings = JSON.parse(
      readFileSync(join(testClaudeDir, 'settings.json'), 'utf-8'),
    ) as { hooks?: Record<string, Array<{ hooks: Array<{ command: string }> }>> };

    // Non-OMQ hook should be preserved
    const commands = writtenSettings.hooks?.UserPromptSubmit?.map(g => g.hooks[0]?.command) ?? [];
    expect(commands).toContain('node $HOME/.qoder/hooks/other-plugin.mjs');
    // OMQ hook should NOT be re-added
    expect(commands).not.toContain('node "$HOME/.qoder/hooks/keyword-detector.mjs"');
  });
});
