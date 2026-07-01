/**
 * Mode Registry Types
 *
 * Defines the supported execution modes and their state file locations.
 */

export type ExecutionMode =
  | 'autopilot'
  | 'autoresearch'
  | 'team'
  | 'ralph'
  | 'ultrawork'
  | 'ultraqa'
  | 'deep-interview'
  | 'self-improve';

export interface ModeConfig {
  /** Display name for the mode */
  name: string;
  /** Primary state file path (relative to .omq/state/) */
  stateFile: string;
  /** Alternative/marker file path (relative to .omq/state/) */
  markerFile?: string;
  /** Property to check in JSON state (if JSON-based) */
  activeProperty?: string;
  /** Whether state is SQLite-based (requires marker file) */
  isSqlite?: boolean;
}

export interface ModeStatus {
  mode: ExecutionMode;
  active: boolean;
  stateFilePath: string;
}

export interface CanStartResult {
  allowed: boolean;
  blockedBy?: ExecutionMode;
  message?: string;
}
