import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  readMissionBoardState,
  recordMissionAgentStart,
  recordMissionAgentStop,
  refreshMissionBoardState,
} from '../../hud/mission-board.js';
import { resolveSessionStatePaths } from '../../lib/worktree-paths.js';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'omq-mission-board-'));
  tempDirs.push(dir);
  mkdirSync(join(dir, '.omq', 'state'), { recursive: true });
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe('mission board state tracking', () => {
  it('records session-scoped agent starts and completions', () => {
    const cwd = makeTempDir();

    recordMissionAgentStart(cwd, {
      sessionId: 'sess-1234',
      agentId: 'agent-1',
      agentType: 'oh-my-qoder:executor',
      parentMode: 'ultrawork',
      taskDescription: 'Implement mission board renderer',
      at: '2026-03-09T07:00:00.000Z',
    });
    recordMissionAgentStop(cwd, {
      sessionId: 'sess-1234',
      agentId: 'agent-1',
      success: true,
      outputSummary: 'Rendered mission and timeline lines',
      at: '2026-03-09T07:05:00.000Z',
    });

    const state = readMissionBoardState(cwd);
    expect(state).not.toBeNull();
    expect(state?.missions).toHaveLength(1);

    const mission = state!.missions[0]!;
    expect(mission.source).toBe('session');
    expect(mission.name).toBe('ultrawork');
    expect(mission.status).toBe('done');
    expect(mission.taskCounts.completed).toBe(1);
    expect(mission.agents[0]?.status).toBe('done');
    expect(mission.agents[0]?.completedSummary).toContain('Rendered mission');
    expect(mission.timeline.map((entry) => entry.kind)).toEqual(['update', 'completion']);
  });

  it('syncs team missions from existing team state files and preserves session missions', () => {
    const cwd = makeTempDir();

    const mergeSessionId = 'sess-merge';
    recordMissionAgentStart(cwd, {
      sessionId: mergeSessionId,
      agentId: 'agent-9',
      agentType: 'oh-my-qoder:architect',
      parentMode: 'ralph',
      taskDescription: 'Review mission board architecture',
      at: '2026-03-09T07:00:00.000Z',
    }, mergeSessionId);

    const teamRoot = join(cwd, '.omq', 'state', 'team', 'demo');
    mkdirSync(join(teamRoot, 'tasks'), { recursive: true });
    mkdirSync(join(teamRoot, 'workers', 'worker-1'), { recursive: true });
    mkdirSync(join(teamRoot, 'workers', 'worker-2'), { recursive: true });
    mkdirSync(join(teamRoot, 'mailbox'), { recursive: true });

    writeFileSync(join(teamRoot, 'config.json'), JSON.stringify({
      name: 'demo',
      task: 'Implement mission board',
      created_at: '2026-03-09T06:55:00.000Z',
      worker_count: 2,
      workers: [
        { name: 'worker-1', role: 'executor', assigned_tasks: ['1'] },
        { name: 'worker-2', role: 'test-engineer', assigned_tasks: ['2'] },
      ],
    }, null, 2));

    writeFileSync(join(teamRoot, 'tasks', '1.json'), JSON.stringify({
      id: '1',
      subject: 'Implement renderer',
      status: 'in_progress',
      owner: 'worker-1',
    }, null, 2));
    writeFileSync(join(teamRoot, 'tasks', '2.json'), JSON.stringify({
      id: '2',
      subject: 'Add tests',
      status: 'completed',
      owner: 'worker-2',
      completed_at: '2026-03-09T07:03:00.000Z',
      result: 'Added mission board tests',
    }, null, 2));

    writeFileSync(join(teamRoot, 'workers', 'worker-1', 'status.json'), JSON.stringify({
      state: 'working',
      current_task_id: '1',
      updated_at: '2026-03-09T07:04:00.000Z',
      reason: 'implementing renderer',
    }, null, 2));
    writeFileSync(join(teamRoot, 'workers', 'worker-1', 'heartbeat.json'), JSON.stringify({
      last_turn_at: '2026-03-09T07:04:30.000Z',
      alive: true,
    }, null, 2));
    writeFileSync(join(teamRoot, 'workers', 'worker-2', 'status.json'), JSON.stringify({
      state: 'done',
      updated_at: '2026-03-09T07:03:30.000Z',
    }, null, 2));

    writeFileSync(join(teamRoot, 'events.jsonl'), [
      JSON.stringify({ type: 'task_completed', worker: 'worker-2', task_id: '2', created_at: '2026-03-09T07:03:00.000Z' }),
      JSON.stringify({ type: 'team_leader_nudge', worker: 'worker-1', reason: 'continue working', created_at: '2026-03-09T07:04:00.000Z' }),
    ].join('\n'));

    writeFileSync(join(teamRoot, 'mailbox', 'worker-1.json'), JSON.stringify({
      messages: [
        {
          message_id: 'm1',
          from_worker: 'leader-fixed',
          to_worker: 'worker-1',
          body: 'Take task 1',
          created_at: '2026-03-09T07:01:00.000Z',
        },
      ],
    }, null, 2));

    const state = refreshMissionBoardState(cwd, {
      enabled: true,
      maxMissions: 5,
      maxAgentsPerMission: 5,
      maxTimelineEvents: 5,
      persistCompletedForMinutes: 30,
    }, mergeSessionId);

    expect(state.missions).toHaveLength(2);

    const teamMission = state.missions.find((mission) => mission.source === 'team');
    expect(teamMission?.name).toBe('demo');
    expect(teamMission?.status).toBe('running');
    expect(teamMission?.taskCounts.inProgress).toBe(1);
    expect(teamMission?.agents[0]?.currentStep).toContain('implementing renderer');
    expect(teamMission?.agents[1]?.completedSummary).toContain('Added mission board tests');
    expect(teamMission?.timeline.some((entry) => entry.kind === 'handoff')).toBe(true);
    expect(teamMission?.timeline.some((entry) => entry.kind === 'completion')).toBe(true);

    // Use the path helper so this test survives session-scoping changes
    const paths = resolveSessionStatePaths('mission-state', mergeSessionId, cwd);
    const persisted = JSON.parse(readFileSync(paths.effectiveWrite, 'utf-8')) as {
      missions: Array<{ source: string }>;
    };
    expect(persisted.missions.some((mission) => mission.source === 'session')).toBe(true);
    expect(persisted.missions.some((mission) => mission.source === 'team')).toBe(true);
  });

  it('marks team missions blocked when failures or blocked workers are present', () => {
    const cwd = makeTempDir();
    const teamRoot = join(cwd, '.omq', 'state', 'team', 'blocked-demo');
    mkdirSync(join(teamRoot, 'tasks'), { recursive: true });
    mkdirSync(join(teamRoot, 'workers', 'worker-1'), { recursive: true });

    writeFileSync(join(teamRoot, 'config.json'), JSON.stringify({
      name: 'blocked-demo',
      task: 'Wait for approval',
      created_at: '2026-03-09T08:00:00.000Z',
      worker_count: 1,
      workers: [{ name: 'worker-1', role: 'executor', assigned_tasks: ['1'] }],
    }, null, 2));

    writeFileSync(join(teamRoot, 'tasks', '1.json'), JSON.stringify({
      id: '1',
      subject: 'Wait for approval',
      status: 'failed',
      owner: 'worker-1',
      error: 'approval required',
    }, null, 2));

    writeFileSync(join(teamRoot, 'workers', 'worker-1', 'status.json'), JSON.stringify({
      state: 'blocked',
      current_task_id: '1',
      reason: 'waiting for approval',
      updated_at: '2026-03-09T08:05:00.000Z',
    }, null, 2));

    const state = refreshMissionBoardState(cwd);
    const mission = state.missions.find((entry) => entry.source === 'team');

    expect(mission?.status).toBe('blocked');
    expect(mission?.agents[0]?.status).toBe('blocked');
    expect(mission?.agents[0]?.latestUpdate).toContain('waiting for approval');
  });

  it('session isolation: two sessions write interleaved but each reads back only its own data', () => {
    const cwd = makeTempDir();
    const sessionA = 'isolation-session-a';
    const sessionB = 'isolation-session-b';

    // Interleaved writes: A starts, B starts, A stops, B stops
    recordMissionAgentStart(cwd, {
      sessionId: sessionA,
      agentId: 'agent-a1',
      agentType: 'oh-my-qoder:executor',
      parentMode: 'ultrawork',
      taskDescription: 'Task for session A',
      at: '2026-03-09T10:00:00.000Z',
    }, sessionA);

    recordMissionAgentStart(cwd, {
      sessionId: sessionB,
      agentId: 'agent-b1',
      agentType: 'oh-my-qoder:architect',
      parentMode: 'ralph',
      taskDescription: 'Task for session B',
      at: '2026-03-09T10:01:00.000Z',
    }, sessionB);

    recordMissionAgentStop(cwd, {
      sessionId: sessionA,
      agentId: 'agent-a1',
      success: true,
      outputSummary: 'Session A completed successfully',
      at: '2026-03-09T10:02:00.000Z',
    }, sessionA);

    recordMissionAgentStop(cwd, {
      sessionId: sessionB,
      agentId: 'agent-b1',
      success: false,
      outputSummary: 'Session B encountered an error',
      at: '2026-03-09T10:03:00.000Z',
    }, sessionB);

    // Each session reads back only its own data — no cross-bleed
    const stateA = readMissionBoardState(cwd, sessionA);
    const stateB = readMissionBoardState(cwd, sessionB);

    expect(stateA).not.toBeNull();
    expect(stateB).not.toBeNull();

    // Session A should have exactly one mission from session A's agent
    const missionsA = stateA!.missions.filter((m) => m.source === 'session');
    expect(missionsA).toHaveLength(1);
    expect(missionsA[0]!.id).toContain(sessionA);
    expect(missionsA[0]!.agents[0]?.completedSummary).toContain('Session A completed');
    expect(missionsA[0]!.agents[0]?.status).toBe('done');

    // Session B should have exactly one mission from session B's agent
    const missionsB = stateB!.missions.filter((m) => m.source === 'session');
    expect(missionsB).toHaveLength(1);
    expect(missionsB[0]!.id).toContain(sessionB);
    expect(missionsB[0]!.agents[0]?.latestUpdate).toContain('Session B encountered');
    expect(missionsB[0]!.agents[0]?.status).toBe('blocked');

    // Cross-bleed check: session A's data has no reference to session B's agent
    expect(JSON.stringify(stateA)).not.toContain('agent-b1');
    expect(JSON.stringify(stateA)).not.toContain('Session B');

    // Cross-bleed check: session B's data has no reference to session A's agent
    expect(JSON.stringify(stateB)).not.toContain('agent-a1');
    expect(JSON.stringify(stateB)).not.toContain('Session A completed');
  });

  it('legacy data does not bleed into a fresh session read (no-fallback regression)', () => {
    const cwd = makeTempDir();
    const sessionZ = 'session-z';

    // Write a legacy mission-state (no sessionId) with a marker agent.
    const legacyStatePath = join(cwd, '.omq', 'state', 'mission-state.json');
    writeFileSync(legacyStatePath, JSON.stringify({
      updatedAt: '2026-01-01T00:00:00.000Z',
      missions: [{
        id: 'legacy-mission',
        source: 'session',
        name: 'legacy',
        objective: 'legacy objective',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        status: 'done',
        workerCount: 1,
        taskCounts: { total: 1, pending: 0, blocked: 0, inProgress: 0, completed: 1, failed: 0 },
        agents: [{ name: 'legacy-agent', role: 'executor', ownership: 'legacy-agent', status: 'done', currentStep: null, latestUpdate: null, completedSummary: null, updatedAt: '2026-01-01T00:00:00.000Z' }],
        timeline: [],
      }],
    }));

    // Write a session-Z mission-state with its own marker agent.
    recordMissionAgentStart(cwd, {
      sessionId: sessionZ,
      agentId: 'session-agent',
      agentType: 'oh-my-qoder:executor',
      parentMode: 'ralph',
      taskDescription: 'Task for session Z',
      at: '2026-05-01T10:00:00.000Z',
    }, sessionZ);

    // Read with session-Z: must return ONLY session-agent, NOT legacy-agent.
    const state = readMissionBoardState(cwd, sessionZ);

    expect(state).not.toBeNull();
    // ownership holds the raw agentId; name is a display string (e.g. 'executor:session-ag')
    const allOwnerships = state!.missions.flatMap((m) => m.agents.map((a) => a.ownership));
    expect(allOwnerships).toContain('session-agent');
    expect(allOwnerships).not.toContain('legacy-agent');
    expect(JSON.stringify(state)).not.toContain('legacy-agent');
    expect(JSON.stringify(state)).not.toContain('legacy-mission');
  });

  it('deduplicates duplicate team worker rows when refreshing mission board state', () => {
    const cwd = makeTempDir();
    const teamRoot = join(cwd, '.omq', 'state', 'team', 'dedupe-demo');
    mkdirSync(join(teamRoot, 'tasks'), { recursive: true });
    mkdirSync(join(teamRoot, 'workers', 'worker-1'), { recursive: true });

    writeFileSync(join(teamRoot, 'config.json'), JSON.stringify({
      name: 'dedupe-demo',
      task: 'dedupe workers',
      created_at: '2026-03-09T09:00:00.000Z',
      worker_count: 2,
      workers: [
        { name: 'worker-1', role: 'executor', assigned_tasks: ['1'] },
        { name: 'worker-1', role: 'executor', assigned_tasks: [], pane_id: '%7' },
      ],
    }, null, 2));

    writeFileSync(join(teamRoot, 'tasks', '1.json'), JSON.stringify({
      id: '1',
      subject: 'Fix duplication',
      status: 'in_progress',
      owner: 'worker-1',
    }, null, 2));

    writeFileSync(join(teamRoot, 'workers', 'worker-1', 'status.json'), JSON.stringify({
      state: 'working',
      current_task_id: '1',
      updated_at: '2026-03-09T09:05:00.000Z',
    }, null, 2));

    const state = refreshMissionBoardState(cwd);
    const mission = state.missions.find((entry) => entry.source === 'team' && entry.teamName === 'dedupe-demo');

    expect(mission?.agents).toHaveLength(1);
    expect(mission?.agents[0]?.name).toBe('worker-1');
    expect(mission?.workerCount).toBe(1);
  });
});
