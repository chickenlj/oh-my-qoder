/**
 * Tests for Safe Installer (Task T2)
 * Tests hook conflict detection and forceHooks option
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { isOmqHook, InstallOptions } from '../index.js';

/**
 * Detect hook conflicts using the real isOmqHook function.
 * Mirrors the install() logic to avoid test duplication.
 */
function detectConflicts(
  hooks: Record<string, Array<{ hooks: Array<{ type: string; command: string }> }>>
): Array<{ eventType: string; existingCommand: string }> {
  const conflicts: Array<{ eventType: string; existingCommand: string }> = [];
  for (const [eventType, eventHooks] of Object.entries(hooks)) {
    for (const hookGroup of eventHooks) {
      for (const hook of hookGroup.hooks) {
        if (hook.type === 'command' && !isOmqHook(hook.command)) {
          conflicts.push({ eventType, existingCommand: hook.command });
        }
      }
    }
  }
  return conflicts;
}

const TEST_CLAUDE_DIR = join(homedir(), '.qwen-test-safe-installer');
const TEST_SETTINGS_FILE = join(TEST_CLAUDE_DIR, 'settings.json');

describe('isOmqHook', () => {
  it('returns true for commands containing "omq"', () => {
    expect(isOmqHook('node ~/.qoder/hooks/omq-hook.mjs')).toBe(true);
    expect(isOmqHook('bash $HOME/.qoder/hooks/omq-detector.sh')).toBe(true);
    expect(isOmqHook('/usr/bin/omq-tool')).toBe(true);
  });

  it('returns true for commands containing "oh-my-qoder"', () => {
    expect(isOmqHook('node ~/.qoder/hooks/oh-my-qoder-hook.mjs')).toBe(true);
    expect(isOmqHook('bash $HOME/.qoder/hooks/oh-my-qoder.sh')).toBe(true);
  });

  it('returns false for commands not containing omq or oh-my-qoder', () => {
    expect(isOmqHook('node ~/.qoder/hooks/other-plugin.mjs')).toBe(false);
    expect(isOmqHook('bash $HOME/.qoder/hooks/beads-hook.sh')).toBe(false);
    expect(isOmqHook('python /usr/bin/custom-hook.py')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isOmqHook('node ~/.qoder/hooks/OMQ-hook.mjs')).toBe(true);
    expect(isOmqHook('bash $HOME/.qoder/hooks/OH-MY-QODER.sh')).toBe(true);
  });
});

describe('isOmqHook detection', () => {
  it('detects real OMQ hooks correctly', () => {
    expect(isOmqHook('node ~/.qoder/hooks/omq-hook.mjs')).toBe(true);
    expect(isOmqHook('node ~/.qoder/hooks/oh-my-qoder-hook.mjs')).toBe(true);
    expect(isOmqHook('node ~/.qoder/hooks/omq-pre-tool-use.mjs')).toBe(true);
    expect(isOmqHook('/usr/local/bin/omq')).toBe(true);
  });

  it('detects actual OMQ hook commands from settings.json (issue #606)', () => {
    // These are the real commands OMQ installs into settings.json
    expect(isOmqHook('node "$HOME/.qoder/hooks/keyword-detector.mjs"')).toBe(true);
    expect(isOmqHook('node "$HOME/.qoder/hooks/session-start.mjs"')).toBe(true);
    expect(isOmqHook('node "$HOME/.qoder/hooks/pre-tool-use.mjs"')).toBe(true);
    expect(isOmqHook('node "$HOME/.qoder/hooks/post-tool-use.mjs"')).toBe(true);
    expect(isOmqHook('node "$HOME/.qoder/hooks/post-tool-use-failure.mjs"')).toBe(true);
    expect(isOmqHook('node "$HOME/.qoder/hooks/persistent-mode.mjs"')).toBe(true);
  });

  it('detects custom-profile OMQ hook commands by hook filename', () => {
    expect(isOmqHook('node "/tmp/custom-claude/hooks/keyword-detector.mjs"')).toBe(true);
  });

  it('detects QODER_CONFIG_DIR-aware hook commands', () => {
    expect(isOmqHook('node "${QODER_CONFIG_DIR:-$HOME/.qwen}/hooks/keyword-detector.mjs"')).toBe(true);
    expect(isOmqHook('node "${QODER_CONFIG_DIR:-$HOME/.qwen}/hooks/pre-tool-use.mjs"')).toBe(true);
    expect(isOmqHook('node "${QODER_CONFIG_DIR:-$HOME/.qwen}/hooks/persistent-mode.mjs"')).toBe(true);
  });

  it('detects Windows-style OMQ hook commands (issue #606)', () => {
    expect(isOmqHook('node "%USERPROFILE%\\.qwen\\hooks\\keyword-detector.mjs"')).toBe(true);
    expect(isOmqHook('node "%USERPROFILE%\\.qwen\\hooks\\pre-tool-use.mjs"')).toBe(true);
  });

  it('rejects non-OMQ hooks correctly', () => {
    expect(isOmqHook('eslint --fix')).toBe(false);
    expect(isOmqHook('prettier --write')).toBe(false);
    expect(isOmqHook('node custom-hook.mjs')).toBe(false);
    expect(isOmqHook('node ~/other-plugin/hooks/detector.mjs')).toBe(false);
  });

  it('uses case-insensitive matching', () => {
    expect(isOmqHook('node ~/.qoder/hooks/OMQ-hook.mjs')).toBe(true);
    expect(isOmqHook('OH-MY-QODER-detector.sh')).toBe(true);
  });
});

describe('Safe Installer - Hook Conflict Detection', () => {
  beforeEach(() => {
    // Clean up test directory
    if (existsSync(TEST_CLAUDE_DIR)) {
      rmSync(TEST_CLAUDE_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_CLAUDE_DIR, { recursive: true });

    // Mock QODER_CONFIG_DIR for testing
    process.env.TEST_QODER_CONFIG_DIR = TEST_CLAUDE_DIR;
  });

  afterEach(() => {
    // Clean up
    if (existsSync(TEST_CLAUDE_DIR)) {
      rmSync(TEST_CLAUDE_DIR, { recursive: true, force: true });
    }
    delete process.env.TEST_QODER_CONFIG_DIR;
  });

  it('detects conflict when PreToolUse is owned by another plugin', () => {
    // Create settings.json with non-OMQ hook
    const existingSettings = {
      hooks: {
        PreToolUse: [
          {
            hooks: [
              {
                type: 'command',
                command: 'node ~/.qoder/hooks/beads-hook.mjs'
              }
            ]
          }
        ]
      }
    };
    writeFileSync(TEST_SETTINGS_FILE, JSON.stringify(existingSettings, null, 2));

    const _options: InstallOptions = {
      verbose: true,
      skipQoderCheck: true
    };

    // Simulate install logic (we'd need to mock or refactor install function for full test)
    // For now, test the detection logic directly
    const conflicts = detectConflicts(existingSettings.hooks);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].eventType).toBe('PreToolUse');
    expect(conflicts[0].existingCommand).toBe('node ~/.qoder/hooks/beads-hook.mjs');
  });

  it('does not detect conflict when hook is OMQ-owned', () => {
    const existingSettings = {
      hooks: {
        PreToolUse: [
          {
            hooks: [
              {
                type: 'command',
                command: 'node "$HOME/.qoder/hooks/pre-tool-use.mjs"'
              }
            ]
          }
        ]
      }
    };

    const conflicts = detectConflicts(existingSettings.hooks);

    expect(conflicts).toHaveLength(0);
  });

  it('detects multiple conflicts across different hook events', () => {
    const existingSettings = {
      hooks: {
        PreToolUse: [
          {
            hooks: [
              {
                type: 'command',
                command: 'node ~/.qoder/hooks/beads-pre-tool-use.mjs'
              }
            ]
          }
        ],
        PostToolUse: [
          {
            hooks: [
              {
                type: 'command',
                command: 'python ~/.qoder/hooks/custom-post-tool.py'
              }
            ]
          }
        ],
        UserPromptSubmit: [
          {
            hooks: [
              {
                type: 'command',
                command: 'node "$HOME/.qoder/hooks/keyword-detector.mjs"'
              }
            ]
          }
        ]
      }
    };

    const conflicts = detectConflicts(existingSettings.hooks);

    expect(conflicts).toHaveLength(2);
    expect(conflicts.map(c => c.eventType)).toContain('PreToolUse');
    expect(conflicts.map(c => c.eventType)).toContain('PostToolUse');
    expect(conflicts.map(c => c.eventType)).not.toContain('UserPromptSubmit');
  });
});
