/**
 * Session-id resolution for multi-repo workspaces (Wave A).
 *
 * Two callers consume this:
 *  - CLI commands (autopilot, ralph, ultraqa, ultragoal, etc.) running in a
 *    shell where the only signal is the `OMQ_SESSION_ID` env var.
 *  - Hooks (session-start, post-tool-use-failure, etc.) running with a
 *    `data.session_id` payload from Qoder CLI.
 *
 * Precedence is INTENTIONALLY asymmetric:
 *  - In CLI contexts the env var is authoritative — the user controls it
 *    explicitly per-shell, and a stale payload from a previous run must not
 *    override the active terminal's intent.
 *  - In hook contexts the payload is authoritative — Qoder CLI is the
 *    source of truth for the current session, and the env var may belong to
 *    a different shell.
 *
 * When neither source supplies a value, falls back to a process-scoped
 * session id so state is always session-isolated.
 */

import { getProcessSessionId } from './worktree-paths.js';

export type SessionIdContext = 'cli' | 'hook';

export interface ResolveSessionIdInput {
  context: SessionIdContext;
  hookPayload?: { session_id?: string } | null;
}

function readEnv(): string | undefined {
  const value = process.env.OMQ_SESSION_ID;
  return value && value.trim() ? value.trim() : undefined;
}

function readPayload(payload: ResolveSessionIdInput['hookPayload']): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const value = payload.session_id;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * Resolve the active session id given the caller's context. Always returns
 * a session id — falls back to a process-scoped id when neither env var
 * nor hook payload supplies one.
 */
export function resolveSessionId(input: ResolveSessionIdInput): string {
  const env = readEnv();
  const payload = readPayload(input.hookPayload);
  if (input.context === 'cli') {
    return env ?? payload ?? getProcessSessionId();
  }
  // hook
  return payload ?? env ?? getProcessSessionId();
}
