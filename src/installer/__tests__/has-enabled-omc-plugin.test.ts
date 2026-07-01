/**
 * Regression tests for `hasEnabledOmqPlugin()` settings format detection.
 *
 * Background: prior to this fix, the function read `settings.plugins`, but
 * Qoder CLI 1.x writes the canonical field as `settings.enabledPlugins`.
 * As a result, `omq update`/`omq setup` invoked from a regular shell (where
 * `QODER_PLUGIN_ROOT` is unset) saw "no plugin enabled" and bypassed the
 * `prunePluginDuplicateSkills` branch entirely, leaving every user with a
 * Qoder CLI 1.x settings.json permanently stuck in the duplicate-skill
 * state from #2252.
 *
 * These tests pin both the modern (`enabledPlugins`) and the legacy
 * (`plugins`) detection paths so a future patch cannot regress either
 * surface.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const ORIG_ENV = { ...process.env };
let testDir: string;

async function freshInstaller() {
  vi.resetModules();
  return await import('../index.js');
}

function writeSettings(content: object): void {
  mkdirSync(testDir, { recursive: true });
  writeFileSync(join(testDir, 'settings.json'), JSON.stringify(content, null, 2));
}

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'omq-has-enabled-'));
  process.env.QODER_CONFIG_DIR = testDir;
  delete process.env.QODER_PLUGIN_ROOT;
  delete process.env.OMQ_PLUGIN_ROOT;
});

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIG_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIG_ENV);
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch { /* ignore */ }
});

describe('hasEnabledOmqPlugin', () => {
  describe('QODER_PLUGIN_ROOT short-circuit (highest priority)', () => {
    it('returns true when QODER_PLUGIN_ROOT is set, even with no settings.json', async () => {
      process.env.QODER_PLUGIN_ROOT = '/some/plugin/root';
      const { hasEnabledOmqPlugin } = await freshInstaller();
      expect(hasEnabledOmqPlugin()).toBe(true);
    });
  });

  describe('Modern Qoder CLI 1.x format (`enabledPlugins`)', () => {
    it('returns true when enabledPlugins.oh-my-qoder@omq is true', async () => {
      writeSettings({
        enabledPlugins: {
          'oh-my-qoder@omq': true,
          'unrelated-plugin@foo': true,
        },
      });
      const { hasEnabledOmqPlugin } = await freshInstaller();
      expect(hasEnabledOmqPlugin()).toBe(true);
    });

    it('returns true for any pluginId substring matching oh-my-qoder', async () => {
      writeSettings({
        enabledPlugins: {
          'oh-my-qoder-fork@somerepo': true,
        },
      });
      const { hasEnabledOmqPlugin } = await freshInstaller();
      expect(hasEnabledOmqPlugin()).toBe(true);
    });

    it('returns false when enabledPlugins.oh-my-qoder@omq is explicitly false', async () => {
      writeSettings({
        enabledPlugins: {
          'oh-my-qoder@omq': false,
        },
      });
      const { hasEnabledOmqPlugin } = await freshInstaller();
      expect(hasEnabledOmqPlugin()).toBe(false);
    });

    it('returns false when enabledPlugins has no oh-my-qoder entry', async () => {
      writeSettings({
        enabledPlugins: {
          'unrelated-plugin@foo': true,
        },
      });
      const { hasEnabledOmqPlugin } = await freshInstaller();
      expect(hasEnabledOmqPlugin()).toBe(false);
    });

    it('handles enabledPlugins as an array of plugin id strings', async () => {
      writeSettings({
        enabledPlugins: ['oh-my-qoder@omq', 'other'],
      });
      const { hasEnabledOmqPlugin } = await freshInstaller();
      expect(hasEnabledOmqPlugin()).toBe(true);
    });
  });

  describe('Legacy `plugins` field (backward compatibility)', () => {
    it('returns true when plugins.oh-my-qoder@omq is true', async () => {
      writeSettings({
        plugins: {
          'oh-my-qoder@omq': true,
        },
      });
      const { hasEnabledOmqPlugin } = await freshInstaller();
      expect(hasEnabledOmqPlugin()).toBe(true);
    });

    it('returns true when plugins is an array with oh-my-qoder entry', async () => {
      writeSettings({
        plugins: ['oh-my-qoder'],
      });
      const { hasEnabledOmqPlugin } = await freshInstaller();
      expect(hasEnabledOmqPlugin()).toBe(true);
    });

    it('returns false when legacy plugins entry is explicitly false', async () => {
      writeSettings({
        plugins: {
          'oh-my-qoder@omq': false,
        },
      });
      const { hasEnabledOmqPlugin } = await freshInstaller();
      expect(hasEnabledOmqPlugin()).toBe(false);
    });
  });

  describe('Mixed format support', () => {
    it('matches oh-my-qoder in EITHER enabledPlugins or plugins', async () => {
      // settings has both fields; enabledPlugins is empty, plugins has the entry
      writeSettings({
        enabledPlugins: { 'unrelated@foo': true },
        plugins: { 'oh-my-qoder@omq': true },
      });
      const { hasEnabledOmqPlugin } = await freshInstaller();
      expect(hasEnabledOmqPlugin()).toBe(true);
    });

    it('returns true when modern enabledPlugins has the entry but legacy plugins does not', async () => {
      writeSettings({
        enabledPlugins: { 'oh-my-qoder@omq': true },
        plugins: { 'unrelated@foo': true },
      });
      const { hasEnabledOmqPlugin } = await freshInstaller();
      expect(hasEnabledOmqPlugin()).toBe(true);
    });

    it('returns false when neither field has an enabled OMQ entry', async () => {
      writeSettings({
        enabledPlugins: { 'unrelated@foo': true },
        plugins: { 'another@bar': true },
      });
      const { hasEnabledOmqPlugin } = await freshInstaller();
      expect(hasEnabledOmqPlugin()).toBe(false);
    });
  });

  describe('Defensive paths', () => {
    it('returns false when settings.json does not exist', async () => {
      // testDir was created by mkdtempSync but no settings.json was written
      const { hasEnabledOmqPlugin } = await freshInstaller();
      expect(hasEnabledOmqPlugin()).toBe(false);
    });

    it('returns false when settings.json is malformed JSON', async () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(join(testDir, 'settings.json'), '{ this is not valid json');
      const { hasEnabledOmqPlugin } = await freshInstaller();
      expect(hasEnabledOmqPlugin()).toBe(false);
    });

    it('returns false when settings.json has neither field', async () => {
      writeSettings({ env: {}, model: 'high' });
      const { hasEnabledOmqPlugin } = await freshInstaller();
      expect(hasEnabledOmqPlugin()).toBe(false);
    });
  });
});
