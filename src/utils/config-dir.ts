/**
 * Qoder CLI Configuration Directory Resolution
 *
 * Resolves the active Qoder CLI configuration directory, honouring
 * QODER_CONFIG_DIR (absolute path, or ~-prefixed) with fallback to
 * ~/.qoder.  Trailing separators are stripped; filesystem roots are
 * preserved.
 *
 * Multi-surface mirrors (keep in sync):
 *   scripts/lib/config-dir.mjs   — ESM hook/HUD runtime
 *   scripts/lib/config-dir.cjs   — CJS bridge runtime
 *   scripts/lib/config-dir.sh    — POSIX shell runtime
 */

import { join, normalize, parse, sep } from 'path';
import { homedir } from 'os';

/**
 * Strip a single trailing path separator (preserve filesystem root).
 * @internal Shared with scripts/lib/config-dir.{mjs,cjs,sh} — keep in sync.
 */
function stripTrailingSep(p: string): string {
  if (!p.endsWith(sep)) {
    return p;
  }
  return p === parse(p).root ? p : p.slice(0, -1);
}

/**
 * Resolve the Qoder CLI configuration directory.
 *
 * Honours QODER_CONFIG_DIR (absolute path, or ~-prefixed) with fallback
 * to ~/.qoder.  Trailing separators are stripped; filesystem roots are
 * preserved.
 */
export function getQoderConfigDir(): string {
  const home = homedir();
  const configured = process.env.QODER_CONFIG_DIR?.trim();

  if (!configured) {
    return stripTrailingSep(normalize(join(home, '.qoder')));
  }

  if (configured === '~') {
    return stripTrailingSep(normalize(home));
  }

  if (configured.startsWith('~/') || configured.startsWith('~\\')) {
    return stripTrailingSep(normalize(join(home, configured.slice(2))));
  }

  return stripTrailingSep(normalize(configured));
}

/**
 * Resolve the OMQ global configuration/cache directory under the active Claude
 * config dir. This keeps hook/updater/HUD caches aligned with QODER_CONFIG_DIR
 * instead of mixing in ~/.omq.
 */
export function getOmqConfigDir(): string {
  return join(getQoderConfigDir(), '.omq');
}

/** Resolve the canonical update-check cache file path. */
export function getUpdateCheckCachePath(): string {
  return join(getOmqConfigDir(), 'update-check.json');
}
