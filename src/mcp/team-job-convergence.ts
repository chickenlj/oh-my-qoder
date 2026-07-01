import { existsSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { cleanupTeamWorktrees } from '../team/git-worktree.js';
import { validateTeamName } from '../team/team-name.js';
import { getOmqRoot } from '../lib/worktree-paths.js';

export interface OmqTeamJob {
  status: 'running' | 'completed' | 'failed' | 'timeout';
  result?: string;
  stderr?: string;
  startedAt: number;
  pid?: number;
  paneIds?: string[];
  leaderPaneId?: string;
  teamName?: string;
  cwd?: string;
  cleanedUpAt?: string;
  cleanupBlockedAt?: string;
  cleanupBlockedReason?: string;
}

export interface ScopedTeamStateCleanupResult {
  ok: boolean;
  message: string;
  preservedWorktrees?: number;
  reason?: string;
}

type ArtifactOutcome =
  | { kind: 'none' }
  | { kind: 'terminal'; status: 'completed' | 'failed'; raw: string }
  | { kind: 'parse-failed'; message: string; payload: string };

function readResultArtifact(omqJobsDir: string, jobId: string): ArtifactOutcome {
  const artifactPath = join(omqJobsDir, `${jobId}-result.json`);
  if (!existsSync(artifactPath)) return { kind: 'none' };

  let raw: string;
  try {
    raw = readFileSync(artifactPath, 'utf-8');
  } catch {
    return { kind: 'none' };
  }

  try {
    const parsed = JSON.parse(raw) as { status?: string };
    if (parsed?.status === 'completed' || parsed?.status === 'failed') {
      return { kind: 'terminal', status: parsed.status, raw };
    }
    return { kind: 'none' };
  } catch (error) {
    const message = `Failed to parse result artifact at ${artifactPath}: ${error instanceof Error ? error.message : String(error)}`;
    return {
      kind: 'parse-failed',
      message,
      payload: JSON.stringify({
        status: 'failed',
        error: {
          code: 'RESULT_ARTIFACT_PARSE_FAILED',
          message,
        },
      }),
    };
  }
}

export function convergeJobWithResultArtifact(
  job: OmqTeamJob,
  jobId: string,
  omqJobsDir: string,
): { job: OmqTeamJob; changed: boolean } {
  const artifact = readResultArtifact(omqJobsDir, jobId);
  if (artifact.kind === 'none') return { job, changed: false };

  if (artifact.kind === 'terminal') {
    const changed = job.status !== artifact.status || job.result !== artifact.raw;
    return {
      job: changed
        ? {
          ...job,
          status: artifact.status,
          result: artifact.raw,
        }
        : job,
      changed,
    };
  }

  const changed = job.status !== 'failed' || job.result !== artifact.payload || job.stderr !== artifact.message;
  return {
    job: changed
      ? {
        ...job,
        status: 'failed',
        result: artifact.payload,
        stderr: artifact.message,
      }
      : job,
    changed,
  };
}

export function isJobTerminal(job: OmqTeamJob): boolean {
  return job.status === 'completed' || job.status === 'failed' || job.status === 'timeout';
}

export function clearScopedTeamState(job: Pick<OmqTeamJob, 'cwd' | 'teamName'>): ScopedTeamStateCleanupResult {
  if (!job.cwd || !job.teamName) {
    return { ok: true, message: 'team state cleanup skipped (missing job cwd/teamName).' };
  }

  try {
    validateTeamName(job.teamName);
  } catch (error) {
    return {
      ok: true,
      message: `team state cleanup skipped (invalid teamName): ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const stateDir = join(getOmqRoot(job.cwd), 'state', 'team', job.teamName);
  let worktreeMessage = 'worktree cleanup skipped.';
  try {
    const cleanup = cleanupTeamWorktrees(job.teamName, job.cwd);
    worktreeMessage = `worktree cleanup attempted for ${job.teamName}.`;
    if (cleanup.preserved.length > 0) {
      return {
        ok: false,
        message: `${worktreeMessage} preserved ${cleanup.preserved.length} worktree(s); team state retained at ${stateDir}.`,
        preservedWorktrees: cleanup.preserved.length,
        reason: `worktrees_preserved:${cleanup.preserved.length}`,
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      message: `worktree cleanup skipped: ${message}; team state retained at ${stateDir}.`,
      reason: `worktree_cleanup_failed:${message}`,
    };
  }

  try {
    if (!existsSync(stateDir)) {
      return { ok: true, message: `${worktreeMessage} team state dir not found at ${stateDir}.` };
    }
    rmSync(stateDir, { recursive: true, force: true });
    return { ok: true, message: `${worktreeMessage} team state dir removed at ${stateDir}.` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      message: `${worktreeMessage} team state cleanup failed at ${stateDir}: ${message}`,
      reason: `team_state_cleanup_failed:${message}`,
    };
  }
}
