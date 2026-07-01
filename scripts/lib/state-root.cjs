// Thin delegator → src/lib/worktree-paths.ts::resolveSessionStatePaths. DO NOT reimplement here.

/**
 * State Root Resolver (CJS)
 *
 * Single authoritative entry point for resolving the .omq root directory in
 * CJS hook scripts, respecting the OMQ_STATE_DIR environment variable.
 *
 * See scripts/lib/state-root.mjs for full documentation.
 */

'use strict';

const { join, basename } = require('path');
const { existsSync } = require('fs');
const { createHash } = require('crypto');

/**
 * Resolve the .omq root directory, respecting OMQ_STATE_DIR.
 *
 * @param {string} directory - Worktree root directory
 * @returns {Promise<string>} Absolute path to the .omq root
 */
async function resolveOmqStateRoot(directory) {
  const pluginRoot = process.env.QODER_PLUGIN_ROOT;
  if (pluginRoot) {
    try {
      const { pathToFileURL } = require('url');
      const { getOmqRoot } = await import(
        pathToFileURL(join(pluginRoot, 'dist', 'lib', 'worktree-paths.js')).href
      );
      return getOmqRoot(directory);
    } catch {
      // dist not built or unavailable — fall through to inline fallback
    }
  }

  // Inline fallback: respects OMQ_STATE_DIR with simplified project identifier
  const customDir = process.env.OMQ_STATE_DIR;
  if (customDir) {
    const hash = createHash('sha256').update(directory).digest('hex').slice(0, 16);
    const dirName = basename(directory).replace(/[^a-zA-Z0-9_-]/g, '_');
    return join(customDir, `${dirName}-${hash}`);
  }
  return join(directory, '.omq');
}

/**
 * Resolve session-scoped state paths for a given directory, state name, and session ID.
 * Delegates to resolveSessionStatePaths() in dist/lib/worktree-paths.js.
 *
 * @param {string} directory - Worktree root directory
 * @param {string} stateName - State name (e.g., "ralph", "ultrawork")
 * @param {string} [sessionId] - Optional session identifier
 * @returns {Promise<{readPath: string, writePath: string}>} Unbranded path pair
 */
async function resolveSessionStatePathsForHook(directory, stateName, sessionId) {
  const pluginRoot = process.env.QODER_PLUGIN_ROOT;
  if (pluginRoot) {
    try {
      const { pathToFileURL } = require('url');
      const { resolveSessionStatePaths } = await import(
        pathToFileURL(join(pluginRoot, 'dist', 'lib', 'worktree-paths.js')).href
      );
      const result = resolveSessionStatePaths(stateName, sessionId, directory);
      return { readPath: result.effectiveRead, writePath: result.effectiveWrite };
    } catch {
      // dist not built or unavailable — fall through to inline fallback
    }
  }

  // Inline fallback: basic session-scoped path derivation (production always uses dist above)
  const omqRoot = await resolveOmqStateRoot(directory);
  const normalizedName = stateName.endsWith('-state') ? stateName : `${stateName}-state`;
  const legacy = join(omqRoot, 'state', `${normalizedName}.json`);
  if (!sessionId) {
    return { readPath: legacy, writePath: legacy };
  }
  const sessionScoped = join(omqRoot, 'state', 'sessions', sessionId, `${normalizedName}.json`);
  // effectiveRead probes the session-scoped file first and falls back to the
  // legacy path when it does not exist yet (mirrors resolveSessionStatePaths).
  const readPath = existsSync(sessionScoped) ? sessionScoped : legacy;
  return { readPath, writePath: sessionScoped };
}

module.exports = { resolveOmqStateRoot, resolveSessionStatePathsForHook };
