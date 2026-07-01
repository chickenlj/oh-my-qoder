import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const originalClaudeConfigDir = process.env.QODER_CONFIG_DIR;
const originalPluginRoot = process.env.QODER_PLUGIN_ROOT;
const originalHome = process.env.HOME;

let tempRoot: string;
let testClaudeDir: string;
let testHomeDir: string;

async function loadInstaller() {
  vi.resetModules();
  return import('../index.js');
}

describe('install() AGENTS.md target resolution', () => {
  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'omq-claude-target-'));
    testClaudeDir = join(tempRoot, 'global-claude');
    testHomeDir = join(tempRoot, 'home');

    mkdirSync(testClaudeDir, { recursive: true });
    mkdirSync(testHomeDir, { recursive: true });

    process.env.QODER_CONFIG_DIR = testClaudeDir;
    process.env.HOME = testHomeDir;
    delete process.env.QODER_PLUGIN_ROOT;
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });

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

  it('updates ~/.qoder/AGENTS.md even when ~/AGENTS.md exists', async () => {
    const configClaudePath = join(testClaudeDir, 'AGENTS.md');
    const homeClaudePath = join(testHomeDir, 'AGENTS.md');

    writeFileSync(homeClaudePath, '# Home CLAUDE\nkeep me\n');
    writeFileSync(
      configClaudePath,
      '<!-- OMQ:START -->\n<!-- OMQ:VERSION:0.0.1 -->\n# Old OMQ\nstale installer content\n<!-- OMQ:END -->\n',
    );

    const { install, VERSION } = await loadInstaller();
    const result = install({
      force: true,
      skipQoderCheck: true,
      skipHud: true,
    });

    const updatedConfig = readFileSync(configClaudePath, 'utf-8');

    expect(result.success).toBe(true);
    expect(updatedConfig).toContain(`<!-- OMQ:VERSION:${VERSION} -->`);
    expect(updatedConfig).not.toContain('stale installer content');
    expect(readFileSync(homeClaudePath, 'utf-8')).toBe('# Home CLAUDE\nkeep me\n');

    const backups = readdirSync(testClaudeDir).filter(name => name.startsWith('AGENTS.md.backup.'));
    expect(backups).toHaveLength(1);
  });

  it('preserves project-scoped behavior by skipping global AGENTS.md writes', async () => {
    process.env.QODER_PLUGIN_ROOT = join(tempRoot, 'project', '.qwen', 'plugins', 'oh-my-qoder');
    writeFileSync(join(testHomeDir, 'AGENTS.md'), '# Home CLAUDE\nkeep me\n');

    const { install } = await loadInstaller();
    const result = install({
      force: true,
      skipQoderCheck: true,
      skipHud: true,
    });

    expect(result.success).toBe(true);
    expect(existsSync(join(testClaudeDir, 'AGENTS.md'))).toBe(false);
  });
});
