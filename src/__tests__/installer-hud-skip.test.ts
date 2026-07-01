import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

import { existsSync, readFileSync } from 'fs';
import { isHudEnabledInConfig, isOmqStatusLine, QODER_CONFIG_DIR } from '../installer/index.js';
import type { InstallOptions } from '../installer/index.js';
import { join } from 'path';

const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);

describe('isHudEnabledInConfig', () => {
  const configPath = join(QODER_CONFIG_DIR, '.omq-config.json');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return true when config file does not exist', () => {
    mockedExistsSync.mockReturnValue(false);

    expect(isHudEnabledInConfig()).toBe(true);
    expect(mockedExistsSync).toHaveBeenCalledWith(configPath);
  });

  it('should return true when hudEnabled is not set in config', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify({ silentAutoUpdate: false }));

    expect(isHudEnabledInConfig()).toBe(true);
  });

  it('should return true when hudEnabled is explicitly true', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify({ silentAutoUpdate: false, hudEnabled: true }));

    expect(isHudEnabledInConfig()).toBe(true);
  });

  it('should return false when hudEnabled is explicitly false', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify({ silentAutoUpdate: false, hudEnabled: false }));

    expect(isHudEnabledInConfig()).toBe(false);
  });

  it('should return true when config file has invalid JSON', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('not valid json');

    expect(isHudEnabledInConfig()).toBe(true);
  });

  it('should return true when readFileSync throws', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockImplementation(() => {
      throw new Error('read error');
    });

    expect(isHudEnabledInConfig()).toBe(true);
  });
});

describe('InstallOptions skipHud', () => {
  it('should accept skipHud as a valid option', () => {
    const opts: InstallOptions = { skipHud: true };
    expect(opts.skipHud).toBe(true);
  });

  it('should accept skipHud as false', () => {
    const opts: InstallOptions = { skipHud: false };
    expect(opts.skipHud).toBe(false);
  });

  it('should accept skipHud as undefined (default)', () => {
    const opts: InstallOptions = {};
    expect(opts.skipHud).toBeUndefined();
  });
});

describe('isOmqStatusLine', () => {
  it('should return true for OMQ HUD statusLine', () => {
    expect(isOmqStatusLine({
      type: 'command',
      command: 'node /home/user/.qoder/hud/omq-hud.mjs'
    })).toBe(true);
  });

  it('should return true for any command containing omq-hud', () => {
    expect(isOmqStatusLine({
      type: 'command',
      command: '/usr/local/bin/node /some/path/omq-hud.mjs'
    })).toBe(true);
  });

  it('should return false for custom statusLine', () => {
    expect(isOmqStatusLine({
      type: 'command',
      command: 'my-custom-statusline --fancy'
    })).toBe(false);
  });

  it('should return false for null', () => {
    expect(isOmqStatusLine(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isOmqStatusLine(undefined)).toBe(false);
  });

  // Legacy string format tests (pre-v4.5 compatibility)
  it('should return true for legacy string containing omq-hud', () => {
    expect(isOmqStatusLine('~/.qoder/hud/omq-hud.mjs')).toBe(true);
  });

  it('should return true for legacy string with absolute path to omq-hud', () => {
    expect(isOmqStatusLine('/home/user/.qoder/hud/omq-hud.mjs')).toBe(true);
  });

  it('should return false for non-OMQ string', () => {
    expect(isOmqStatusLine('my-custom-statusline')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isOmqStatusLine('')).toBe(false);
  });

  it('should return false for object without command', () => {
    expect(isOmqStatusLine({ type: 'command' })).toBe(false);
  });

  it('should return false for object with non-string command', () => {
    expect(isOmqStatusLine({ type: 'command', command: 42 })).toBe(false);
  });

  it('should recognize portable $HOME statusLine as OMQ', () => {
    expect(isOmqStatusLine({
      type: 'command',
      command: 'node $HOME/.qoder/hud/omq-hud.mjs'
    })).toBe(true);
  });

  it('should recognize find-node.sh statusLine as OMQ', () => {
    expect(isOmqStatusLine({
      type: 'command',
      command: 'sh $HOME/.qoder/hud/find-node.sh $HOME/.qoder/hud/omq-hud.mjs'
    })).toBe(true);
  });

  it('should recognize QODER_CONFIG_DIR-aware statusLine as OMQ', () => {
    expect(isOmqStatusLine({
      type: 'command',
      command: 'node ${QODER_CONFIG_DIR:-$HOME/.qwen}/hud/omq-hud.mjs'
    })).toBe(true);
  });

  it('should recognize QODER_CONFIG_DIR-aware find-node.sh statusLine as OMQ', () => {
    expect(isOmqStatusLine({
      type: 'command',
      command: 'sh ${QODER_CONFIG_DIR:-$HOME/.qwen}/hud/find-node.sh ${QODER_CONFIG_DIR:-$HOME/.qwen}/hud/omq-hud.mjs'
    })).toBe(true);
  });


  it('should recognize cached HUD statusLine as OMQ', () => {
    expect(isOmqStatusLine({
      type: 'command',
      command: 'sh ${QODER_CONFIG_DIR:-$HOME/.qwen}/hud/omq-hud-cache.sh ${QODER_CONFIG_DIR:-$HOME/.qwen}/hud/omq-hud.mjs'
    })).toBe(true);
  });
});
