/**
 * Regression: team runtime writes must not false-positive "Path traversal
 * detected" in a multi-repo .omq-workspace layout.
 *
 * In that layout the shared .omq root lives at the workspace anchor (the parent
 * of each sub-repo), so paths built with getOmqRoot(subRepo) resolve ABOVE the
 * sub-repo. Validation that used the sub-repo as the allowed base threw and
 * dropped team metadata / audit / usage / restart / worktree state.
 *
 * Setup mirrors the reviewer's reproduction: parent/.omq-workspace + parent/api.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { clearWorktreeCache } from '../../lib/worktree-paths.js';
import { logAuditEvent, readAuditLog } from '../audit-log.js';
import type { AuditEvent } from '../audit-log.js';
import { recordTaskUsage } from '../usage-tracker.js';
import type { TaskUsageRecord } from '../usage-tracker.js';
import { recordRestart, readRestartState } from '../worker-restart.js';
import {
  createWorkerWorktree,
  listTeamWorktrees,
  cleanupTeamWorktrees,
  installWorktreeRootAgents,
  restoreWorktreeRootAgents,
} from '../git-worktree.js';

describe('multi-repo workspace team writes', () => {
  let parent: string;
  let api: string;
  const teamName = 'multi-repo-team';

  beforeEach(() => {
    clearWorktreeCache();
    // Non-git parent holding the workspace marker, with a git sub-repo inside.
    parent = mkdtempSync(join(tmpdir(), 'omq-multirepo-team-'));
    writeFileSync(join(parent, '.omq-workspace'), '{}');
    api = join(parent, 'api');
    mkdirSync(api, { recursive: true });
    execFileSync('git', ['init'], { cwd: api, stdio: 'pipe' });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: api, stdio: 'pipe' });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: api, stdio: 'pipe' });
    writeFileSync(join(api, 'README.md'), '# api\n');
    execFileSync('git', ['add', '.'], { cwd: api, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: api, stdio: 'pipe' });
    clearWorktreeCache();
  });

  afterEach(() => {
    try {
      cleanupTeamWorktrees(teamName, api);
    } catch { /* ignore */ }
    clearWorktreeCache();
    if (parent) rmSync(parent, { recursive: true, force: true });
  });

  const sharedOmq = () => join(parent, '.omq');

  it('audit log writes land under the shared .omq, not the sub-repo', () => {
    const event: AuditEvent = {
      timestamp: new Date().toISOString(),
      eventType: 'bridge_start',
      teamName,
      workerName: 'worker1',
    };

    expect(() => logAuditEvent(api, event)).not.toThrow();

    const logPath = join(sharedOmq(), 'logs', `team-bridge-${teamName}.jsonl`);
    expect(existsSync(logPath)).toBe(true);
    // Must NOT have written into the sub-repo's local .omq.
    expect(existsSync(join(api, '.omq', 'logs', `team-bridge-${teamName}.jsonl`))).toBe(false);
    expect(readAuditLog(api, teamName)).toHaveLength(1);
  });

  it('usage records write under the shared .omq without traversal error', () => {
    const record: TaskUsageRecord = {
      taskId: 'task1',
      workerName: 'worker1',
      provider: 'codex',
      model: 'gpt',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      wallClockMs: 10,
      promptChars: 5,
      responseChars: 7,
    };

    expect(() => recordTaskUsage(api, teamName, record)).not.toThrow();

    const logPath = join(sharedOmq(), 'logs', `team-usage-${teamName}.jsonl`);
    expect(existsSync(logPath)).toBe(true);
  });

  it('restart state writes under the shared .omq without traversal error', () => {
    expect(() => recordRestart(api, teamName, 'worker1')).not.toThrow();

    const statePath = join(sharedOmq(), 'state', 'team-bridge', teamName, 'worker1.restart.json');
    expect(existsSync(statePath)).toBe(true);

    const state = readRestartState(api, teamName, 'worker1');
    expect(state?.restartCount).toBe(1);
  });

  it('worktree creation + metadata + AGENTS overlay work from the sub-repo', () => {
    let info!: ReturnType<typeof createWorkerWorktree>;
    expect(() => {
      info = createWorkerWorktree(teamName, 'worker1', api);
    }).not.toThrow();

    // Worktree and metadata live under the shared workspace .omq, above the repo.
    expect(info.path.startsWith(join(sharedOmq(), 'team'))).toBe(true);
    expect(existsSync(info.path)).toBe(true);
    expect(existsSync(join(sharedOmq(), 'state', 'team', teamName, 'worktrees.json'))).toBe(true);
    expect(listTeamWorktrees(teamName, api).map(w => w.workerName)).toContain('worker1');

    expect(() =>
      installWorktreeRootAgents(teamName, 'worker1', api, info.path, '# overlay\n'),
    ).not.toThrow();
    expect(() => restoreWorktreeRootAgents(teamName, 'worker1', api, info.path)).not.toThrow();
  });
});
