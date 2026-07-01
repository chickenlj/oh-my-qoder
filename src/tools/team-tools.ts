/**
 * Team MCP Tools
 *
 * Self-contained agent team coordination tools that don't depend on
 * host CLI built-in team support. Wraps the existing file-based
 * team infrastructure in src/team/team-ops.ts as MCP tools the LLM
 * can call directly.
 *
 * Inspired by oh-my-openagent's file-based mailbox approach.
 *
 * Storage: .omq/state/team/{teamName}/
 */

import { z } from 'zod';
import { validateWorkingDirectory } from '../lib/worktree-paths.js';
import {
  teamCreateTask,
  teamReadTask,
  teamListTasks,
  teamUpdateTask,
  teamClaimTask,
  teamTransitionTaskStatus,
  teamReleaseTaskClaim,
  teamWriteWorkerIdentity,
  teamUpdateWorkerHeartbeat,
  teamMarkMessageDelivered,
  teamWriteShutdownRequest,
  teamReadShutdownAck,
  teamReadWorkerHeartbeat,
  teamSendMessage,
  teamBroadcast,
  teamListMailbox,
  teamGetSummary,
  teamCleanup,
  teamReadConfig,
} from '../team/team-ops.js';
import type { TeamTaskStatus } from '../team/contracts.js';
import { TeamPaths, absPath } from '../team/state-paths.js';
import { TEAM_NAME_SAFE_PATTERN } from '../team/contracts.js';
import { ensureDirSync, atomicWriteFileSync } from '../lib/atomic-write.js';
import type { ToolDefinition } from './types.js';

function textResponse(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

function errorResponse(msg: string) {
  return { content: [{ type: 'text' as const, text: msg }], isError: true };
}

function resolveDir(workingDirectory?: string): string {
  return validateWorkingDirectory(workingDirectory);
}

function validateName(name: string): string | null {
  if (!TEAM_NAME_SAFE_PATTERN.test(name)) {
    return `Invalid team name "${name}". Must match ${TEAM_NAME_SAFE_PATTERN}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// team_create
// ---------------------------------------------------------------------------

export const teamCreateTool: ToolDefinition<{
  team_name: z.ZodString;
  description: z.ZodString;
  workingDirectory: z.ZodOptional<z.ZodString>;
}> = {
  name: 'team_create',
  description: 'Create a new agent team with a shared task list and mailbox. Does NOT spawn members — use the Agent tool to spawn workers after creating the team.',
  schema: {
    team_name: z.string().describe('Team name (lowercase, hyphens, no spaces)'),
    description: z.string().describe('High-level team task description'),
    workingDirectory: z.string().optional(),
  },
  handler: async (args) => {
    const nameErr = validateName(args.team_name);
    if (nameErr) return errorResponse(nameErr);

    const cwd = resolveDir(args.workingDirectory);
    const configPath = absPath(cwd, TeamPaths.config(args.team_name));

    const existing = await teamReadConfig(args.team_name, cwd);
    if (existing) {
      return errorResponse(`Team "${args.team_name}" already exists. Delete it first or choose a different name.`);
    }

    const config = {
      name: args.team_name,
      task: args.description,
      agent_type: 'qwen',
      worker_launch_mode: 'interactive' as const,
      worker_count: 0,
      max_workers: 20,
      workers: [],
      created_at: new Date().toISOString(),
      tmux_session: '',
      next_task_id: 1,
      leader_cwd: cwd,
      team_state_root: TeamPaths.root(args.team_name),
    };

    ensureDirSync(absPath(cwd, TeamPaths.root(args.team_name)));
    ensureDirSync(absPath(cwd, TeamPaths.tasks(args.team_name)));
    atomicWriteFileSync(configPath, JSON.stringify(config, null, 2));

    return textResponse(JSON.stringify({
      team_name: args.team_name,
      config_path: configPath,
      created_at: config.created_at,
      message: `Team "${args.team_name}" created. Use the Agent tool to spawn workers, then team_task_create to assign work.`,
    }, null, 2));
  },
};

// ---------------------------------------------------------------------------
// team_delete
// ---------------------------------------------------------------------------

export const teamDeleteTool: ToolDefinition<{
  team_name: z.ZodString;
  workingDirectory: z.ZodOptional<z.ZodString>;
}> = {
  name: 'team_delete',
  description: 'Delete a team and remove all its state (tasks, mailbox, config).',
  schema: {
    team_name: z.string().describe('Team name to delete'),
    workingDirectory: z.string().optional(),
  },
  handler: async (args) => {
    const cwd = resolveDir(args.workingDirectory);
    await teamCleanup(args.team_name, cwd);
    return textResponse(`Team "${args.team_name}" deleted.`);
  },
};

// ---------------------------------------------------------------------------
// team_task_create
// ---------------------------------------------------------------------------

export const teamTaskCreateTool: ToolDefinition<{
  team_name: z.ZodString;
  subject: z.ZodString;
  description: z.ZodString;
  owner: z.ZodOptional<z.ZodString>;
  blocked_by: z.ZodOptional<z.ZodArray<z.ZodString>>;
  workingDirectory: z.ZodOptional<z.ZodString>;
}> = {
  name: 'team_task_create',
  description: 'Create a task in a team\'s shared task list. Returns the task with its auto-assigned ID.',
  schema: {
    team_name: z.string().describe('Team name'),
    subject: z.string().describe('Brief task title'),
    description: z.string().describe('Detailed task description'),
    owner: z.string().optional().describe('Worker name to assign the task to'),
    blocked_by: z.array(z.string()).optional().describe('Task IDs that must complete before this one'),
    workingDirectory: z.string().optional(),
  },
  handler: async (args) => {
    const cwd = resolveDir(args.workingDirectory);
    const task = await teamCreateTask(args.team_name, {
      subject: args.subject,
      description: args.description,
      status: 'pending',
      owner: args.owner,
      blocked_by: args.blocked_by,
    }, cwd);
    return textResponse(JSON.stringify(task, null, 2));
  },
};

// ---------------------------------------------------------------------------
// team_task_list
// ---------------------------------------------------------------------------

export const teamTaskListTool: ToolDefinition<{
  team_name: z.ZodString;
  status: z.ZodOptional<z.ZodString>;
  owner: z.ZodOptional<z.ZodString>;
  workingDirectory: z.ZodOptional<z.ZodString>;
}> = {
  name: 'team_task_list',
  description: 'List all tasks in a team, optionally filtered by status or owner.',
  annotations: { readOnlyHint: true },
  schema: {
    team_name: z.string().describe('Team name'),
    status: z.string().optional().describe('Filter by status: pending, in_progress, completed, failed, blocked'),
    owner: z.string().optional().describe('Filter by owner worker name'),
    workingDirectory: z.string().optional(),
  },
  handler: async (args) => {
    const cwd = resolveDir(args.workingDirectory);
    let tasks = await teamListTasks(args.team_name, cwd);
    if (args.status) tasks = tasks.filter(t => t.status === args.status);
    if (args.owner) tasks = tasks.filter(t => t.owner === args.owner);
    return textResponse(JSON.stringify({ count: tasks.length, tasks }, null, 2));
  },
};

// ---------------------------------------------------------------------------
// team_task_get
// ---------------------------------------------------------------------------

export const teamTaskGetTool: ToolDefinition<{
  team_name: z.ZodString;
  task_id: z.ZodString;
  workingDirectory: z.ZodOptional<z.ZodString>;
}> = {
  name: 'team_task_get',
  description: 'Read a single task by ID from a team\'s task list.',
  annotations: { readOnlyHint: true },
  schema: {
    team_name: z.string().describe('Team name'),
    task_id: z.string().describe('Task ID'),
    workingDirectory: z.string().optional(),
  },
  handler: async (args) => {
    const cwd = resolveDir(args.workingDirectory);
    const task = await teamReadTask(args.team_name, args.task_id, cwd);
    if (!task) return errorResponse(`Task ${args.task_id} not found in team "${args.team_name}".`);
    return textResponse(JSON.stringify(task, null, 2));
  },
};

// ---------------------------------------------------------------------------
// team_task_update
// ---------------------------------------------------------------------------

export const teamTaskUpdateTool: ToolDefinition<{
  team_name: z.ZodString;
  task_id: z.ZodString;
  status: z.ZodOptional<z.ZodString>;
  owner: z.ZodOptional<z.ZodString>;
  result: z.ZodOptional<z.ZodString>;
  workingDirectory: z.ZodOptional<z.ZodString>;
}> = {
  name: 'team_task_update',
  description: 'Update a task\'s status, owner, or result in a team\'s task list.',
  schema: {
    team_name: z.string().describe('Team name'),
    task_id: z.string().describe('Task ID to update'),
    status: z.string().optional().describe('New status: pending, in_progress, completed, failed'),
    owner: z.string().optional().describe('New owner worker name'),
    result: z.string().optional().describe('Task result or completion summary'),
    workingDirectory: z.string().optional(),
  },
  handler: async (args) => {
    const cwd = resolveDir(args.workingDirectory);
    const updates: Record<string, unknown> = {};
    if (args.status) updates.status = args.status;
    if (args.owner) updates.owner = args.owner;
    if (args.result) updates.result = args.result;
    if (args.status === 'completed') updates.completed_at = new Date().toISOString();

    const task = await teamUpdateTask(args.team_name, args.task_id, updates, cwd);
    if (!task) return errorResponse(`Task ${args.task_id} not found in team "${args.team_name}".`);
    return textResponse(JSON.stringify(task, null, 2));
  },
};

// ---------------------------------------------------------------------------
// team_send_message
// ---------------------------------------------------------------------------

export const teamSendMessageTool: ToolDefinition<{
  team_name: z.ZodString;
  from_worker: z.ZodString;
  to_worker: z.ZodString;
  body: z.ZodString;
  workingDirectory: z.ZodOptional<z.ZodString>;
}> = {
  name: 'team_send_message',
  description: 'Send a direct message to a team member\'s mailbox.',
  schema: {
    team_name: z.string().describe('Team name'),
    from_worker: z.string().describe('Sender worker name'),
    to_worker: z.string().describe('Recipient worker name'),
    body: z.string().describe('Message body (max 32KB)'),
    workingDirectory: z.string().optional(),
  },
  handler: async (args) => {
    if (args.body.length > 32768) {
      return errorResponse('Message body exceeds 32KB limit.');
    }
    const cwd = resolveDir(args.workingDirectory);
    const msg = await teamSendMessage(args.team_name, args.from_worker, args.to_worker, args.body, cwd);
    return textResponse(JSON.stringify(msg, null, 2));
  },
};

// ---------------------------------------------------------------------------
// team_broadcast
// ---------------------------------------------------------------------------

export const teamBroadcastTool: ToolDefinition<{
  team_name: z.ZodString;
  from_worker: z.ZodString;
  body: z.ZodString;
  workingDirectory: z.ZodOptional<z.ZodString>;
}> = {
  name: 'team_broadcast',
  description: 'Send a message to all team members (except sender).',
  schema: {
    team_name: z.string().describe('Team name'),
    from_worker: z.string().describe('Sender worker name'),
    body: z.string().describe('Message body'),
    workingDirectory: z.string().optional(),
  },
  handler: async (args) => {
    const cwd = resolveDir(args.workingDirectory);
    const messages = await teamBroadcast(args.team_name, args.from_worker, args.body, cwd);
    return textResponse(JSON.stringify({ count: messages.length, messages }, null, 2));
  },
};

// ---------------------------------------------------------------------------
// team_status
// ---------------------------------------------------------------------------

export const teamStatusTool: ToolDefinition<{
  team_name: z.ZodString;
  workingDirectory: z.ZodOptional<z.ZodString>;
}> = {
  name: 'team_status',
  description: 'Get aggregate team status: task counts by status, worker heartbeats, unread messages.',
  annotations: { readOnlyHint: true },
  schema: {
    team_name: z.string().describe('Team name'),
    workingDirectory: z.string().optional(),
  },
  handler: async (args) => {
    const cwd = resolveDir(args.workingDirectory);
    const summary = await teamGetSummary(args.team_name, cwd);
    if (!summary) return errorResponse(`Team "${args.team_name}" not found.`);
    return textResponse(JSON.stringify(summary, null, 2));
  },
};

// ---------------------------------------------------------------------------
// team_list_mailbox
// ---------------------------------------------------------------------------

export const teamListMailboxTool: ToolDefinition<{
  team_name: z.ZodString;
  worker_name: z.ZodString;
  workingDirectory: z.ZodOptional<z.ZodString>;
}> = {
  name: 'team_list_mailbox',
  description: 'Read messages from a worker\'s mailbox.',
  annotations: { readOnlyHint: true },
  schema: {
    team_name: z.string().describe('Team name'),
    worker_name: z.string().describe('Worker name whose mailbox to read'),
    workingDirectory: z.string().optional(),
  },
  handler: async (args) => {
    const cwd = resolveDir(args.workingDirectory);
    const messages = await teamListMailbox(args.team_name, args.worker_name, cwd);
    return textResponse(JSON.stringify({
      worker: args.worker_name,
      count: messages.length,
      messages,
    }, null, 2));
  },
};

// ---------------------------------------------------------------------------
// team_register_worker
// ---------------------------------------------------------------------------

export const teamRegisterWorkerTool: ToolDefinition<{
  team_name: z.ZodString;
  worker_name: z.ZodString;
  role: z.ZodOptional<z.ZodString>;
  workingDirectory: z.ZodOptional<z.ZodString>;
}> = {
  name: 'team_register_worker',
  description: 'Register a worker in the team. Call this at worker startup to establish identity and add the worker to the team config.',
  schema: {
    team_name: z.string().describe('Team name'),
    worker_name: z.string().describe('Unique worker name (e.g. worker-1)'),
    role: z.string().optional().describe('Worker role (e.g. executor, test-engineer)'),
    workingDirectory: z.string().optional(),
  },
  handler: async (args) => {
    const cwd = resolveDir(args.workingDirectory);
    const config = await teamReadConfig(args.team_name, cwd);
    if (!config) return errorResponse(`Team "${args.team_name}" not found.`);

    const identity: import('../team/types.js').WorkerInfo = {
      name: args.worker_name,
      index: config.workers.length,
      role: args.role ?? 'executor',
      assigned_tasks: [],
      working_dir: cwd,
    };
    await teamWriteWorkerIdentity(args.team_name, args.worker_name, identity, cwd);

    if (!config.workers.some(w => w.name === args.worker_name)) {
      config.workers.push(identity);
      config.worker_count = config.workers.length;
      const configPath = absPath(cwd, TeamPaths.config(args.team_name));
      atomicWriteFileSync(configPath, JSON.stringify(config, null, 2));
    }

    return textResponse(JSON.stringify({
      worker_name: args.worker_name,
      team_name: args.team_name,
      registered: true,
    }, null, 2));
  },
};

// ---------------------------------------------------------------------------
// team_claim_task
// ---------------------------------------------------------------------------

export const teamClaimTaskTool: ToolDefinition<{
  team_name: z.ZodString;
  task_id: z.ZodString;
  worker_name: z.ZodString;
  expected_version: z.ZodOptional<z.ZodNumber>;
  workingDirectory: z.ZodOptional<z.ZodString>;
}> = {
  name: 'team_claim_task',
  description: 'Atomically claim a task. Returns a claim_token required for later status transitions. Fails if the task is already claimed or in a terminal state.',
  schema: {
    team_name: z.string().describe('Team name'),
    task_id: z.string().describe('Task ID to claim'),
    worker_name: z.string().describe('Worker claiming the task'),
    expected_version: z.number().optional().describe('Expected task version for optimistic concurrency'),
    workingDirectory: z.string().optional(),
  },
  handler: async (args) => {
    const cwd = resolveDir(args.workingDirectory);
    const result = await teamClaimTask(
      args.team_name,
      args.task_id,
      args.worker_name,
      args.expected_version ?? null,
      cwd,
    );
    if (!result.ok) return errorResponse(JSON.stringify(result, null, 2));
    return textResponse(JSON.stringify(result, null, 2));
  },
};

// ---------------------------------------------------------------------------
// team_next_ready_task
// ---------------------------------------------------------------------------

export const teamNextReadyTaskTool: ToolDefinition<{
  team_name: z.ZodString;
  worker_name: z.ZodString;
  workingDirectory: z.ZodOptional<z.ZodString>;
}> = {
  name: 'team_next_ready_task',
  description: 'Find the next unblocked pending task and atomically claim it. Returns the task with a claim_token, or null if no tasks are available.',
  schema: {
    team_name: z.string().describe('Team name'),
    worker_name: z.string().describe('Worker claiming the task'),
    workingDirectory: z.string().optional(),
  },
  handler: async (args) => {
    const cwd = resolveDir(args.workingDirectory);
    const tasks = await teamListTasks(args.team_name, cwd);
    const allTasks = tasks;

    const completedIds = new Set(
      allTasks.filter(t => t.status === 'completed').map(t => t.id),
    );

    const ready = allTasks.filter(t => {
      if (t.status !== 'pending') return false;
      const taskAny = t as unknown as Record<string, unknown>;
      const deps = taskAny.depends_on as string[] | undefined
        ?? taskAny.blocked_by as string[] | undefined
        ?? [];
      return deps.every(d => completedIds.has(d));
    });

    if (ready.length === 0) {
      return textResponse(JSON.stringify({ claimed: false, reason: 'no_ready_tasks' }, null, 2));
    }

    for (const candidate of ready) {
      const result = await teamClaimTask(
        args.team_name,
        candidate.id,
        args.worker_name,
        null,
        cwd,
      );
      if (result.ok) {
        return textResponse(JSON.stringify({
          claimed: true,
          task: candidate,
          claim_token: result.claimToken,
        }, null, 2));
      }
    }

    return textResponse(JSON.stringify({ claimed: false, reason: 'all_contested' }, null, 2));
  },
};

// ---------------------------------------------------------------------------
// team_transition_task
// ---------------------------------------------------------------------------

export const teamTransitionTaskTool: ToolDefinition<{
  team_name: z.ZodString;
  task_id: z.ZodString;
  from: z.ZodString;
  to: z.ZodString;
  claim_token: z.ZodString;
  result: z.ZodOptional<z.ZodString>;
  error: z.ZodOptional<z.ZodString>;
  workingDirectory: z.ZodOptional<z.ZodString>;
}> = {
  name: 'team_transition_task',
  description: 'Transition a task status using a claim_token. Use this instead of team_task_update for status changes — it enforces valid transitions and claim ownership.',
  schema: {
    team_name: z.string().describe('Team name'),
    task_id: z.string().describe('Task ID'),
    from: z.string().describe('Current status (e.g. in_progress)'),
    to: z.string().describe('Target status (e.g. completed, failed)'),
    claim_token: z.string().describe('Claim token from team_claim_task or team_next_ready_task'),
    result: z.string().optional().describe('Task result summary (for completed)'),
    error: z.string().optional().describe('Error description (for failed)'),
    workingDirectory: z.string().optional(),
  },
  handler: async (args) => {
    const cwd = resolveDir(args.workingDirectory);
    const terminalData: { result?: string; error?: string } = {};
    if (args.result) terminalData.result = args.result;
    if (args.error) terminalData.error = args.error;

    const res = await teamTransitionTaskStatus(
      args.team_name,
      args.task_id,
      args.from as TeamTaskStatus,
      args.to as TeamTaskStatus,
      args.claim_token,
      cwd,
      Object.keys(terminalData).length > 0 ? terminalData : undefined,
    );
    if (!res.ok) return errorResponse(JSON.stringify(res, null, 2));
    return textResponse(JSON.stringify(res, null, 2));
  },
};

// ---------------------------------------------------------------------------
// team_release_claim
// ---------------------------------------------------------------------------

export const teamReleaseClaimTool: ToolDefinition<{
  team_name: z.ZodString;
  task_id: z.ZodString;
  claim_token: z.ZodString;
  worker_name: z.ZodString;
  workingDirectory: z.ZodOptional<z.ZodString>;
}> = {
  name: 'team_release_claim',
  description: 'Release a previously claimed task back to pending so another worker can pick it up.',
  schema: {
    team_name: z.string().describe('Team name'),
    task_id: z.string().describe('Task ID'),
    claim_token: z.string().describe('Claim token from the original claim'),
    worker_name: z.string().describe('Worker releasing the claim'),
    workingDirectory: z.string().optional(),
  },
  handler: async (args) => {
    const cwd = resolveDir(args.workingDirectory);
    const res = await teamReleaseTaskClaim(
      args.team_name,
      args.task_id,
      args.claim_token,
      args.worker_name,
      cwd,
    );
    if (!res.ok) return errorResponse(JSON.stringify(res, null, 2));
    return textResponse(JSON.stringify(res, null, 2));
  },
};

// ---------------------------------------------------------------------------
// team_update_heartbeat
// ---------------------------------------------------------------------------

export const teamUpdateHeartbeatTool: ToolDefinition<{
  team_name: z.ZodString;
  worker_name: z.ZodString;
  current_task_id: z.ZodOptional<z.ZodString>;
  workingDirectory: z.ZodOptional<z.ZodString>;
}> = {
  name: 'team_update_heartbeat',
  description: 'Update worker heartbeat to signal liveness. Call periodically during work.',
  schema: {
    team_name: z.string().describe('Team name'),
    worker_name: z.string().describe('Worker name'),
    current_task_id: z.string().optional().describe('Task ID currently being worked on'),
    workingDirectory: z.string().optional(),
  },
  handler: async (args) => {
    const cwd = resolveDir(args.workingDirectory);
    const heartbeat: import('../team/types.js').WorkerHeartbeat = {
      pid: process.pid,
      last_turn_at: new Date().toISOString(),
      turn_count: 0,
      alive: true,
    };
    await teamUpdateWorkerHeartbeat(args.team_name, args.worker_name, heartbeat, cwd);
    return textResponse(JSON.stringify({
      worker_name: args.worker_name,
      heartbeat,
    }, null, 2));
  },
};

// ---------------------------------------------------------------------------
// team_mark_message_delivered
// ---------------------------------------------------------------------------

export const teamMarkMessageDeliveredTool: ToolDefinition<{
  team_name: z.ZodString;
  worker_name: z.ZodString;
  message_id: z.ZodString;
  workingDirectory: z.ZodOptional<z.ZodString>;
}> = {
  name: 'team_mark_message_delivered',
  description: 'Mark a mailbox message as delivered/read.',
  schema: {
    team_name: z.string().describe('Team name'),
    worker_name: z.string().describe('Worker whose mailbox contains the message'),
    message_id: z.string().describe('Message ID to mark as delivered'),
    workingDirectory: z.string().optional(),
  },
  handler: async (args) => {
    const cwd = resolveDir(args.workingDirectory);
    const ok = await teamMarkMessageDelivered(args.team_name, args.worker_name, args.message_id, cwd);
    if (!ok) return errorResponse(`Message ${args.message_id} not found in ${args.worker_name}'s mailbox.`);
    return textResponse(JSON.stringify({ marked: true, message_id: args.message_id }, null, 2));
  },
};

// ---------------------------------------------------------------------------
// team_request_shutdown
// ---------------------------------------------------------------------------

export const teamRequestShutdownTool: ToolDefinition<{
  team_name: z.ZodString;
  worker_name: z.ZodString;
  requested_by: z.ZodString;
  workingDirectory: z.ZodOptional<z.ZodString>;
}> = {
  name: 'team_request_shutdown',
  description: 'Request a worker to gracefully shut down. The worker should check for this and acknowledge.',
  schema: {
    team_name: z.string().describe('Team name'),
    worker_name: z.string().describe('Worker to shut down'),
    requested_by: z.string().describe('Name of the requester (usually leader)'),
    workingDirectory: z.string().optional(),
  },
  handler: async (args) => {
    const cwd = resolveDir(args.workingDirectory);
    await teamWriteShutdownRequest(args.team_name, args.worker_name, args.requested_by, cwd);
    return textResponse(JSON.stringify({
      shutdown_requested: true,
      worker_name: args.worker_name,
      requested_by: args.requested_by,
    }, null, 2));
  },
};

// ---------------------------------------------------------------------------
// team_read_shutdown_ack
// ---------------------------------------------------------------------------

export const teamReadShutdownAckTool: ToolDefinition<{
  team_name: z.ZodString;
  worker_name: z.ZodString;
  workingDirectory: z.ZodOptional<z.ZodString>;
}> = {
  name: 'team_read_shutdown_ack',
  description: 'Check if a worker has acknowledged a shutdown request.',
  annotations: { readOnlyHint: true },
  schema: {
    team_name: z.string().describe('Team name'),
    worker_name: z.string().describe('Worker to check'),
    workingDirectory: z.string().optional(),
  },
  handler: async (args) => {
    const cwd = resolveDir(args.workingDirectory);
    const ack = await teamReadShutdownAck(args.team_name, args.worker_name, cwd);
    return textResponse(JSON.stringify({
      worker_name: args.worker_name,
      acknowledged: ack !== null,
      ack,
    }, null, 2));
  },
};

// ---------------------------------------------------------------------------
// team_reap
// ---------------------------------------------------------------------------

export const teamReapTool: ToolDefinition<{
  team_name: z.ZodString;
  stale_threshold_minutes: z.ZodOptional<z.ZodNumber>;
  workingDirectory: z.ZodOptional<z.ZodString>;
}> = {
  name: 'team_reap',
  description: 'Reclaim stale in_progress tasks whose claiming worker has not sent a heartbeat within the threshold. Releases them back to pending.',
  schema: {
    team_name: z.string().describe('Team name'),
    stale_threshold_minutes: z.number().optional().describe('Minutes since last heartbeat to consider a claim stale (default: 5)'),
    workingDirectory: z.string().optional(),
  },
  handler: async (args) => {
    const cwd = resolveDir(args.workingDirectory);
    const thresholdMs = (args.stale_threshold_minutes ?? 5) * 60_000;
    const now = Date.now();
    const tasks = await teamListTasks(args.team_name, cwd);
    const inProgress = tasks.filter(t => t.status === 'in_progress');
    const reaped: string[] = [];

    for (const task of inProgress) {
      const claim = (task as unknown as Record<string, unknown>).claim as { worker?: string; token?: string; claimed_at?: string } | undefined;
      if (!claim?.worker || !claim?.token) continue;

      const hb = await teamReadWorkerHeartbeat(args.team_name, claim.worker, cwd);
      const lastSeen = hb?.last_turn_at ? Date.parse(hb.last_turn_at) : (claim.claimed_at ? Date.parse(claim.claimed_at) : 0);

      if (now - lastSeen > thresholdMs) {
        const releaseResult = await teamReleaseTaskClaim(
          args.team_name,
          task.id,
          claim.token,
          claim.worker,
          cwd,
        );
        if (releaseResult.ok) reaped.push(task.id);
      }
    }

    return textResponse(JSON.stringify({
      reaped_count: reaped.length,
      reaped_task_ids: reaped,
      checked: inProgress.length,
    }, null, 2));
  },
};

// ---------------------------------------------------------------------------
// Export all team tools
// ---------------------------------------------------------------------------

export const teamTools = [
  teamCreateTool,
  teamDeleteTool,
  teamTaskCreateTool,
  teamTaskListTool,
  teamTaskGetTool,
  teamTaskUpdateTool,
  teamSendMessageTool,
  teamBroadcastTool,
  teamStatusTool,
  teamListMailboxTool,
  teamRegisterWorkerTool,
  teamClaimTaskTool,
  teamNextReadyTaskTool,
  teamTransitionTaskTool,
  teamReleaseClaimTool,
  teamUpdateHeartbeatTool,
  teamMarkMessageDeliveredTool,
  teamRequestShutdownTool,
  teamReadShutdownAckTool,
  teamReapTool,
];
