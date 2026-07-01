/**
 * Rate Limit Wait Feature
 *
 * Auto-resume Qoder CLI sessions when rate limits reset.
 *
 * Usage:
 *   omq wait status         - Show current rate limit status
 *   omq wait daemon start   - Start the background daemon
 *   omq wait daemon stop    - Stop the daemon
 *   omq wait detect         - Scan for blocked Qoder CLI sessions
 */

// Type exports
export type {
  RateLimitStatus,
  TmuxPane,
  PaneAnalysisResult,
  BlockedPane,
  DaemonState,
  DaemonConfig,
  ResumeResult,
  DaemonCommand,
  DaemonResponse,
} from './types.js';

// Rate limit monitor exports
export {
  checkRateLimitStatus,
  formatTimeUntilReset,
  formatRateLimitStatus,
  isRateLimitStatusDegraded,
  shouldMonitorBlockedPanes,
} from './rate-limit-monitor.js';

// tmux detector exports
export {
  isTmuxAvailable,
  isInsideTmux,
  isPaneAlive,
  listTmuxPanes,
  capturePaneContent,
  analyzePaneContent,
  scanForBlockedPanes,
  sendResumeSequence,
  sendToPane,
  formatBlockedPanesSummary,
} from './tmux-detector.js';

// Daemon exports
export {
  readDaemonState,
  isDaemonRunning,
  startDaemon,
  runDaemonForeground,
  stopDaemon,
  getDaemonStatus,
  detectBlockedPanes,
  formatDaemonState,
} from './daemon.js';
