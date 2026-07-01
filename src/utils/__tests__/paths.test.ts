import { describe, it, expect, afterEach } from 'vitest';
import {
  toForwardSlash,
  toShellPath,
  getDataDir,
  getConfigDir,
  getStateDir,
  getGlobalOmqConfigRoot,
  getGlobalOmqStateRoot,
  getGlobalOmqConfigPath,
  getGlobalOmqStatePath,
  getGlobalOmqConfigCandidates,
  getGlobalOmqStateCandidates,
  getLegacyOmqDir,
} from '../paths.js';

describe('cross-platform path utilities', () => {
  describe('toForwardSlash', () => {
    it('should convert backslashes to forward slashes', () => {
      expect(toForwardSlash('C:\\Users\\test\\.qwen')).toBe('C:/Users/test/.qwen');
    });

    it('should leave forward slashes unchanged', () => {
      expect(toForwardSlash('/home/user/.qwen')).toBe('/home/user/.qwen');
    });

    it('should handle mixed slashes', () => {
      expect(toForwardSlash('C:\\Users/test\\.qwen')).toBe('C:/Users/test/.qwen');
    });

    it('should handle empty string', () => {
      expect(toForwardSlash('')).toBe('');
    });

    it('should handle UNC paths', () => {
      expect(toForwardSlash('\\\\server\\share\\path')).toBe('//server/share/path');
    });
  });

  describe('toShellPath', () => {
    it('should convert backslashes to forward slashes', () => {
      expect(toShellPath('C:\\Users\\test')).toBe('C:/Users/test');
    });

    it('should quote paths with spaces', () => {
      expect(toShellPath('/path/with spaces/file')).toBe('"/path/with spaces/file"');
    });

    it('should quote Windows paths with spaces', () => {
      expect(toShellPath('C:\\Program Files\\app')).toBe('"C:/Program Files/app"');
    });

    it('should not quote paths without spaces', () => {
      expect(toShellPath('/simple/path')).toBe('/simple/path');
    });

    it('should handle empty string', () => {
      expect(toShellPath('')).toBe('');
    });
  });

  describe('getDataDir', () => {
    const originalPlatform = process.platform;
    const originalEnv = { ...process.env };

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
      process.env = { ...originalEnv };
    });

    it('should use LOCALAPPDATA on Windows when set', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      process.env.LOCALAPPDATA = 'C:\\Users\\Test\\AppData\\Local';
      expect(getDataDir()).toBe('C:\\Users\\Test\\AppData\\Local');
    });

    it('should use XDG_DATA_HOME on Unix when set', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      process.env.XDG_DATA_HOME = '/custom/data';
      expect(getDataDir()).toBe('/custom/data');
    });

    it('should fall back to .local/share on Unix when XDG not set', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      delete process.env.XDG_DATA_HOME;
      const result = getDataDir();
      expect(result).toContain('.local');
      expect(result).toContain('share');
    });
  });

  describe('getConfigDir', () => {
    const originalPlatform = process.platform;
    const originalEnv = { ...process.env };

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
      process.env = { ...originalEnv };
    });

    it('should use APPDATA on Windows when set', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      process.env.APPDATA = 'C:\\Users\\Test\\AppData\\Roaming';
      expect(getConfigDir()).toBe('C:\\Users\\Test\\AppData\\Roaming');
    });

    it('should use XDG_CONFIG_HOME on Unix when set', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      process.env.XDG_CONFIG_HOME = '/custom/config';
      expect(getConfigDir()).toBe('/custom/config');
    });

    it('should fall back to .config on Unix when XDG not set', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      delete process.env.XDG_CONFIG_HOME;
      const result = getConfigDir();
      expect(result).toContain('.config');
    });
  });

  describe('getStateDir', () => {
    const originalPlatform = process.platform;
    const originalEnv = { ...process.env };

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
      process.env = { ...originalEnv };
    });

    it('should use LOCALAPPDATA on Windows when set', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      process.env.LOCALAPPDATA = 'C:\\Users\\Test\\AppData\\Local';
      expect(getStateDir()).toBe('C:\\Users\\Test\\AppData\\Local');
    });

    it('should use XDG_STATE_HOME on Unix when set', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      process.env.XDG_STATE_HOME = '/custom/state';
      expect(getStateDir()).toBe('/custom/state');
    });

    it('should fall back to .local/state on Unix when XDG not set', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      delete process.env.XDG_STATE_HOME;
      const result = getStateDir();
      expect(result).toContain('.local');
      expect(result).toContain('state');
    });
  });

  describe('global OMQ path helpers', () => {
    const originalPlatform = process.platform;
    const originalEnv = { ...process.env };

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
      process.env = { ...originalEnv };
    });

    it('should use XDG config root for global OMQ config on Linux', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      process.env.XDG_CONFIG_HOME = '/custom/config';
      delete process.env.OMQ_HOME;

      expect(getGlobalOmqConfigRoot()).toBe('/custom/config/omq');
      expect(getGlobalOmqConfigPath('config.json')).toBe('/custom/config/omq/config.json');
    });

    it('should use XDG state root for global OMQ state on Linux', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      process.env.XDG_STATE_HOME = '/custom/state';
      delete process.env.OMQ_HOME;

      expect(getGlobalOmqStateRoot()).toBe('/custom/state/omq');
      expect(getGlobalOmqStatePath('daemon.json')).toBe('/custom/state/omq/daemon.json');
    });

    it('should keep OMQ_HOME authoritative for config and state roots', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      process.env.OMQ_HOME = '/override/omq';
      process.env.XDG_CONFIG_HOME = '/custom/config';
      process.env.XDG_STATE_HOME = '/custom/state';

      expect(getGlobalOmqConfigRoot()).toBe('/override/omq');
      expect(getGlobalOmqStateRoot()).toBe('/override/omq/state');
    });

    it('should keep explicit OMQ_HOME state candidates backward compatible', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      process.env.OMQ_HOME = '/override/omq';

      expect(getGlobalOmqStateCandidates('mcp-registry-state.json')).toEqual([
        '/override/omq/state/mcp-registry-state.json',
        '/override/omq/mcp-registry-state.json',
      ]);
    });

    it('should fall back to legacy ~/.omq root on macOS', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      delete process.env.OMQ_HOME;
      delete process.env.XDG_CONFIG_HOME;
      delete process.env.XDG_STATE_HOME;

      expect(getGlobalOmqConfigRoot()).toBe(getLegacyOmqDir());
      expect(getGlobalOmqStateRoot()).toBe(`${getLegacyOmqDir()}/state`);
    });

    it('should include legacy fallback candidates for config and state paths', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      process.env.XDG_CONFIG_HOME = '/custom/config';
      process.env.XDG_STATE_HOME = '/custom/state';
      delete process.env.OMQ_HOME;

      expect(getGlobalOmqConfigCandidates('config.json')).toEqual([
        '/custom/config/omq/config.json',
        `${getLegacyOmqDir()}/config.json`,
      ]);
      expect(getGlobalOmqStateCandidates('reply-session-registry.jsonl')).toEqual([
        '/custom/state/omq/reply-session-registry.jsonl',
        `${getLegacyOmqDir()}/state/reply-session-registry.jsonl`,
      ]);
    });
  });
});
