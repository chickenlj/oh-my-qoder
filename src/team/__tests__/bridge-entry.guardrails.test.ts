import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { validateConfigPath } from '../bridge-entry.js';

describe('bridge-entry workdir guardrails (source contract)', () => {
  const source = readFileSync(join(__dirname, '..', 'bridge-entry.ts'), 'utf-8');

  it('requires working directory to exist and be a directory', () => {
    expect(source).toContain('statSync(workingDirectory)');
    expect(source).toContain('isDirectory()');
  });

  it('requires working directory to stay under home directory', () => {
    expect(source).toContain('realpathSync(workingDirectory)');
    expect(source).toContain("resolved.startsWith(home + '/')");
  });

  it('requires working directory to be inside a git worktree', () => {
    expect(source).toContain('getWorktreeRoot(workingDirectory)');
    expect(source).toContain('workingDirectory is not inside a git worktree');
  });
});

describe('validateConfigPath guardrails', () => {
  const home = '/home/user';
  const claudeConfigDir = '/home/user/.qwen';

  it('rejects path outside home', () => {
    expect(validateConfigPath('/tmp/.omq/config.json', home, claudeConfigDir)).toBe(false);
  });

  it('rejects path not under trusted subpaths', () => {
    expect(validateConfigPath('/home/user/project/config.json', home, claudeConfigDir)).toBe(false);
  });

  it('accepts trusted .omq path under home', () => {
    expect(validateConfigPath('/home/user/project/.omq/state/config.json', home, claudeConfigDir)).toBe(true);
  });
});

