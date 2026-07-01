/**
 * End-to-end filesystem tests for `--plugin-dir-mode`.
 *
 * Unlike `plugin-dir-mode.test.ts`, which exercises the CLI precedence helper
 * in isolation, this suite calls the real `install()` function from
 * `src/installer/index.ts` against a throwaway `QODER_CONFIG_DIR` and asserts
 * the resulting on-disk shape matches the documented contract.
 *
 * Scope: installer contract only. The CLI auto-detection log message and the
 * `--no-plugin` / `--plugin-dir-mode` conflict warning live in `src/cli/index.ts`
 * and are exercised by Slice C's CLI tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdtempSync, rmSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OMQ_PLUGIN_ROOT_ENV } from '../../lib/env-vars.js';

const SAVED_ENV_KEYS = [
  'QODER_CONFIG_DIR',
  OMQ_PLUGIN_ROOT_ENV,
  'QODER_PLUGIN_ROOT',
  'OMQ_DEV',
] as const;

type EnvSnapshot = Partial<Record<(typeof SAVED_ENV_KEYS)[number], string | undefined>>;

let testDir: string;
let savedEnv: EnvSnapshot;

async function freshInstaller() {
  vi.resetModules();
  return await import('../index.js');
}

function isPopulated(dir: string): boolean {
  return existsSync(dir) && readdirSync(dir).length > 0;
}

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'omq-pdm-e2e-'));
  savedEnv = {};
  for (const key of SAVED_ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  process.env.QODER_CONFIG_DIR = testDir;
});

afterEach(() => {
  for (const key of SAVED_ENV_KEYS) {
    const prev = savedEnv[key];
    if (prev === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = prev;
    }
  }
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch { /* ignore */ }
});

describe('install() — plugin-dir-mode end-to-end filesystem shape', () => {
  it('case 1: pluginDirMode=true → installs HUD/AGENTS.md/settings/.omq-config but NOT agents/skills', async () => {
    const { install } = await freshInstaller();
    install({ verbose: false, skipQoderCheck: true, pluginDirMode: true });

    // HUD wrapper present and non-empty
    const hudPath = join(testDir, 'hud', 'omq-hud.mjs');
    expect(existsSync(hudPath)).toBe(true);
    expect(statSync(hudPath).size).toBeGreaterThan(0);

    // AGENTS.md present with merge markers
    const claudeMdPath = join(testDir, 'AGENTS.md');
    expect(existsSync(claudeMdPath)).toBe(true);
    const claudeMdContent = readFileSync(claudeMdPath, 'utf8');
    expect(claudeMdContent).toContain('<!-- OMQ:START -->');
    expect(claudeMdContent).toContain('<!-- OMQ:END -->');

    // settings.json present with hooks
    const settingsPath = join(testDir, 'settings.json');
    expect(existsSync(settingsPath)).toBe(true);
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(settings.hooks).toBeDefined();

    // .omq-config.json present
    expect(existsSync(join(testDir, '.omq-config.json'))).toBe(true);

    // agents/ NOT created
    expect(existsSync(join(testDir, 'agents'))).toBe(false);

    // skills/ either missing or empty
    const skillsDir = join(testDir, 'skills');
    if (existsSync(skillsDir)) {
      expect(readdirSync(skillsDir)).toEqual([]);
    }
  });

  it('case 2: OMQ_PLUGIN_ROOT env set + pluginDirMode=true → same shape as case 1', async () => {
    // The CLI's auto-detection of OMQ_PLUGIN_ROOT lives in src/cli/index.ts and
    // is covered by Slice C. Here we test the installer contract: setting
    // pluginDirMode produces the same on-disk shape regardless of whether
    // OMQ_PLUGIN_ROOT points anywhere real.
    process.env[OMQ_PLUGIN_ROOT_ENV] = '/tmp/fake-nonexistent-root-for-pdm-e2e';

    const { install } = await freshInstaller();
    install({ verbose: false, skipQoderCheck: true, pluginDirMode: true });

    expect(existsSync(join(testDir, 'hud', 'omq-hud.mjs'))).toBe(true);
    expect(existsSync(join(testDir, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(testDir, 'settings.json'))).toBe(true);
    expect(existsSync(join(testDir, '.omq-config.json'))).toBe(true);
    expect(existsSync(join(testDir, 'agents'))).toBe(false);
    const skillsDir = join(testDir, 'skills');
    if (existsSync(skillsDir)) {
      expect(readdirSync(skillsDir)).toEqual([]);
    }
  });

  it('case 3: pluginDirMode + noPlugin → noPlugin wins, skills and agents are populated', async () => {
    const { install, hasEnabledOmqPlugin } = await freshInstaller();
    const result = install({
      verbose: false,
      skipQoderCheck: true,
      pluginDirMode: true,
      noPlugin: true,
    });

    // noPlugin forces bundled skills regardless of pluginDirMode
    expect(result.installedSkills.length).toBeGreaterThan(0);
    expect(isPopulated(join(testDir, 'skills'))).toBe(true);

    // Legacy agents are written when not running as a plugin
    if (!hasEnabledOmqPlugin()) {
      expect(result.installedAgents.length).toBeGreaterThan(0);
      expect(isPopulated(join(testDir, 'agents'))).toBe(true);
    }
  });

  it('case 4: no flag, no env → baseline behavior populates skills and agents', async () => {
    const { install, hasEnabledOmqPlugin } = await freshInstaller();
    // Fresh tmp config dir is guaranteed not to have an enabled plugin.
    expect(hasEnabledOmqPlugin()).toBe(false);

    const result = install({ verbose: false, skipQoderCheck: true });

    expect(result.installedAgents.length).toBeGreaterThan(0);
    expect(result.installedSkills.length).toBeGreaterThan(0);
    expect(isPopulated(join(testDir, 'agents'))).toBe(true);
    expect(isPopulated(join(testDir, 'skills'))).toBe(true);
  });
});
