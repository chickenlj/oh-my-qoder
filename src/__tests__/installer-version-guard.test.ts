import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { install, QODER_CONFIG_DIR, VERSION_FILE } from '../installer/index.js';

const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);

function withUnixPaths(pathLike: Parameters<typeof existsSync>[0] | Parameters<typeof readFileSync>[0]): string {
  return String(pathLike).replace(/\\/g, '/');
}

describe('install downgrade protection (issue #1382)', () => {
  const claudeMdPath = join(QODER_CONFIG_DIR, 'AGENTS.md');
  const homeClaudeMdPath = join(homedir(), 'AGENTS.md');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips syncing when installed version metadata is newer than the CLI package version', () => {
    mockedExistsSync.mockImplementation((pathLike) => {
      const path = withUnixPaths(pathLike);
      return path === withUnixPaths(VERSION_FILE) || path === withUnixPaths(claudeMdPath);
    });

    mockedReadFileSync.mockImplementation((pathLike) => {
      const path = withUnixPaths(pathLike);
      if (path === withUnixPaths(VERSION_FILE)) {
        return JSON.stringify({ version: '4.7.5' });
      }
      if (path === withUnixPaths(claudeMdPath)) {
        return '<!-- OMQ:START -->\n<!-- OMQ:VERSION:4.7.5 -->\n# OMQ\n<!-- OMQ:END -->\n';
      }
      throw new Error(`Unexpected read: ${path}`);
    });

    const result = install({
      version: '4.5.1',
      skipQoderCheck: true,
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain('Skipping install');
    expect(result.message).toContain('4.7.5');
    expect(result.message).toContain('4.5.1');
    expect(mockedWriteFileSync).not.toHaveBeenCalled();
  });

  it('falls back to the existing AGENTS.md version marker when metadata is missing', () => {
    mockedExistsSync.mockImplementation((pathLike) => {
      const path = withUnixPaths(pathLike);
      return path === withUnixPaths(homeClaudeMdPath);
    });

    mockedReadFileSync.mockImplementation((pathLike) => {
      const path = withUnixPaths(pathLike);
      if (path === withUnixPaths(homeClaudeMdPath)) {
        return '<!-- OMQ:START -->\n<!-- OMQ:VERSION:4.7.5 -->\n# OMQ\n<!-- OMQ:END -->\n';
      }
      throw new Error(`Unexpected read: ${path}`);
    });

    const result = install({
      version: '4.5.1',
      skipQoderCheck: true,
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain('Skipping install');
    expect(result.message).toContain('4.7.5');
    expect(result.message).toContain('4.5.1');
    expect(mockedWriteFileSync).not.toHaveBeenCalled();
  });
});
