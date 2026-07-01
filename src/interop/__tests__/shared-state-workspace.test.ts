/**
 * Regression test for workspace-marker path resolution in shared-state.
 *
 * When initInteropSession (and all other writers) are called from a sub-repo
 * inside a .omq-workspace multi-repo layout, interop state must land at the
 * workspace root's .omq/, not at the sub-repo's .omq/.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { tmpdir } from 'os';
import { clearWorktreeCache } from '../../lib/worktree-paths.js';
import { initInteropSession } from '../shared-state.js';

describe('shared-state workspace-marker path resolution', () => {
  let workspaceRoot: string;
  let subDir: string;

  beforeEach(() => {
    // Build fixture:
    //   A/              ← workspace root (contains .omq-workspace marker)
    //   A/sub/          ← child git repo (git init'd)
    workspaceRoot = mkdtempSync(join(tmpdir(), 'omq-workspace-'));
    subDir = join(workspaceRoot, 'sub');
    mkdirSync(subDir, { recursive: true });

    // Place the workspace marker at the workspace root.
    writeFileSync(join(workspaceRoot, '.omq-workspace'), '');

    // Initialize a real git repo inside sub/ so git-based resolution
    // (getWorktreeRoot) would otherwise anchor to subDir, not workspaceRoot.
    try {
      execSync('git init', { cwd: subDir, stdio: 'pipe' });
    } catch {
      // git may not be available in CI; the workspace-marker path still wins.
    }

    // Clear LRU caches so this test is not affected by earlier state.
    clearWorktreeCache();
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
    // Clear caches so other tests are not polluted by this fixture.
    clearWorktreeCache();
  });

  it('writes interop config to the workspace root .omq/, not the sub-repo .omq/', () => {
    // Call initInteropSession from the child sub-repo directory.
    initInteropSession('test-session', subDir);

    // Expected: file is at workspace root
    const expectedPath = join(workspaceRoot, '.omq', 'state', 'interop', 'config.json');
    // Regression: file would be at sub-repo root if the bug were present
    const wrongPath = join(subDir, '.omq', 'state', 'interop', 'config.json');

    expect(existsSync(expectedPath)).toBe(true);
    expect(existsSync(wrongPath)).toBe(false);
  });
});
