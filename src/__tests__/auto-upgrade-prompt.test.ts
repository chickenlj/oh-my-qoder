import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('../installer/index.js', async () => {
  const actual = await vi.importActual<typeof import('../installer/index.js')>('../installer/index.js');
  return {
    ...actual,
    install: vi.fn(),
    HOOKS_DIR: '/tmp/omq-test-hooks',
    isProjectScopedPlugin: vi.fn(),
    checkNodeVersion: vi.fn(),
  };
});

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

import { existsSync, readFileSync } from 'fs';
import {
  getOMQConfig,
  isAutoUpgradePromptEnabled,
  isSilentAutoUpdateEnabled,
} from '../features/auto-update.js';

const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);

describe('auto-upgrade prompt config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults autoUpgradePrompt to true when config file does not exist', () => {
    mockedExistsSync.mockReturnValue(false);

    const config = getOMQConfig();
    expect(config.autoUpgradePrompt).toBeUndefined();
    expect(isAutoUpgradePromptEnabled()).toBe(true);
  });

  it('defaults autoUpgradePrompt to true when field is not set in config', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify({
      silentAutoUpdate: false,
    }));

    const config = getOMQConfig();
    expect(config.autoUpgradePrompt).toBeUndefined();
    expect(isAutoUpgradePromptEnabled()).toBe(true);
  });

  it('returns true when autoUpgradePrompt is explicitly true', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify({
      silentAutoUpdate: false,
      autoUpgradePrompt: true,
    }));

    expect(isAutoUpgradePromptEnabled()).toBe(true);
    expect(getOMQConfig().autoUpgradePrompt).toBe(true);
  });

  it('returns false when autoUpgradePrompt is explicitly false', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify({
      silentAutoUpdate: false,
      autoUpgradePrompt: false,
    }));

    expect(isAutoUpgradePromptEnabled()).toBe(false);
    expect(getOMQConfig().autoUpgradePrompt).toBe(false);
  });

  it('autoUpgradePrompt and silentAutoUpdate are independent', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify({
      silentAutoUpdate: true,
      autoUpgradePrompt: false,
    }));

    expect(isSilentAutoUpdateEnabled()).toBe(true);
    expect(isAutoUpgradePromptEnabled()).toBe(false);
  });

  it('defaults to true when config file is invalid JSON', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('not valid json');

    expect(isAutoUpgradePromptEnabled()).toBe(true);
  });

  it('silentAutoUpdate blocked by security config (OMQ_SECURITY=strict)', async () => {
    // When security config disables auto-update, silentAutoUpdate=true is overridden
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify({
      silentAutoUpdate: true,
    }));

    const originalSecurity = process.env.OMQ_SECURITY;
    process.env.OMQ_SECURITY = 'strict';
    const { clearSecurityConfigCache } = await import('../lib/security-config.js');
    clearSecurityConfigCache();

    expect(isSilentAutoUpdateEnabled()).toBe(false);

    // Cleanup
    if (originalSecurity === undefined) {
      delete process.env.OMQ_SECURITY;
    } else {
      process.env.OMQ_SECURITY = originalSecurity;
    }
    clearSecurityConfigCache();
  });
});
