import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('install() user-skill compatibility shims', () => {
  let tempDir: string;
  let originalConfigDir: string | undefined;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'omq-installer-user-skill-compat-'));
    originalConfigDir = process.env.QODER_CONFIG_DIR;
    process.env.QODER_CONFIG_DIR = tempDir;
    vi.resetModules();
  });

  afterEach(() => {
    if (originalConfigDir === undefined) {
      delete process.env.QODER_CONFIG_DIR;
    } else {
      process.env.QODER_CONFIG_DIR = originalConfigDir;
    }
    rmSync(tempDir, { recursive: true, force: true });
    vi.resetModules();
  });

  it('syncs existing omq-learned user skills into flat Qoder CLI skill directories during install', async () => {
    const learnedDir = join(tempDir, 'skills', 'omq-learned');
    mkdirSync(learnedDir, { recursive: true });
    writeFileSync(
      join(learnedDir, 'expert-review.md'),
      '---\nname: expert-review\ndescription: review\ntriggers:\n  - expert-review\n---\n\nUse expert review.\n',
    );

    const installer = await import('../index.js');
    const result = installer.install({ force: true, skipQoderCheck: true, noPlugin: true, verbose: false });

    expect(result.success).toBe(true);

    const flatSkillPath = join(tempDir, 'skills', 'expert-review', 'SKILL.md');
    expect(existsSync(flatSkillPath)).toBe(true);
    expect(readFileSync(flatSkillPath, 'utf-8')).toContain('Use expert review.');
  });
});
