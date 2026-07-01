/**
 * Cross-Platform Path Utilities
 *
 * Provides utility functions for handling paths across Windows, macOS, and Linux.
 * These utilities ensure paths in configuration files use forward slashes
 * (which work universally) and handle platform-specific directory conventions.
 */

import { join } from 'path';
import { existsSync, readFileSync, readdirSync, statSync, unlinkSync, rmSync, symlinkSync } from 'fs';
import { homedir } from 'os';
import { getQoderConfigDir } from './config-dir.js';

/**
 * Convert a path to use forward slashes (for JSON/config files)
 * This is necessary because settings.json commands are executed
 * by shells that expect forward slashes even on Windows
 */
export function toForwardSlash(path: string): string {
  return path.replace(/\\/g, '/');
}

/**
 * Get a path suitable for use in shell commands
 * Converts backslashes to forward slashes for cross-platform compatibility
 */
export function toShellPath(path: string): string {
  const normalized = toForwardSlash(path);
  // Windows paths with spaces need quoting
  if (normalized.includes(' ')) {
    return `"${normalized}"`;
  }
  return normalized;
}

/**
 * Get Windows-appropriate data directory
 * Falls back to sensible locations instead of XDG paths
 */
export function getDataDir(): string {
  if (process.platform === 'win32') {
    return process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
  }
  return process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share');
}

/**
 * Get Windows-appropriate config directory
 */
export function getConfigDir(): string {
  if (process.platform === 'win32') {
    return process.env.APPDATA || join(homedir(), 'AppData', 'Roaming');
  }
  return process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
}

/**
 * Get Windows-appropriate state directory.
 */
export function getStateDir(): string {
  if (process.platform === 'win32') {
    return process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
  }

  return process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state');
}

function prefersXdgOmqDirs(): boolean {
  return process.platform !== 'win32' && process.platform !== 'darwin';
}

function getUserHomeDir(): string {
  if (process.platform === 'win32') {
    return process.env.USERPROFILE || process.env.HOME || homedir();
  }

  return process.env.HOME || homedir();
}

/**
 * Legacy global OMQ directory under the user's home directory.
 */
export function getLegacyOmqDir(): string {
  return join(getUserHomeDir(), '.omq');
}

/**
 * Global OMQ config directory.
 *
 * Precedence:
 * 1. OMQ_HOME (existing explicit override)
 * 2. XDG-aware config root on Linux/Unix
 * 3. Legacy ~/.omq elsewhere
 */
export function getGlobalOmqConfigRoot(): string {
  const explicitRoot = process.env.OMQ_HOME?.trim();
  if (explicitRoot) {
    return explicitRoot;
  }

  if (prefersXdgOmqDirs()) {
    return join(getConfigDir(), 'omq');
  }

  return getLegacyOmqDir();
}

/**
 * Global OMQ state directory.
 *
 * When OMQ_HOME is set, preserve that existing override semantics by treating
 * it as the shared root and resolving state beneath it.
 */
export function getGlobalOmqStateRoot(): string {
  const explicitRoot = process.env.OMQ_HOME?.trim();
  if (explicitRoot) {
    return join(explicitRoot, 'state');
  }

  if (prefersXdgOmqDirs()) {
    return join(getStateDir(), 'omq');
  }

  return join(getLegacyOmqDir(), 'state');
}

export function getGlobalOmqConfigPath(...segments: string[]): string {
  return join(getGlobalOmqConfigRoot(), ...segments);
}

export function getGlobalOmqStatePath(...segments: string[]): string {
  return join(getGlobalOmqStateRoot(), ...segments);
}

export function getLegacyOmqPath(...segments: string[]): string {
  return join(getLegacyOmqDir(), ...segments);
}

function dedupePaths(paths: string[]): string[] {
  return [...new Set(paths)];
}

export function getGlobalOmqConfigCandidates(...segments: string[]): string[] {
  if (process.env.OMQ_HOME?.trim()) {
    return [getGlobalOmqConfigPath(...segments)];
  }

  return dedupePaths([
    getGlobalOmqConfigPath(...segments),
    getLegacyOmqPath(...segments),
  ]);
}

export function getGlobalOmqStateCandidates(...segments: string[]): string[] {
  const explicitRoot = process.env.OMQ_HOME?.trim();
  if (explicitRoot) {
    return dedupePaths([
      getGlobalOmqStatePath(...segments),
      join(explicitRoot, ...segments),
    ]);
  }

  return dedupePaths([
    getGlobalOmqStatePath(...segments),
    getLegacyOmqPath('state', ...segments),
  ]);
}

/**
 * Get the plugin cache base directory for oh-my-qoder.
 * This is the directory containing version subdirectories.
 *
 * Structure: <configDir>/plugins/cache/omq/oh-my-qoder/
 */
export function getPluginCacheBase(): string {
  return join(getQoderConfigDir(), 'plugins', 'cache', 'omq', 'oh-my-qoder');
}

/**
 * Safely delete a file, ignoring ENOENT errors.
 * Prevents crashes when cleaning up files that may not exist (Bug #13 fix).
 */
export function safeUnlinkSync(filePath: string): boolean {
  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Safely remove a directory recursively, ignoring errors.
 */
export function safeRmSync(dirPath: string): boolean {
  try {
    if (existsSync(dirPath)) {
      rmSync(dirPath, { recursive: true, force: true });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Result of a plugin cache purge operation.
 */
export interface PurgeCacheResult {
  /** Number of stale version directories removed */
  removed: number;
  /** Paths that were removed */
  removedPaths: string[];
  /** Number of stale version directories replaced with symlinks to the active version */
  symlinked: number;
  /** Paths that were converted to symlinks */
  symlinkPaths: string[];
  /** Errors encountered (non-fatal) */
  errors: string[];
}

/**
 * Purge stale plugin cache versions that are no longer referenced by
 * installed_plugins.json.
 *
 * Qoder CLI caches each plugin version under:
 *   <configDir>/plugins/cache/<marketplace>/<plugin>/<version>/
 *
 * On plugin update the old version directory is left behind. This function
 * reads the active install paths from installed_plugins.json and removes
 * every version directory that is NOT active.
 */
/**
 * Strip trailing slashes from a normalised forward-slash path.
 */
function stripTrailing(p: string): string {
  return toForwardSlash(p).replace(/\/+$/, '');
}

/** Default grace period: skip directories modified within the last 24 hours.
 * Extended from 1 hour to 24 hours to avoid deleting cache directories that
 * are still referenced by long-running sessions via QODER_PLUGIN_ROOT. */
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/**
 * Compare two semver-like version strings descending (higher version first).
 * Non-numeric segments fall back to 0.
 */
function compareSemverDesc(a: string, b: string): number {
  const parse = (s: string) => s.split('.').map(n => parseInt(n, 10) || 0);
  const pa = parse(a), pb = parse(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function purgeStalePluginCacheVersions(options?: { skipGracePeriod?: boolean }): PurgeCacheResult {
  const result: PurgeCacheResult = { removed: 0, removedPaths: [], symlinked: 0, symlinkPaths: [], errors: [] };

  const configDir = getQoderConfigDir();
  const pluginsDir = join(configDir, 'plugins');
  const installedFile = join(pluginsDir, 'installed_plugins.json');
  const cacheDir = join(pluginsDir, 'cache');

  if (!existsSync(installedFile) || !existsSync(cacheDir)) {
    return result;
  }

  // Collect active install paths (normalised, trailing-slash stripped)
  let activePaths: Set<string>;
  try {
    const raw = JSON.parse(readFileSync(installedFile, 'utf-8'));
    const plugins = raw.plugins ?? raw;
    if (typeof plugins !== 'object' || plugins === null || Array.isArray(plugins)) {
      result.errors.push('installed_plugins.json has unexpected top-level structure');
      return result;
    }
    activePaths = new Set<string>();
    for (const entries of Object.values(plugins as Record<string, unknown>)) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        const ip = (entry as { installPath?: string }).installPath;
        if (ip) {
          activePaths.add(stripTrailing(ip));
        }
      }
    }
  } catch (err) {
    result.errors.push(`Failed to parse installed_plugins.json: ${err instanceof Error ? err.message : err}`);
    return result;
  }

  // Walk cache/<marketplace>/<plugin>/<version> and remove inactive versions
  let marketplaces: string[];
  try {
    marketplaces = readdirSync(cacheDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  } catch {
    return result;
  }

  const now = Date.now();
  const activePathsArray = [...activePaths];

  for (const marketplace of marketplaces) {
    const marketDir = join(cacheDir, marketplace);
    let pluginNames: string[];
    try {
      pluginNames = readdirSync(marketDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
    } catch { continue; }

    for (const pluginName of pluginNames) {
      const pluginDir = join(marketDir, pluginName);
      let versions: string[];
      try {
        versions = readdirSync(pluginDir, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => d.name);
      } catch { continue; }

      for (const version of versions) {
        const versionDir = join(pluginDir, version);
        const normalised = stripTrailing(versionDir);

        // Check if this version or any of its subdirectories are referenced
        const isActive = activePaths.has(normalised) ||
          activePathsArray.some(ap => ap.startsWith(normalised + '/'));

        if (isActive) continue;

        // Grace period: skip recently modified directories to avoid
        // race conditions during concurrent plugin updates
        if (!options?.skipGracePeriod) {
          try {
            const stats = statSync(versionDir);
            if (now - stats.mtimeMs < STALE_THRESHOLD_MS) continue;
          } catch { continue; }
        }

        // When an active version exists in the same plugin namespace, replace the
        // stale directory with a symlink rather than deleting it.  This keeps any
        // running session whose QODER_PLUGIN_ROOT still points to this path working.
        const pluginDirNorm = stripTrailing(pluginDir);
        const activeVersionDirsHere = dedupePaths(
          activePathsArray
            .filter(ap => ap.startsWith(pluginDirNorm + '/'))
            .map(ap => join(pluginDir, ap.slice(pluginDirNorm.length + 1).split('/')[0])),
        );

        if (activeVersionDirsHere.length > 0) {
          const target = [...activeVersionDirsHere].sort((a, b) =>
            compareSemverDesc(
              a.split('/').pop() ?? a,
              b.split('/').pop() ?? b,
            ),
          )[0];
          if (safeRmSync(versionDir)) {
            try {
              symlinkSync(target, versionDir, process.platform === 'win32' ? 'junction' : 'dir');
              result.symlinked++;
              result.symlinkPaths.push(versionDir);
            } catch (err) {
              result.errors.push(
                `Failed to symlink ${versionDir} → ${target}: ${err instanceof Error ? err.message : err}`,
              );
            }
          }
        } else {
          if (safeRmSync(versionDir)) {
            result.removed++;
            result.removedPaths.push(versionDir);
          }
        }
      }
    }
  }

  return result;
}
