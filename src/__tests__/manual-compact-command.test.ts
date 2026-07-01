import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { detectSlashCommand } from '../hooks/auto-slash-command/detector.js';

const PROJECT_ROOT = join(__dirname, '..', '..');
const COMMAND_PATH = join(PROJECT_ROOT, 'commands', 'compact.md');
const PLUGIN_MANIFEST_PATH = join(PROJECT_ROOT, '.qoder-plugin', 'plugin.json');

const originalConfigDir = process.env.QODER_CONFIG_DIR;
let tempConfigDir: string;

async function loadCommandsModule() {
  // getQoderConfigDir reads env at module load time in some call paths.
  return import('../commands/index.js');
}

describe('manual compact command', () => {
  beforeEach(() => {
    tempConfigDir = join(tmpdir(), `omq-manual-compact-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(tempConfigDir, 'commands'), { recursive: true });
    process.env.QODER_CONFIG_DIR = tempConfigDir;
  });

  afterEach(() => {
    rmSync(tempConfigDir, { recursive: true, force: true });
    if (originalConfigDir === undefined) {
      delete process.env.QODER_CONFIG_DIR;
    } else {
      process.env.QODER_CONFIG_DIR = originalConfigDir;
    }
  });

  it('ships a plugin-scoped compact command without shadowing native /compact', () => {
    expect(existsSync(COMMAND_PATH)).toBe(true);

    const manifest = JSON.parse(readFileSync(PLUGIN_MANIFEST_PATH, 'utf-8')) as { name?: string };
    expect(manifest.name).toBe('oh-my-qoder');

    const command = readFileSync(COMMAND_PATH, 'utf-8');
    expect(command).toContain('/oh-my-qoder:compact');
    expect(command).toContain('Bare `/compact` is reserved for Qoder CLI');
    expect(command).not.toContain('Skill("compact")');
    expect(command).toContain('instruction-only');
    expect(command).toContain('Run this as a bare Qoder CLI command now');
    expect(command).toContain('$ARGUMENTS');
    expect(command).toContain('PreCompact');

    // OMQ's auto slash expansion must continue to ignore bare /compact so the
    // host/native command keeps its semantics.
    expect(detectSlashCommand('/compact')).toBeNull();
  });

  it('expands through the command utility to a safe manual handoff', async () => {
    writeFileSync(
      join(tempConfigDir, 'commands', 'compact.md'),
      readFileSync(COMMAND_PATH, 'utf-8'),
      'utf-8',
    );

    const { expandCommand } = await loadCommandsModule();
    const expanded = expandCommand('compact', 'preserve current issue and PR state');

    expect(expanded).not.toBeNull();
    expect(expanded?.description).toContain('Prepare OMQ context for a manual Qoder CLI /compact handoff');
    expect(expanded?.prompt).not.toContain('Skill("compact")');
    expect(expanded?.prompt).toContain('/compact preserve current issue and PR state');
    expect(expanded?.prompt).toContain('plugin commands cannot trigger Qoder CLI');
    expect(expanded?.prompt).toContain('preserve current issue and PR state');
    expect(expanded?.prompt).toContain('Do not create a separate OMQ summarizer');
  });
});
