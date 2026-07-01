/**
 * State Management MCP Tools
 *
 * Provides tools for reading, writing, and managing mode state files.
 * All paths are validated to stay within the worktree boundary.
 */

import { z } from 'zod';
import { existsSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  validateWorkingDirectory,
  resolveSessionStatePath,
  ensureSessionStateDir,
  listSessionIds,
  validateSessionId,
  getOmqRoot,
  getProcessSessionId,
} from '../lib/worktree-paths.js';
import { resolveSessionId } from '../lib/session-id.js';
import { atomicWriteJsonSync } from '../lib/atomic-write.js';
import { validatePayload } from '../lib/payload-limits.js';
import {
  canClearStateForSession,
  findCompletedSessionStateFiles,
  findSessionOwnedStateFiles,
} from '../lib/mode-state-io.js';
import {
  isModeActive,
  getActiveModes,
  getAllModeStatuses,
  clearModeState,
  getStateFilePath,
  MODE_CONFIGS,
  getActiveSessionsForMode,
  type ExecutionMode
} from '../hooks/mode-registry/index.js';
import { ToolDefinition } from './types.js';

// Canonical execution modes from mode-registry (deep-interview and self-improve
// are first-class modes with dedicated MODE_CONFIGS entries; ralplan remains an
// extra state-only mode handled via the registry-fallback path).
const EXECUTION_MODES: [string, ...string[]] = [
  'autopilot', 'autoresearch', 'team', 'ralph', 'ultrawork', 'ultraqa', 'deep-interview', 'self-improve'
];

// Extended type for state tools - includes state-bearing modes outside mode-registry
const STATE_TOOL_MODES: [string, ...string[]] = [
  ...EXECUTION_MODES,
  'ralplan',
  'omq-teams',
  'skill-active'
];
const EXTRA_STATE_ONLY_MODES = ['ralplan', 'omq-teams', 'skill-active'] as const;
type StateToolMode = typeof STATE_TOOL_MODES[number];
const CANCEL_SIGNAL_TTL_MS = 30_000;
const OWNER_SESSION_FALLBACK_MODES = new Set<StateToolMode>(['ralph']);

function readTeamNamesFromStateFile(statePath: string): string[] {
  if (!existsSync(statePath)) return [];

  try {
    const raw = JSON.parse(readFileSync(statePath, 'utf-8')) as Record<string, unknown>;
    const teamName = typeof raw.team_name === 'string'
      ? raw.team_name.trim()
      : typeof raw.teamName === 'string'
        ? raw.teamName.trim()
        : '';
    return teamName ? [teamName] : [];
  } catch {
    return [];
  }
}

function pruneMissionBoardTeams(root: string, teamNames?: string[]): number {
  const missionStatePath = join(getOmqRoot(root), 'state', 'mission-state.json');
  if (!existsSync(missionStatePath)) return 0;

  try {
    const parsed = JSON.parse(readFileSync(missionStatePath, 'utf-8')) as {
      updatedAt?: string;
      missions?: Array<Record<string, unknown>>;
    };
    if (!Array.isArray(parsed.missions)) return 0;

    const shouldRemoveAll = teamNames == null;
    const teamNameSet = new Set(teamNames ?? []);
    const remainingMissions = parsed.missions.filter((mission) => {
      if (mission.source !== 'team') return true;
      if (shouldRemoveAll) return false;
      const missionTeamName = typeof mission.teamName === 'string'
        ? mission.teamName.trim()
        : typeof mission.name === 'string'
          ? mission.name.trim()
          : '';
      return !missionTeamName || !teamNameSet.has(missionTeamName);
    });

    const removed = parsed.missions.length - remainingMissions.length;
    if (removed > 0) {
      writeFileSync(missionStatePath, JSON.stringify({
        ...parsed,
        updatedAt: new Date().toISOString(),
        missions: remainingMissions,
      }, null, 2));
    }

    return removed;
  } catch {
    return 0;
  }
}

function cleanupTeamRuntimeState(root: string, teamNames?: string[]): number {
  const teamStateRoot = join(getOmqRoot(root), 'state', 'team');
  if (!existsSync(teamStateRoot)) return 0;

  const shouldRemoveAll = teamNames == null;
  let removed = 0;

  if (shouldRemoveAll) {
    try {
      rmSync(teamStateRoot, { recursive: true, force: true });
      return 1;
    } catch {
      return 0;
    }
  }

  for (const teamName of teamNames ?? []) {
    if (!teamName) continue;
    try {
      rmSync(join(teamStateRoot, teamName), { recursive: true, force: true });
      removed += 1;
    } catch {
      // best effort
    }
  }

  return removed;
}

/**
 * Get the state file path for any mode (including swarm and ralplan).
 *
 * - For registry modes (8 modes): uses getStateFilePath from mode-registry
 * - For ralplan (not in registry): uses resolveSessionStatePath directly
 */
function getStatePath(mode: StateToolMode, root: string, sessionId?: string): string {
  const sid = sessionId || getProcessSessionId();
  if (MODE_CONFIGS[mode as ExecutionMode]) {
    return getStateFilePath(root, mode as ExecutionMode, sid);
  }
  return resolveSessionStatePath(mode, sid, root);
}

function clearSessionOwnedStateCandidates(
  mode: StateToolMode,
  root: string,
  sessionId: string,
): { cleared: number; hadFailure: boolean; paths: string[] } {
  let cleared = 0;
  let hadFailure = false;
  const paths = findSessionOwnedStateFiles(mode, sessionId, root);

  for (const statePath of paths) {
    try {
      unlinkSync(statePath);
      cleared++;
    } catch {
      hadFailure = true;
    }
  }

  return { cleared, hadFailure, paths };
}

function clearCompletedSessionStateCandidates(
  mode: StateToolMode,
  root: string,
  requesterSessionId?: string,
): { cleared: number; hadFailure: boolean; paths: string[] } {
  let cleared = 0;
  let hadFailure = false;
  const paths = findCompletedSessionStateFiles(mode, root, requesterSessionId);

  for (const statePath of paths) {
    try {
      unlinkSync(statePath);
      cleared++;
    } catch {
      hadFailure = true;
    }
  }

  return { cleared, hadFailure, paths };
}


function getStateClearCheckedPaths(
  mode: StateToolMode,
  root: string,
  sessionId?: string,
): string[] {
  const paths = new Set<string>();
  const sid = sessionId || getProcessSessionId();

  paths.add(getStatePath(mode, root, sid));

  const sessionIds = [sid, ...listSessionIds(root)];
  for (const s of new Set(sessionIds)) {
    paths.add(MODE_CONFIGS[mode as ExecutionMode]
      ? getStateFilePath(root, mode as ExecutionMode, s)
      : resolveSessionStatePath(mode, s, root));
  }

  return [...paths];
}

function formatStateClearNoopMessage(
  mode: StateToolMode,
  root: string,
  sessionId?: string,
): string {
  const scope = sessionId ? ` in session: ${sessionId}` : '';
  const checkedPaths = getStateClearCheckedPaths(mode, root, sessionId);
  const checked = checkedPaths.length > 0
    ? `\n- Checked paths:\n${checkedPaths.map((statePath) => `  - ${statePath}`).join('\n')}`
    : '';

  return `No state found to clear for mode: ${mode}${scope}${checked}`;
}

function getModeRuntimeArtifactNames(mode: StateToolMode): string[] {
  return [
    `${mode}-stop-breaker.json`,
    `${mode}-last-steer-at`,
    `${mode}-continue-steer.lock`,
  ];
}

function clearModeRuntimeArtifacts(
  mode: StateToolMode,
  root: string,
  sessionId?: string,
): { cleared: number; hadFailure: boolean } {
  let cleared = 0;
  let hadFailure = false;
  const stateRoot = join(getOmqRoot(root), 'state');
  const candidateDirs = new Set<string>([stateRoot]);

  if (sessionId) {
    candidateDirs.add(join(stateRoot, 'sessions', sessionId));
  } else {
    for (const sid of listSessionIds(root)) {
      candidateDirs.add(join(stateRoot, 'sessions', sid));
    }
  }

  for (const dir of candidateDirs) {
    for (const artifactName of getModeRuntimeArtifactNames(mode)) {
      const artifactPath = join(dir, artifactName);
      if (!existsSync(artifactPath)) {
        continue;
      }

      try {
        unlinkSync(artifactPath);
        cleared++;
      } catch {
        hadFailure = true;
      }
    }
  }

  return { cleared, hadFailure };
}

function writeSessionCancelSignal(
  root: string,
  sessionId: string,
  mode: StateToolMode,
): void {
  const now = Date.now();
  const cancelSignalPath = resolveSessionStatePath('cancel-signal', sessionId, root);
  atomicWriteJsonSync(cancelSignalPath, {
    active: true,
    requested_at: new Date(now).toISOString(),
    expires_at: new Date(now + CANCEL_SIGNAL_TTL_MS).toISOString(),
    mode,
    source: 'state_clear'
  });
}

function isSessionModeActive(
  mode: StateToolMode,
  root: string,
  sessionId: string,
): boolean {
  if (MODE_CONFIGS[mode as ExecutionMode]) {
    return isModeActive(mode as ExecutionMode, root, sessionId);
  }

  const statePath = resolveSessionStatePath(mode, sessionId, root);
  if (!existsSync(statePath)) {
    return false;
  }

  try {
    const state = JSON.parse(readFileSync(statePath, 'utf-8')) as Record<string, unknown>;
    return state.active === true;
  } catch {
    return false;
  }
}

function findSingleOwningSessionForMode(
  mode: StateToolMode,
  root: string,
  requesterSessionId: string,
): string | undefined {
  const owningSessions = listSessionIds(root).filter((sid) => (
    sid !== requesterSessionId && isSessionModeActive(mode, root, sid)
  ));

  return owningSessions.length === 1 ? owningSessions[0] : undefined;
}

// ============================================================================
// state_read - Read state for a mode
// ============================================================================

export const stateReadTool: ToolDefinition<{
  mode: z.ZodEnum<typeof STATE_TOOL_MODES>;
  workingDirectory: z.ZodOptional<z.ZodString>;
  session_id: z.ZodOptional<z.ZodString>;
}> = {
  name: 'state_read',
  description: 'Read the current state for a specific mode (ralph, ultrawork, autopilot, etc.). Returns the JSON state data or indicates if no state exists.',
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  schema: {
    mode: z.enum(STATE_TOOL_MODES).describe('The mode to read state for'),
    workingDirectory: z.string().optional().describe('Working directory (defaults to cwd)'),
    session_id: z.string().optional().describe('Session ID for session-scoped state isolation. Auto-resolved from OMQ_SESSION_ID when omitted.'),
  },
  handler: async (args) => {
    const { mode, workingDirectory, session_id } = args;

    try {
      const root = validateWorkingDirectory(workingDirectory);
      const sessionId = (session_id as string | undefined) ?? resolveSessionId({ context: 'cli' });
      validateSessionId(sessionId);

      const statePath = getStatePath(mode, root, sessionId);

      if (!existsSync(statePath)) {
        const completedSessionPaths = findCompletedSessionStateFiles(mode, root, sessionId);
        if (completedSessionPaths.length > 0) {
          const orphanList = completedSessionPaths
            .map((orphanPath) => {
              const sessionMarker = `${join('state', 'sessions')}/`;
              const markerIndex = orphanPath.indexOf(sessionMarker);
              if (markerIndex === -1) return `- ${orphanPath}`;
              const rest = orphanPath.slice(markerIndex + sessionMarker.length);
              const orphanSessionId = rest.split(/[\\/]/)[0] || 'unknown';
              return `- session: ${orphanSessionId}\n  path: ${orphanPath}`;
            })
            .join('\n');
          return {
            content: [{
              type: 'text' as const,
              text: `No state found for mode: ${mode} in session: ${sessionId}\nExpected path: ${statePath}\n\nDiscovered ${completedSessionPaths.length} completed-session orphan state file${completedSessionPaths.length === 1 ? '' : 's'} for this mode:\n${orphanList}\n\nRun state_clear(mode="${mode}", session_id="${sessionId}") to clear the current session plus these completed-session orphan files.`
            }]
          };
        }

        return {
          content: [{
            type: 'text' as const,
            text: `No state found for mode: ${mode} in session: ${sessionId}\nExpected path: ${statePath}`
          }]
        };
      }

      const content = readFileSync(statePath, 'utf-8');
      const state = JSON.parse(content);

      return {
        content: [{
          type: 'text' as const,
          text: `## State for ${mode} (session: ${sessionId})\n\nPath: ${statePath}\n\n\`\`\`json\n${JSON.stringify(state, null, 2)}\n\`\`\``
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text' as const,
          text: `Error reading state for ${mode}: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }
};

// ============================================================================
// state_write - Write state for a mode
// ============================================================================

export const stateWriteTool: ToolDefinition<{
  mode: z.ZodEnum<typeof STATE_TOOL_MODES>;
  active: z.ZodOptional<z.ZodBoolean>;
  iteration: z.ZodOptional<z.ZodNumber>;
  max_iterations: z.ZodOptional<z.ZodNumber>;
  current_phase: z.ZodOptional<z.ZodString>;
  task_description: z.ZodOptional<z.ZodString>;
  plan_path: z.ZodOptional<z.ZodString>;
  started_at: z.ZodOptional<z.ZodString>;
  completed_at: z.ZodOptional<z.ZodString>;
  error: z.ZodOptional<z.ZodString>;
  state: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  workingDirectory: z.ZodOptional<z.ZodString>;
  session_id: z.ZodOptional<z.ZodString>;
}> = {
  name: 'state_write',
  description: 'Write/update state for a specific mode. Creates the state file and directories if they do not exist. Common fields (active, iteration, phase, etc.) can be set directly as parameters. Additional custom fields can be passed via the optional `state` parameter. Note: swarm uses SQLite and cannot be written via this tool.',
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  schema: {
    mode: z.enum(STATE_TOOL_MODES).describe('The mode to write state for'),
    active: z.boolean().optional().describe('Whether the mode is currently active'),
    iteration: z.number().optional().describe('Current iteration number'),
    max_iterations: z.number().optional().describe('Maximum iterations allowed'),
    current_phase: z.string().max(200).optional().describe('Current execution phase'),
    task_description: z.string().max(2000).optional().describe('Description of the task being executed'),
    plan_path: z.string().max(500).optional().describe('Path to the plan file'),
    started_at: z.string().max(100).optional().describe('ISO timestamp when the mode started'),
    completed_at: z.string().max(100).optional().describe('ISO timestamp when the mode completed'),
    error: z.string().max(2000).optional().describe('Error message if the mode failed'),
    state: z.record(z.string(), z.unknown()).optional().describe('Additional custom state fields (merged with explicit parameters)'),
    workingDirectory: z.string().optional().describe('Working directory (defaults to cwd)'),
    session_id: z.string().optional().describe('Session ID for session-scoped state isolation. Auto-resolved from OMQ_SESSION_ID when omitted.'),
  },
  handler: async (args) => {
    const {
      mode,
      active,
      iteration,
      max_iterations,
      current_phase,
      task_description,
      plan_path,
      started_at,
      completed_at,
      error,
      state,
      workingDirectory,
      session_id
    } = args;

    try {
      const root = validateWorkingDirectory(workingDirectory);
      const sessionId = (session_id as string | undefined) ?? resolveSessionId({ context: 'cli' });
      validateSessionId(sessionId);
      ensureSessionStateDir(sessionId, root);

      if (state) {
        const validation = validatePayload(state);
        if (!validation.valid) {
          return {
            content: [{
              type: 'text' as const,
              text: `Error: state payload rejected — ${validation.error}`
            }],
            isError: true
          };
        }
      }

      const statePath = getStatePath(mode, root, sessionId);

      const builtState: Record<string, unknown> = {};
      if (active !== undefined) builtState.active = active;
      if (iteration !== undefined) builtState.iteration = iteration;
      if (max_iterations !== undefined) builtState.max_iterations = max_iterations;
      if (current_phase !== undefined) builtState.current_phase = current_phase;
      if (task_description !== undefined) builtState.task_description = task_description;
      if (plan_path !== undefined) builtState.plan_path = plan_path;
      if (started_at !== undefined) builtState.started_at = started_at;
      if (completed_at !== undefined) builtState.completed_at = completed_at;
      if (error !== undefined) builtState.error = error;

      if (state) {
        for (const [key, value] of Object.entries(state)) {
          if (!(key in builtState)) {
            builtState[key] = value;
          }
        }
      }

      const stateWithMeta = {
        ...builtState,
        _meta: {
          mode,
          sessionId,
          updatedAt: new Date().toISOString(),
          updatedBy: 'state_write_tool'
        }
      };

      atomicWriteJsonSync(statePath, stateWithMeta);

      return {
        content: [{
          type: 'text' as const,
          text: `Successfully wrote state for ${mode} (session: ${sessionId})\nPath: ${statePath}\n\n\`\`\`json\n${JSON.stringify(stateWithMeta, null, 2)}\n\`\`\``
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text' as const,
          text: `Error writing state for ${mode}: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }
};

// ============================================================================
// state_clear - Clear state for a mode
// ============================================================================

export const stateClearTool: ToolDefinition<{
  mode: z.ZodEnum<typeof STATE_TOOL_MODES>;
  workingDirectory: z.ZodOptional<z.ZodString>;
  session_id: z.ZodOptional<z.ZodString>;
}> = {
  name: 'state_clear',
  description: 'Clear/delete state for a specific mode. Removes the state file and any associated marker files.',
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  schema: {
    mode: z.enum(STATE_TOOL_MODES).describe('The mode to clear state for'),
    workingDirectory: z.string().optional().describe('Working directory (defaults to cwd)'),
    session_id: z.string().optional().describe('Session ID for session-scoped state isolation. Auto-resolved from OMQ_SESSION_ID when omitted.'),
  },
  handler: async (args) => {
    const { mode, workingDirectory, session_id } = args;

    try {
      const root = validateWorkingDirectory(workingDirectory);
      const sessionId = (session_id as string | undefined) ?? resolveSessionId({ context: 'cli' });
      validateSessionId(sessionId);
      const cleanedTeamNames = new Set<string>();

      const collectTeamNamesForCleanup = (statePath: string): void => {
        if (mode !== 'team') return;
        for (const teamName of readTeamNamesFromStateFile(statePath)) {
          cleanedTeamNames.add(teamName);
        }
      };

      const requestedSessionOwnedPaths = findSessionOwnedStateFiles(mode, sessionId, root);
      for (const teamStatePath of findSessionOwnedStateFiles('team', sessionId, root)) {
        collectTeamNamesForCleanup(teamStatePath);
      }
      if (mode === 'team') {
        for (const teamStatePath of findCompletedSessionStateFiles('team', root, sessionId)) {
          collectTeamNamesForCleanup(teamStatePath);
        }
      }
      const completedSessionCleanup = clearCompletedSessionStateCandidates(mode, root, sessionId);
      const runtimeCleanup = clearModeRuntimeArtifacts(mode, root, sessionId);
      writeSessionCancelSignal(root, sessionId, mode);

      if (MODE_CONFIGS[mode as ExecutionMode]) {
        const success = clearModeState(mode as ExecutionMode, root, sessionId);
        const sessionCleanup = clearSessionOwnedStateCandidates(mode, root, sessionId);
        let ownerSessionId: string | undefined;
        let ownerSessionCleanup = { cleared: 0, hadFailure: false, paths: [] as string[] };

        if (
          OWNER_SESSION_FALLBACK_MODES.has(mode) &&
          requestedSessionOwnedPaths.length === 0 &&
          completedSessionCleanup.cleared === 0 &&
          sessionCleanup.cleared === 0
        ) {
          ownerSessionId = findSingleOwningSessionForMode(mode, root, sessionId);
          if (ownerSessionId) {
            if (mode === 'team') {
              for (const teamStatePath of findSessionOwnedStateFiles('team', ownerSessionId, root)) {
                collectTeamNamesForCleanup(teamStatePath);
              }
            }
            writeSessionCancelSignal(root, ownerSessionId, mode);
            const ownerRuntimeCleanup = clearModeRuntimeArtifacts(mode, root, ownerSessionId);
            runtimeCleanup.cleared += ownerRuntimeCleanup.cleared;
            runtimeCleanup.hadFailure ||= ownerRuntimeCleanup.hadFailure;
            clearModeState(mode as ExecutionMode, root, ownerSessionId);
            ownerSessionCleanup = clearSessionOwnedStateCandidates(mode, root, ownerSessionId);
          }
        }

        const noteParts: string[] = [];
        if (completedSessionCleanup.cleared > 0) {
          noteParts.push(`removed ${completedSessionCleanup.cleared} completed-session orphan file${completedSessionCleanup.cleared === 1 ? '' : 's'}`);
        }
        if (sessionCleanup.cleared > 0) {
          noteParts.push(`removed ${sessionCleanup.cleared} recovered session file${sessionCleanup.cleared === 1 ? '' : 's'}`);
        }
        if (runtimeCleanup.cleared > 0) {
          noteParts.push(`removed ${runtimeCleanup.cleared} runtime artifact${runtimeCleanup.cleared === 1 ? '' : 's'}`);
        }
        if (ownerSessionId) {
          noteParts.push(`cleared owning session: ${ownerSessionId}`);
        }
        const note = noteParts.length > 0 ? ` (${noteParts.join(', ')})` : '';
        const runtimeCleanupNote = (() => {
          if (mode !== 'team') return '';
          const teamNames = [...cleanedTeamNames];
          const removedRoots = cleanupTeamRuntimeState(root, teamNames);
          const prunedMissions = pruneMissionBoardTeams(root, teamNames);
          const details: string[] = [];
          if (removedRoots > 0) details.push(`removed ${removedRoots} team runtime root(s)`);
          if (prunedMissions > 0) details.push(`pruned ${prunedMissions} HUD mission entry(ies)`);
          return details.length > 0 ? ` (${details.join(', ')})` : '';
        })();
        const clearedStateOrArtifacts = requestedSessionOwnedPaths.length +
          completedSessionCleanup.cleared +
          sessionCleanup.cleared +
          ownerSessionCleanup.cleared +
          runtimeCleanup.cleared;
        if (!ownerSessionId && clearedStateOrArtifacts === 0 && success &&
          !sessionCleanup.hadFailure &&
          !completedSessionCleanup.hadFailure &&
          !ownerSessionCleanup.hadFailure &&
          !runtimeCleanup.hadFailure
        ) {
          return {
            content: [{
              type: 'text' as const,
              text: formatStateClearNoopMessage(mode, root, sessionId)
            }]
          };
        }
        if (
          success &&
          !sessionCleanup.hadFailure &&
          !completedSessionCleanup.hadFailure &&
          !ownerSessionCleanup.hadFailure &&
          !runtimeCleanup.hadFailure
        ) {
          return {
            content: [{
              type: 'text' as const,
              text: `Successfully cleared state for mode: ${mode} in session: ${sessionId}${note}${runtimeCleanupNote}`
            }]
          };
        } else {
          return {
            content: [{
              type: 'text' as const,
              text: `Warning: Some files could not be removed for mode: ${mode} in session: ${sessionId}${note}${runtimeCleanupNote}`
            }]
          };
        }
      }

      // Non-registry modes (e.g., ralplan)
      const sessionCleanup = clearSessionOwnedStateCandidates(mode, root, sessionId);
      let ownerSessionId: string | undefined;
      let ownerSessionCleanup = { cleared: 0, hadFailure: false, paths: [] as string[] };

      if (
        OWNER_SESSION_FALLBACK_MODES.has(mode) &&
        requestedSessionOwnedPaths.length === 0 &&
        completedSessionCleanup.cleared === 0 &&
        sessionCleanup.cleared === 0
      ) {
        ownerSessionId = findSingleOwningSessionForMode(mode, root, sessionId);
        if (ownerSessionId) {
          if (mode === 'team') {
            for (const teamStatePath of findSessionOwnedStateFiles('team', ownerSessionId, root)) {
              collectTeamNamesForCleanup(teamStatePath);
            }
          }
          writeSessionCancelSignal(root, ownerSessionId, mode);
          const ownerRuntimeCleanup = clearModeRuntimeArtifacts(mode, root, ownerSessionId);
          runtimeCleanup.cleared += ownerRuntimeCleanup.cleared;
          runtimeCleanup.hadFailure ||= ownerRuntimeCleanup.hadFailure;
          ownerSessionCleanup = clearSessionOwnedStateCandidates(mode, root, ownerSessionId);
        }
      }

      const noteParts: string[] = [];
      if (completedSessionCleanup.cleared > 0) {
        noteParts.push(`removed ${completedSessionCleanup.cleared} completed-session orphan file${completedSessionCleanup.cleared === 1 ? '' : 's'}`);
      }
      if (sessionCleanup.cleared > 0) {
        noteParts.push(`removed ${sessionCleanup.cleared} recovered session file${sessionCleanup.cleared === 1 ? '' : 's'}`);
      }
      if (runtimeCleanup.cleared > 0) {
        noteParts.push(`removed ${runtimeCleanup.cleared} runtime artifact${runtimeCleanup.cleared === 1 ? '' : 's'}`);
      }
      if (ownerSessionId) {
        noteParts.push(`cleared owning session: ${ownerSessionId}`);
      }
      const note = noteParts.length > 0 ? ` (${noteParts.join(', ')})` : '';
      const runtimeCleanupNote = (() => {
        if (mode !== 'team') return '';
        const teamNames = [...cleanedTeamNames];
        const removedRoots = cleanupTeamRuntimeState(root, teamNames);
        const prunedMissions = pruneMissionBoardTeams(root, teamNames);
        const details: string[] = [];
        if (removedRoots > 0) details.push(`removed ${removedRoots} team runtime root(s)`);
        if (prunedMissions > 0) details.push(`pruned ${prunedMissions} HUD mission entry(ies)`);
        return details.length > 0 ? ` (${details.join(', ')})` : '';
      })();
      const clearedStateOrArtifacts = requestedSessionOwnedPaths.length +
        completedSessionCleanup.cleared +
        sessionCleanup.cleared +
        ownerSessionCleanup.cleared +
        runtimeCleanup.cleared;
      const hadFailure = sessionCleanup.hadFailure ||
        completedSessionCleanup.hadFailure || ownerSessionCleanup.hadFailure ||
        runtimeCleanup.hadFailure;
      if (!ownerSessionId && clearedStateOrArtifacts === 0 && !hadFailure) {
        return {
          content: [{
            type: 'text' as const,
            text: formatStateClearNoopMessage(mode, root, sessionId)
          }]
        };
      }
      return {
        content: [{
          type: 'text' as const,
          text: `${hadFailure ? 'Warning: Some files could not be removed' : 'Successfully cleared state'} for mode: ${mode} in session: ${sessionId}${note}${runtimeCleanupNote}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text' as const,
          text: `Error clearing state for ${mode}: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }
};

// ============================================================================
// state_list_active - List all active modes
// ============================================================================

export const stateListActiveTool: ToolDefinition<{
  workingDirectory: z.ZodOptional<z.ZodString>;
  session_id: z.ZodOptional<z.ZodString>;
  all: z.ZodOptional<z.ZodBoolean>;
}> = {
  name: 'state_list_active',
  description: 'List all currently active modes. By default, scopes to the current session (OMQ_SESSION_ID). Pass all:true to list active modes across all sessions.',
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  schema: {
    workingDirectory: z.string().optional().describe('Working directory (defaults to cwd)'),
    session_id: z.string().optional().describe('Explicit session ID to scope the listing. Overrides OMQ_SESSION_ID when provided.'),
    all: z.boolean().optional().describe('When true, list active modes across all sessions. Overrides the default current-session scope.'),
  },
  handler: async (args) => {
    const { workingDirectory, session_id, all } = args;

    try {
      const root = validateWorkingDirectory(workingDirectory);

      // Resolve the effective session ID:
      //   1. Explicit session_id arg wins (back-compat for callers that pass it directly).
      //   2. all:true opts out of session scoping entirely → show everything.
      //   3. Otherwise default to the current session via resolveSessionId({context:'cli'}).
      const explicitSessionId = session_id as string | undefined;
      const showAll = all === true;
      const sessionId: string | undefined = explicitSessionId
        ?? (showAll ? undefined : resolveSessionId({ context: 'cli' }));

      // If session_id resolved (explicit or current session), show modes for that session
      if (sessionId) {
        validateSessionId(sessionId);

        // Get active modes from registry for this session
        const activeModes: string[] = [...getActiveModes(root, sessionId)];

        for (const mode of EXTRA_STATE_ONLY_MODES) {
          try {
            const statePath = resolveSessionStatePath(mode, sessionId, root);
            if (existsSync(statePath)) {
              const content = readFileSync(statePath, 'utf-8');
              const state = JSON.parse(content);
              if (state.active) {
                activeModes.push(mode);
              }
            }
          } catch {
            // Ignore parse errors
          }
        }

        if (activeModes.length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: `## Active Modes (session: ${sessionId})\n\nNo modes are currently active in this session.`
            }]
          };
        }

        const modeList = activeModes.map(mode => `- **${mode}**`).join('\n');

        return {
          content: [{
            type: 'text' as const,
            text: `## Active Modes (session: ${sessionId}, ${activeModes.length})\n\n${modeList}`
          }]
        };
      }

      // Show all active modes across all sessions
      const modeSessionMap = new Map<string, string[]>();
      const sessionIds = listSessionIds(root);
      for (const sid of sessionIds) {
        const sessionActiveModes: string[] = [...getActiveModes(root, sid)];

        for (const mode of EXTRA_STATE_ONLY_MODES) {
          try {
            const statePath = resolveSessionStatePath(mode, sid, root);
            if (existsSync(statePath)) {
              const content = readFileSync(statePath, 'utf-8');
              const state = JSON.parse(content);
              if (state.active) {
                sessionActiveModes.push(mode);
              }
            }
          } catch {
            // Ignore parse errors
          }
        }

        for (const mode of sessionActiveModes) {
          if (!modeSessionMap.has(mode)) {
            modeSessionMap.set(mode, []);
          }
          modeSessionMap.get(mode)!.push(sid);
        }
      }

      if (modeSessionMap.size === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: '## Active Modes\n\nNo modes are currently active.'
          }]
        };
      }

      const lines: string[] = [`## Active Modes (${modeSessionMap.size})\n`];
      for (const [mode, sessions] of Array.from(modeSessionMap.entries())) {
        lines.push(`- **${mode}** (${sessions.join(', ')})`);
      }

      return {
        content: [{
          type: 'text' as const,
          text: lines.join('\n')
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text' as const,
          text: `Error listing active modes: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }
};

// ============================================================================
// state_get_status - Get detailed status for a mode
// ============================================================================

export const stateGetStatusTool: ToolDefinition<{
  mode: z.ZodOptional<z.ZodEnum<typeof STATE_TOOL_MODES>>;
  workingDirectory: z.ZodOptional<z.ZodString>;
  session_id: z.ZodOptional<z.ZodString>;
}> = {
  name: 'state_get_status',
  description: 'Get detailed status for a specific mode or all modes. Shows active status, file paths, and state contents.',
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  schema: {
    mode: z.enum(STATE_TOOL_MODES).optional().describe('Specific mode to check (omit for all modes)'),
    workingDirectory: z.string().optional().describe('Working directory (defaults to cwd)'),
    session_id: z.string().optional().describe('Session ID for session-scoped state isolation. Auto-resolved from OMQ_SESSION_ID when omitted.'),
  },
  handler: async (args) => {
    const { mode, workingDirectory, session_id } = args;

    try {
      const root = validateWorkingDirectory(workingDirectory);
      const sessionId = (session_id as string | undefined) ?? resolveSessionId({ context: 'cli' });
      validateSessionId(sessionId);

      if (mode) {
        const lines: string[] = [`## Status: ${mode}\n`];
        const statePath = getStatePath(mode, root, sessionId);

        const active = MODE_CONFIGS[mode as ExecutionMode]
          ? isModeActive(mode as ExecutionMode, root, sessionId)
          : existsSync(statePath) && (() => {
              try {
                const content = readFileSync(statePath, 'utf-8');
                const state = JSON.parse(content);
                return state.active === true;
              } catch { return false; }
            })();

        let statePreview = 'No state file';
        if (existsSync(statePath)) {
          try {
            const content = readFileSync(statePath, 'utf-8');
            const state = JSON.parse(content);
            statePreview = JSON.stringify(state, null, 2).slice(0, 500);
            if (statePreview.length >= 500) statePreview += '\n...(truncated)';
          } catch {
            statePreview = 'Error reading state file';
          }
        }

        lines.push(`### Session: ${sessionId}`);
        lines.push(`- **Active:** ${active ? 'Yes' : 'No'}`);
        lines.push(`- **State Path:** ${statePath}`);
        lines.push(`- **Exists:** ${existsSync(statePath) ? 'Yes' : 'No'}`);
        lines.push(`\n### State Preview\n\`\`\`json\n${statePreview}\n\`\`\``);

        const activeSessions = MODE_CONFIGS[mode as ExecutionMode]
          ? getActiveSessionsForMode(mode as ExecutionMode, root)
          : listSessionIds(root).filter(sid => {
              try {
                const sessionPath = resolveSessionStatePath(mode, sid, root);
                if (existsSync(sessionPath)) {
                  const content = readFileSync(sessionPath, 'utf-8');
                  const state = JSON.parse(content);
                  return state.active === true;
                }
                return false;
              } catch {
                return false;
              }
            });

        if (activeSessions.length > 0) {
          lines.push(`\n### Active Sessions (${activeSessions.length})`);
          for (const sid of activeSessions) {
            lines.push(`- ${sid}`);
          }
        }

        return {
          content: [{
            type: 'text' as const,
            text: lines.join('\n')
          }]
        };
      }

      // All modes status
      const statuses = getAllModeStatuses(root, sessionId);
      const lines = [`## All Mode Statuses (session: ${sessionId})\n`];

      for (const status of statuses) {
        const icon = status.active ? '[ACTIVE]' : '[INACTIVE]';
        lines.push(`${icon} **${status.mode}**: ${status.active ? 'Active' : 'Inactive'}`);
        lines.push(`   Path: \`${status.stateFilePath}\``);
      }

      for (const extraMode of EXTRA_STATE_ONLY_MODES) {
        const statePath = resolveSessionStatePath(extraMode, sessionId, root);
        let active = false;
        if (existsSync(statePath)) {
          try {
            const content = readFileSync(statePath, 'utf-8');
            const state = JSON.parse(content);
            active = state.active === true;
          } catch {
            // Ignore parse errors
          }
        }
        const icon = active ? '[ACTIVE]' : '[INACTIVE]';
        lines.push(`${icon} **${extraMode}**: ${active ? 'Active' : 'Inactive'}`);
        lines.push(`   Path: \`${statePath}\``);
      }

      return {
        content: [{
          type: 'text' as const,
          text: lines.join('\n')
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text' as const,
          text: `Error getting status: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }
};

/**
 * All state tools for registration
 */
export const stateTools = [
  stateReadTool,
  stateWriteTool,
  stateClearTool,
  stateListActiveTool,
  stateGetStatusTool,
];
