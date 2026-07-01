import { describe, expect, it } from 'vitest';
import {
  buildLegacyTeamDeprecationHint,
  resolveTeamApiCliCommand,
} from '../api-interop.js';

describe('team api command dialect resolution', () => {
  it('defaults to omq team api', () => {
    expect(resolveTeamApiCliCommand({} as NodeJS.ProcessEnv)).toBe('omq team api');
  });

  it('uses omx team api when running in OMX worker context', () => {
    expect(resolveTeamApiCliCommand({
      OMX_TEAM_WORKER: 'demo-team/worker-1',
    } as NodeJS.ProcessEnv)).toBe('omx team api');

    expect(resolveTeamApiCliCommand({
      OMX_TEAM_STATE_ROOT: '/tmp/project/.omx/state',
    } as NodeJS.ProcessEnv)).toBe('omx team api');
  });

  it('prefers omq team api when both contexts are present', () => {
    expect(resolveTeamApiCliCommand({
      OMQ_TEAM_WORKER: 'demo-team/worker-1',
      OMX_TEAM_WORKER: 'demo-team/worker-2',
    } as NodeJS.ProcessEnv)).toBe('omq team api');
  });

  it('builds legacy deprecation hint with omx command in OMX context', () => {
    const hint = buildLegacyTeamDeprecationHint(
      'team_claim_task',
      { team_name: 'demo', task_id: '1', worker: 'worker-1' },
      { OMX_TEAM_WORKER: 'demo/worker-1' } as NodeJS.ProcessEnv,
    );
    expect(hint).toContain('Use CLI interop: omx team api claim-task');
  });
});
