/**
 * Worktree Path Enforcement
 *
 * Provides strict path validation and resolution for .omq/ paths,
 * ensuring all operations stay within the worktree boundary.
 *
 * Supports OMQ_STATE_DIR environment variable for centralized state storage.
 * When set, state is stored at $OMQ_STATE_DIR/{project-identifier}/ instead
 * of {worktree}/.omq/. This preserves state across worktree deletions.
 */

import { createHash } from 'crypto';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, readdirSync, writeFileSync, unlinkSync } from 'fs';
import { homedir, tmpdir } from 'os';
import { resolve, normalize, relative, sep, join, isAbsolute, basename, dirname } from 'path';
import { getQoderConfigDir } from '../utils/config-dir.js';

/**
 * Workspace marker filename. A directory containing this file is treated as
 * the OMQ anchor regardless of git status — enables multi-repo workspaces
 * where the parent dir is not itself a git repo (issue: bidchex-repos style).
 *
 * The marker can be empty or a JSON file with optional fields:
 *   { "id": "stable-workspace-identifier" }
 *
 * Resolution order in getOmqRoot(): OMQ_STATE_DIR > workspace marker > git > cwd.
 */
export const WORKSPACE_MARKER = '.omq-workspace';

/** Standard .omq subdirectories */
export const OmqPaths = {
  ROOT: '.omq',
  STATE: '.omq/state',
  SESSIONS: '.omq/state/sessions',
  PLANS: '.omq/plans',
  RESEARCH: '.omq/research',
  NOTEPAD: '.omq/notepad.md',
  PROJECT_MEMORY: '.omq/project-memory.json',
  DRAFTS: '.omq/drafts',
  NOTEPADS: '.omq/notepads',
  LOGS: '.omq/logs',
  SCIENTIST: '.omq/scientist',
  AUTOPILOT: '.omq/autopilot',
  SKILLS: '.omq/skills',
  SHARED_MEMORY: '.omq/state/shared-memory',
  DEEPINIT_MANIFEST: '.omq/deepinit-manifest.json',
} as const;

/**
 * LRU cache for worktree root lookups to avoid repeated git subprocess calls.
 * Bounded to MAX_WORKTREE_CACHE_SIZE entries to prevent memory growth when
 * alternating between many different cwds (cache thrashing).
 */
const MAX_WORKTREE_CACHE_SIZE = 8;
const worktreeCacheMap = new Map<string, string>();

/**
 * LRU cache for workspace marker lookups.
 */
const workspaceCacheMap = new Map<string, string | null>();

interface WorkspaceMarkerConfig {
  id?: string;
}

/**
 * Walk up from the given directory looking for a WORKSPACE_MARKER file.
 * Returns the directory containing the marker, or null if none found before
 * reaching the filesystem root or the user's home directory.
 *
 * Walking stops at the home directory to prevent accidentally treating a
 * stray marker in $HOME or above as a workspace anchor.
 */
export function findWorkspaceRoot(startDir?: string): string | null {
  if (process.env.OMQ_DISABLE_MULTIREPO === '1') return null;
  const effectiveStart = startDir || process.cwd();
  let current: string;
  try {
    current = resolve(effectiveStart);
  } catch {
    return null;
  }

  if (workspaceCacheMap.has(current)) {
    const cached = workspaceCacheMap.get(current) ?? null;
    workspaceCacheMap.delete(current);
    workspaceCacheMap.set(current, cached);
    return cached;
  }

  const home = (() => {
    try { return resolve(homedir()); } catch { return null; }
  })();

  let cursor = current;
  let result: string | null = null;
  while (true) {
    // Stop before scanning $HOME (or above) so a stray ~/.omq-workspace does
    // not collapse unrelated repos under home into one shared state root.
    if (home && cursor === home) break;
    if (existsSync(join(cursor, WORKSPACE_MARKER))) {
      result = cursor;
      break;
    }
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }

  if (workspaceCacheMap.size >= MAX_WORKTREE_CACHE_SIZE) {
    const oldest = workspaceCacheMap.keys().next().value;
    if (oldest !== undefined) workspaceCacheMap.delete(oldest);
  }
  workspaceCacheMap.set(current, result);
  return result;
}

/**
 * Read optional workspace marker config (id override). Returns {} when the
 * marker is empty or unparseable — callers should not throw on config errors.
 */
export function readWorkspaceMarkerConfig(workspaceRoot: string): WorkspaceMarkerConfig {
  try {
    const raw = readFileSync(join(workspaceRoot, WORKSPACE_MARKER), 'utf-8').trim();
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as WorkspaceMarkerConfig;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Get the git worktree root for the current or specified directory.
 * Returns null if not in a git repository.
 */
export function getWorktreeRoot(cwd?: string): string | null {
  const effectiveCwd = cwd || process.cwd();

  // Return cached value if present (LRU: move to end on access)
  if (worktreeCacheMap.has(effectiveCwd)) {
    const root = worktreeCacheMap.get(effectiveCwd)!;
    // Refresh insertion order for LRU eviction
    worktreeCacheMap.delete(effectiveCwd);
    worktreeCacheMap.set(effectiveCwd, root);
    return root || null;
  }

  try {
    const root = execSync('git rev-parse --show-toplevel', {
      cwd: effectiveCwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    }).trim();

    // Evict oldest entry when at capacity
    if (worktreeCacheMap.size >= MAX_WORKTREE_CACHE_SIZE) {
      const oldest = worktreeCacheMap.keys().next().value;
      if (oldest !== undefined) {
        worktreeCacheMap.delete(oldest);
      }
    }
    worktreeCacheMap.set(effectiveCwd, root);
    return root;
  } catch {
    // Not in a git repository - do NOT cache fallback
    // so that if directory becomes a git repo later, we re-detect
    return null;
  }
}

/**
 * Validate that a path is safe (no traversal attacks).
 *
 * @throws Error if path contains traversal sequences
 */
export function validatePath(inputPath: string): void {
  // Reject explicit path traversal
  if (inputPath.includes('..')) {
    throw new Error(`Invalid path: path traversal not allowed (${inputPath})`);
  }

  // Reject absolute paths - use isAbsolute() for cross-platform coverage
  // Covers: /unix, ~/home, C:\windows, D:/windows, \\UNC
  if (inputPath.startsWith('~') || isAbsolute(inputPath)) {
    throw new Error(`Invalid path: absolute paths not allowed (${inputPath})`);
  }
}

// ============================================================================
// OMQ_STATE_DIR SUPPORT (Issue #1014)
// ============================================================================

/** Track which dual-dir warnings have been logged to avoid repeated warnings */
const dualDirWarnings = new Set<string>();

/** Track which workspace anchors have already had sibling-scan warnings emitted (once per process) */
const siblingRetrofitWarned = new Set<string>();

/**
 * Scan sibling subdirs of a workspace anchor for pre-existing .omq/state/ content.
 * Deduplicated per session via a disk marker so repeated hook firings within the
 * same session don't re-stat siblings or re-emit. A fresh session (new sessionId)
 * will re-warn — intentional, since the user may not have seen the prior warning.
 *
 * Call this once per session (e.g. from session-start.mjs) rather than on every
 * getOmqRoot() invocation to keep the hot path free of readdirSync calls.
 */
export function warnSiblingRetrofit(workspaceAnchor: string, sessionId?: string): void {
  if (siblingRetrofitWarned.has(workspaceAnchor)) return;

  // Persistent per-session disk dedupe
  const sharedOmq = join(workspaceAnchor, OmqPaths.ROOT);
  if (sessionId) {
    const markerPath = join(sharedOmq, 'state', `sibling-retrofit-warned-${sessionId}.json`);
    if (existsSync(markerPath)) {
      siblingRetrofitWarned.add(workspaceAnchor);
      return;
    }
  }

  siblingRetrofitWarned.add(workspaceAnchor);

  let entries: import('fs').Dirent<string>[];
  try {
    entries = readdirSync(workspaceAnchor, { withFileTypes: true, encoding: 'utf-8' }) as import('fs').Dirent<string>[];
  } catch {
    return;
  }

  const legacyDirs: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const entryName = entry.name as string;
    const siblingStateDir = join(workspaceAnchor, entryName, OmqPaths.ROOT, 'state');
    if (existsSync(siblingStateDir)) {
      legacyDirs.push(join(workspaceAnchor, entryName, OmqPaths.ROOT));
    }
  }

  if (legacyDirs.length === 0) return;

  const dirList = legacyDirs.map(d => `  - ${d}`).join('\n');
  process.stderr.write(
    `[omq] workspace-retrofit warning: .omq-workspace anchor found at ${workspaceAnchor}\n` +
    `  but sibling repos have pre-existing local .omq/state/ content:\n${dirList}\n` +
    `  Shared state will go to: ${sharedOmq}\n` +
    `  To migrate legacy state: OMQ_MIGRATE_LEGACY_STATE=1 omq setup\n` +
    `  Or manually copy state files to ${sharedOmq}/state/\n`
  );

  // Write disk marker so subsequent hook firings in the same session stay silent
  if (sessionId) {
    try {
      const stateDir = join(sharedOmq, 'state');
      if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true });
      const markerPath = join(stateDir, `sibling-retrofit-warned-${sessionId}.json`);
      writeFileSync(markerPath, JSON.stringify({ warnedAt: new Date().toISOString(), anchor: workspaceAnchor }));
    } catch {
      // Non-fatal — dedupe falls back to in-memory Set for this process
    }
  }
}

/**
 * Clear the sibling retrofit warning cache (useful for testing).
 * Also removes any disk markers under the given omqStateDir when provided.
 * @internal
 */
export function clearSiblingRetrofitWarnings(omqStateDir?: string): void {
  siblingRetrofitWarned.clear();
  if (omqStateDir) {
    try {
      const stateDir = join(omqStateDir, 'state');
      if (!existsSync(stateDir)) return;
      const entries = readdirSync(stateDir, { withFileTypes: true, encoding: 'utf-8' }) as import('fs').Dirent<string>[];
      for (const entry of entries) {
        const name = entry.name as string;
        if (name.startsWith('sibling-retrofit-warned-') && name.endsWith('.json')) {
          try { unlinkSync(join(stateDir, name)); } catch { /* non-fatal */ }
        }
      }
    } catch {
      // Non-fatal
    }
  }
}

/**
 * Clear the dual-directory warning cache (useful for testing).
 * @internal
 */
export function clearDualDirWarnings(): void {
  dualDirWarnings.clear();
}

/**
 * Get a stable project identifier for centralized state storage.
 *
 * Uses a hybrid strategy:
 * 1. Git remote URL hash (stable across worktrees and clones of the same repo)
 * 2. Fallback to worktree root path hash (for local-only repos without remotes)
 *
 * Format: `{dirName}-{hash}` where hash is first 16 chars of SHA-256.
 * Example: `my-project-a1b2c3d4e5f6g7h8`
 *
 * @param worktreeRoot - Optional worktree root path
 * @returns A stable project identifier string
 */
export function getProjectIdentifier(worktreeRoot?: string): string {
  const root = worktreeRoot || getWorktreeRoot() || process.cwd();

  // Workspace marker can supply a stable, user-controlled identifier.
  // This wins over git remote so multi-repo workspaces have one consistent ID.
  const workspaceRoot = findWorkspaceRoot(root);
  if (workspaceRoot) {
    const cfg = readWorkspaceMarkerConfig(workspaceRoot);
    if (cfg.id && typeof cfg.id === 'string' && cfg.id.trim()) {
      const safeId = cfg.id.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
      const hash = createHash('sha256').update(safeId).digest('hex').slice(0, 16);
      return `${safeId}-${hash}`;
    }
    // No explicit id — derive a stable identifier from the workspace path so
    // sibling subrepos inside the same workspace share one ID.
    const hash = createHash('sha256').update(workspaceRoot).digest('hex').slice(0, 16);
    const dirName = basename(workspaceRoot).replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${dirName}-${hash}`;
  }

  let source: string;
  try {
    const remoteUrl = execSync('git remote get-url origin', {
      cwd: root,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    source = remoteUrl || root;
  } catch {
    // No git remote (local-only repo or not a git repo) — use path
    source = root;
  }

  // For linked worktrees (created via `git worktree add`), resolve to the
  // primary repository root so all worktrees of the same repo produce the
  // same project identifier. Without this, sibling worktrees like
  // `repo.feature-x/` and `repo.feature-y/` would create separate state
  // directories despite sharing the same remote URL hash.
  let primaryRoot = root;
  try {
    const commonDir = execSync('git rev-parse --path-format=absolute --git-common-dir', {
      cwd: root,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    }).trim();
    // Only resolve when --git-common-dir points to a .git directory.
    // - Linked worktrees: returns <primary>/.git → dirname gives primary root ✓
    // - Submodules: returns <super>/.git/modules/<name> → skip (wrong parent)
    // - Bare repos: returns the repo root itself (no .git suffix) → skip
    //   (dirname would go up to the parent folder, colliding sibling repos)
    const isGitDir = basename(commonDir) === '.git';
    const isSubmodule = commonDir.includes(`${sep}.git${sep}modules`);
    if (isGitDir && !isSubmodule) {
      const resolved = dirname(commonDir);
      if (resolved && resolved !== root) {
        primaryRoot = resolved;
      }
    }
  } catch {
    // Not a git repo or command failed — fall back to worktree root
  }

  const hash = createHash('sha256').update(source).digest('hex').slice(0, 16);
  const dirName = basename(primaryRoot).replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${dirName}-${hash}`;
}

/**
 * Get the .omq root directory path.
 *
 * When OMQ_STATE_DIR is set, returns $OMQ_STATE_DIR/{project-identifier}/
 * instead of {worktree}/.omq/. This allows centralized state storage that
 * survives worktree deletion.
 *
 * @param worktreeRoot - Optional worktree root
 * @returns Absolute path to the omq root directory
 */
export function getOmqRoot(worktreeRoot?: string): string {
  const customDir = process.env.OMQ_STATE_DIR;
  if (customDir) {
    const root = worktreeRoot || getWorktreeRoot() || process.cwd();
    const projectId = getProjectIdentifier(root);
    const centralizedPath = join(customDir, projectId);

    // Log notice if both legacy .omq/ and new centralized dir exist
    const legacyPath = join(root, OmqPaths.ROOT);
    const warningKey = `${legacyPath}:${centralizedPath}`;
    if (!dualDirWarnings.has(warningKey) && existsSync(legacyPath) && existsSync(centralizedPath)) {
      dualDirWarnings.add(warningKey);
      console.warn(
        `[omq] Both legacy state dir (${legacyPath}) and centralized state dir (${centralizedPath}) exist. ` +
        `Using centralized dir. Consider migrating data from the legacy dir and removing it.`
      );
    }

    return centralizedPath;
  }

  // Workspace marker overrides git root resolution. This enables multi-repo
  // workspaces where the parent dir is not itself a git repo: all sub-repos
  // share the same .omq/ at the marker location.
  const workspaceAnchor = findWorkspaceRoot(worktreeRoot);
  if (workspaceAnchor) {
    return join(workspaceAnchor, OmqPaths.ROOT);
  }

  const root = worktreeRoot || getWorktreeRoot() || process.cwd();
  return join(root, OmqPaths.ROOT);
}

/**
 * Resolve a relative path under .omq/ to an absolute path.
 * Validates the path is within the omq boundary.
 *
 * @param relativePath - Path relative to .omq/ (e.g., "state/ralph.json")
 * @param worktreeRoot - Optional worktree root (auto-detected if not provided)
 * @returns Absolute path
 * @throws Error if path would escape omq boundary
 */
export function resolveOmqPath(relativePath: string, worktreeRoot?: string): string {
  validatePath(relativePath);

  const omqDir = getOmqRoot(worktreeRoot);
  const fullPath = normalize(resolve(omqDir, relativePath));

  // Verify resolved path is still under omq directory
  const relativeToOmq = relative(omqDir, fullPath);
  if (relativeToOmq.startsWith('..') || relativeToOmq.startsWith(sep + '..')) {
    throw new Error(`Path escapes omq boundary: ${relativePath}`);
  }

  return fullPath;
}

/**
 * Resolve a state file path.
 *
 * State files follow the naming convention: {mode}-state.json
 * Examples: ralph-state.json, ultrawork-state.json, autopilot-state.json
 *
 * @internal Scheduled for removal — new code should use resolveSessionStatePath.
 * @param stateName - State name (e.g., "ralph", "ultrawork", or "ralph-state")
 * @param worktreeRoot - Optional worktree root
 * @returns Absolute path to state file
 */
export function resolveStatePath(stateName: string, worktreeRoot?: string): string {
  // Normalize: ensure -state suffix is present, then add .json
  const normalizedName = stateName.endsWith('-state') ? stateName : `${stateName}-state`;
  return resolveOmqPath(`state/${normalizedName}.json`, worktreeRoot);
}

/**
 * Ensure a directory exists under .omq/.
 * Creates parent directories as needed.
 *
 * @param relativePath - Path relative to .omq/
 * @param worktreeRoot - Optional worktree root
 * @returns Absolute path to the created directory
 */
export function ensureOmqDir(relativePath: string, worktreeRoot?: string): string {
  const fullPath = resolveOmqPath(relativePath, worktreeRoot);

  if (!existsSync(fullPath)) {
    try {
      mkdirSync(fullPath, { recursive: true });
    } catch (err) {
      // On Windows, concurrent hooks can race past the existsSync check and
      // throw EEXIST. Safe to ignore — see atomic-write.ts:ensureDirSync.
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
  }

  return fullPath;
}

/**
 * Get the absolute path to the notepad file.
 * NOTE: Named differently from hooks/notepad/getNotepadPath which takes `directory` (required).
 * This version auto-detects worktree root.
 */
export function getWorktreeNotepadPath(worktreeRoot?: string): string {
  return join(getOmqRoot(worktreeRoot), 'notepad.md');
}

/**
 * Get the absolute path to the project memory file.
 */
export function getWorktreeProjectMemoryPath(worktreeRoot?: string): string {
  return join(getOmqRoot(worktreeRoot), 'project-memory.json');
}

/**
 * Resolve a plan file path.
 * @param planName - Plan name (without .md extension)
 */
export function resolvePlanPath(planName: string, worktreeRoot?: string): string {
  validatePath(planName);
  return join(getOmqRoot(worktreeRoot), 'plans', `${planName}.md`);
}

/**
 * Resolve a research directory path.
 * @param name - Research folder name
 */
export function resolveResearchPath(name: string, worktreeRoot?: string): string {
  validatePath(name);
  return join(getOmqRoot(worktreeRoot), 'research', name);
}

/**
 * Resolve the logs directory path.
 */
export function resolveLogsPath(worktreeRoot?: string): string {
  return join(getOmqRoot(worktreeRoot), 'logs');
}

/**
 * Resolve a wisdom/plan-scoped notepad directory path.
 * @param planName - Plan name for the scoped notepad
 */
export function resolveWisdomPath(planName: string, worktreeRoot?: string): string {
  validatePath(planName);
  return join(getOmqRoot(worktreeRoot), 'notepads', planName);
}

/**
 * Check if an absolute path is under the .omq directory.
 * @param absolutePath - Absolute path to check
 */
export function isPathUnderOmq(absolutePath: string, worktreeRoot?: string): boolean {
  const omqRoot = getOmqRoot(worktreeRoot);
  const normalizedPath = normalize(absolutePath);
  const normalizedOmq = normalize(omqRoot);
  return normalizedPath.startsWith(normalizedOmq + sep) || normalizedPath === normalizedOmq;
}

/**
 * Ensure all standard .omq subdirectories exist.
 */
export function ensureAllOmqDirs(worktreeRoot?: string): void {
  const omqRoot = getOmqRoot(worktreeRoot);
  const subdirs = ['', 'state', 'plans', 'research', 'logs', 'notepads', 'drafts'];
  for (const subdir of subdirs) {
    const fullPath = subdir ? join(omqRoot, subdir) : omqRoot;
    if (!existsSync(fullPath)) {
      try {
        mkdirSync(fullPath, { recursive: true });
      } catch (err) {
        // On Windows, concurrent hooks can race past the existsSync check and
        // throw EEXIST. Safe to ignore — see atomic-write.ts:ensureDirSync.
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      }
    }
  }
}

/**
 * Clear the worktree cache (useful for testing).
 */
export function clearWorktreeCache(): void {
  worktreeCacheMap.clear();
  workspaceCacheMap.clear();
}

// ============================================================================
// SESSION-SCOPED STATE PATHS
// ============================================================================

/** Regex for valid session IDs: alphanumeric, hyphens, underscores, max 256 chars */
const SESSION_ID_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,255}$/;

// ============================================================================
// AUTOMATIC PROCESS SESSION ID (Issue #456)
// ============================================================================

/**
 * Auto-generated session ID for the current process.
 * Uses PID + process start timestamp to be unique even if PIDs are reused.
 * Generated once at module load time and stable for the process lifetime.
 */
let processSessionId: string | null = null;

/**
 * Get or generate a unique session ID for the current process.
 *
 * Format: `pid-{PID}-{startTimestamp}`
 * Example: `pid-12345-1707350400000`
 *
 * This prevents concurrent Qoder CLI instances in the same repo from
 * sharing state files (Issue #456). The ID is stable for the process
 * lifetime and unique across concurrent processes.
 *
 * @returns A unique session ID for the current process
 */
export function getProcessSessionId(): string {
  if (!processSessionId) {
    // process.pid is unique among concurrent processes.
    // Adding a timestamp handles PID reuse after process exit.
    const pid = process.pid;
    const startTime = Date.now();
    processSessionId = `pid-${pid}-${startTime}`;
  }
  return processSessionId;
}

/**
 * Reset the process session ID (for testing only).
 * @internal
 */
export function resetProcessSessionId(): void {
  processSessionId = null;
}

/**
 * Validate a session ID to prevent path traversal attacks.
 *
 * @param sessionId - The session ID to validate
 * @throws Error if session ID is invalid
 */
export function validateSessionId(sessionId: string): void {
  if (!sessionId) {
    throw new Error('Session ID cannot be empty');
  }
  if (sessionId.includes('..') || sessionId.includes('/') || sessionId.includes('\\')) {
    throw new Error(`Invalid session ID: path traversal not allowed (${sessionId})`);
  }
  if (!SESSION_ID_REGEX.test(sessionId)) {
    throw new Error(`Invalid session ID: must be alphanumeric with hyphens/underscores, max 256 chars (${sessionId})`);
  }
}

/**
 * Validate a transcript path to prevent arbitrary file reads.
 * Transcript files should only be read from known Claude directories.
 *
 * @param transcriptPath - The transcript path to validate
 * @returns true if path is valid, false otherwise
 */
export function isValidTranscriptPath(transcriptPath: string): boolean {
  if (!transcriptPath || typeof transcriptPath !== 'string') {
    return false;
  }

  // Reject path traversal
  if (transcriptPath.includes('..')) {
    return false;
  }

  // Must be absolute
  if (!isAbsolute(transcriptPath) && !transcriptPath.startsWith('~')) {
    return false;
  }

  // Expand home directory if present
  let expandedPath = transcriptPath;
  if (transcriptPath.startsWith('~')) {
    expandedPath = join(homedir(), transcriptPath.slice(1));
  }

  // Normalize and check it's within allowed directories
  const normalized = normalize(expandedPath);
  const home = homedir();

  // Allowed: [$QODER_CONFIG_DIR|~/.qoder], ~/.omq/..., system temp dir
  const allowedPrefixes = [
    getQoderConfigDir(),
    join(home, '.omq'),
    tmpdir(), // honors $TMPDIR; covers /tmp and macOS /var/folders defaults
    '/tmp',
    '/var/folders', // macOS temp
  ];

  return allowedPrefixes.some((prefix) => {
    const rel = relative(prefix, normalized);
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
  });
}


/**
 * Resolve a session-scoped state file path.
 * Path: {omqRoot}/state/sessions/{sessionId}/{mode}-state.json
 *
 * @param stateName - State name (e.g., "ralph", "ultrawork")
 * @param sessionId - Session identifier
 * @param worktreeRoot - Optional worktree root
 * @returns Absolute path to session-scoped state file
 */
export function resolveSessionStatePath(stateName: string, sessionId: string, worktreeRoot?: string): string {
  validateSessionId(sessionId);

  const normalizedName = stateName.endsWith('-state') ? stateName : `${stateName}-state`;
  return resolveOmqPath(`state/sessions/${sessionId}/${normalizedName}.json`, worktreeRoot);
}

// ============================================================================
// SessionStatePaths — branded struct return (multi-repo Wave A)
// ============================================================================

/**
 * Branded path types prevent silently passing a read-only fallback path to a
 * writer (or vice versa) across 19+ call sites. The brand is intentionally
 * structural-only (no runtime cost) — TS-level discrimination.
 *
 * Producer of the brand: `resolveSessionStatePaths()` exclusively.
 * Consumers (writeModeState / readModeState etc.) accept only the branded
 * variant for their direction, so a hook that grabs `effectiveRead` when it
 * meant `effectiveWrite` becomes a compile-time error.
 */
export type ReadPath = string & { readonly __brand: 'ReadPath' };
export type WritePath = string & { readonly __brand: 'WritePath' };

/**
 * Resolved paths for a session-scoped state file. Both `effectiveRead` and
 * `effectiveWrite` point to the session-scoped path.
 *
 * Fields:
 *  - `sessionScoped`: `.omq/state/sessions/{sessionId}/{name}.json`.
 *  - `effectiveRead`: brand-typed path the caller should READ from.
 *  - `effectiveWrite`: brand-typed path the caller should WRITE to.
 */
export interface SessionStatePaths {
  sessionScoped: string;
  effectiveRead: ReadPath;
  effectiveWrite: WritePath;
}

/**
 * Canonical session-scoped state path resolver. Returns a branded struct so
 * callers cannot accidentally write to the read-fallback path.
 *
 * Requires a sessionId — falls back to getProcessSessionId() when absent.
 */
export function resolveSessionStatePaths(
  stateName: string,
  sessionId?: string,
  worktreeRoot?: string,
): SessionStatePaths {
  const normalizedName = stateName.endsWith('-state') ? stateName : `${stateName}-state`;
  const sid = sessionId || getProcessSessionId();
  validateSessionId(sid);
  const sessionScoped = resolveOmqPath(`state/sessions/${sid}/${normalizedName}.json`, worktreeRoot);
  return {
    sessionScoped,
    effectiveRead: sessionScoped as ReadPath,
    effectiveWrite: sessionScoped as WritePath,
  };
}

/**
 * Get the session state directory path.
 * Path: {omqRoot}/state/sessions/{sessionId}/
 *
 * @param sessionId - Session identifier
 * @param worktreeRoot - Optional worktree root
 * @returns Absolute path to session state directory
 */
export function getSessionStateDir(sessionId: string, worktreeRoot?: string): string {
  validateSessionId(sessionId);
  return join(getOmqRoot(worktreeRoot), 'state', 'sessions', sessionId);
}

/**
 * List all session IDs that have state directories.
 *
 * @param worktreeRoot - Optional worktree root
 * @returns Array of session IDs
 */
export function listSessionIds(worktreeRoot?: string): string[] {
  const sessionsDir = join(getOmqRoot(worktreeRoot), 'state', 'sessions');

  if (!existsSync(sessionsDir)) {
    return [];
  }

  try {
    const entries = readdirSync(sessionsDir, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory() && SESSION_ID_REGEX.test(entry.name))
      .map(entry => entry.name);
  } catch {
    return [];
  }
}

/**
 * Ensure the session state directory exists.
 *
 * @param sessionId - Session identifier
 * @param worktreeRoot - Optional worktree root
 * @returns Absolute path to the session state directory
 */
export function ensureSessionStateDir(sessionId: string, worktreeRoot?: string): string {
  const sessionDir = getSessionStateDir(sessionId, worktreeRoot);

  if (!existsSync(sessionDir)) {
    try {
      mkdirSync(sessionDir, { recursive: true });
    } catch (err) {
      // On Windows, concurrent hooks can race past the existsSync check and
      // throw EEXIST. Safe to ignore — see atomic-write.ts:ensureDirSync.
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
  }

  return sessionDir;
}

/**
 * Resolve a directory path to its git worktree root.
 *
 * Walks up from `directory` using `git rev-parse --show-toplevel`.
 * Falls back to `getWorktreeRoot(process.cwd())`, then `process.cwd()`.
 *
 * This ensures .omq/ state is always written at the worktree root,
 * even when called from a subdirectory (fixes #576).
 *
 * @param directory - Any directory inside a git worktree (optional)
 * @returns The worktree root (never a subdirectory)
 */
export function resolveToWorktreeRoot(directory?: string): string {
  if (directory) {
    const resolved = resolve(directory);
    const root = getWorktreeRoot(resolved);
    if (root) return root;

    console.error('[worktree] non-git directory provided, falling back to process root', {
      directory: resolved,
    });
  }
  // Fallback: derive from process CWD (the MCP server / CLI entry point)
  return getWorktreeRoot(process.cwd()) || process.cwd();
}

// ============================================================================
// TRANSCRIPT PATH RESOLUTION (Issue #1094)
// ============================================================================

/**
 * Resolve a Qoder CLI transcript path that may be mismatched in worktree sessions.
 *
 * When Qoder CLI runs inside a worktree (.qoder/worktrees/X), it encodes the
 * worktree CWD into the project directory path, creating a transcript_path like:
 *   ~/.qoder/projects/-path-to-project--claude-worktrees-X/<session>.jsonl
 *
 * But the actual transcript lives at the original project's path:
 *   ~/.qoder/projects/-path-to-project/<session>.jsonl
 *
 * Qoder CLI encodes `/` and `.` as `-`. The `.qoder/worktrees/`
 * segment becomes `-claude-worktrees-`, preceded by a `-` from the path
 * separator, yielding the distinctive `--claude-worktrees-` pattern in the
 * encoded directory name.
 *
 * This function detects the mismatch and resolves to the correct path.
 *
 * @param transcriptPath - The transcript_path from Qoder CLI hook input
 * @param cwd - Optional CWD for fallback detection
 * @returns The resolved transcript path (original if already correct or no resolution found)
 */
export function resolveTranscriptPath(transcriptPath: string | undefined, cwd?: string): string | undefined {
  if (!transcriptPath) return undefined;

  // Fast path: if the file already exists, no resolution needed
  if (existsSync(transcriptPath)) return transcriptPath;

  // Strategy 1: Detect worktree-encoded segment in the transcript path itself.
  // The pattern `--claude-worktrees-` appears when Qoder CLI encodes a CWD
  // containing `/.qoder/worktrees/` (separator `/` → `-`, dot `.` → `-`).
  // Strip everything from this pattern to the next `/` to recover the original
  // project directory encoding.
  const worktreeSegmentPattern = /--claude-worktrees-[^/\\]+/;
  if (worktreeSegmentPattern.test(transcriptPath)) {
    const resolved = transcriptPath.replace(worktreeSegmentPattern, '');
    if (existsSync(resolved)) return resolved;
  }

  // Strategy 2: Use CWD to detect worktree and reconstruct the path.
  // When the CWD contains `/.qoder/worktrees/`, we can derive the main
  // project root and look for the transcript there.
  const effectiveCwd = cwd || process.cwd();
  const worktreeMarker = '.qoder/worktrees/';
  const markerIdx = effectiveCwd.indexOf(worktreeMarker);
  if (markerIdx !== -1) {
    // Adjust index to exclude the preceding path separator
    const mainProjectRoot = effectiveCwd.substring(
      0,
      markerIdx > 0 && effectiveCwd[markerIdx - 1] === sep ? markerIdx - 1 : markerIdx,
    );

    // Extract session filename from the original path
    const lastSep = transcriptPath.lastIndexOf('/');
    const sessionFile = lastSep !== -1 ? transcriptPath.substring(lastSep + 1) : '';
    if (sessionFile) {
      // The projects directory is under the Claude config dir
      const projectsDir = join(getQoderConfigDir(), 'projects');

      if (existsSync(projectsDir)) {
        // Encode the main project root the same way Qoder CLI does:
        // replace path separators with `-`, replace dots with `-`.
        const encodedMain = mainProjectRoot.replace(/[/\\.]/g, '-');
        const resolvedPath = join(projectsDir, encodedMain, sessionFile);
        if (existsSync(resolvedPath)) return resolvedPath;
      }
    }
  }

  // Strategy 3: Detect native git worktree via git-common-dir.
  // When CWD is a linked worktree (created by `git worktree add`), the
  // transcript path encodes the worktree CWD, but the file lives under
  // the main repo's encoded path. Use `git rev-parse --git-common-dir`
  // to find the main repo root and re-encode.
  try {
    const gitCommonDir = execSync('git rev-parse --git-common-dir', {
      cwd: effectiveCwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const absoluteCommonDir = resolve(effectiveCwd, gitCommonDir);
    // For linked worktrees, git-common-dir is <repo>/.git/worktrees/<name>
    // so dirname gives <repo>/.git/worktrees — navigate up to the actual repo root
    let mainRepoRoot = dirname(absoluteCommonDir);
    if (mainRepoRoot.endsWith(join('.git', 'worktrees'))) {
      mainRepoRoot = dirname(dirname(mainRepoRoot));
    }
    // Resolve symlinks for consistent comparison (e.g. /tmp -> /private/tmp on macOS,
    // ecryptfs $HOME on Linux, autofs /home, etc.)
    try { mainRepoRoot = realpathSync(mainRepoRoot); } catch { /* keep as-is */ }

    const worktreeTop = execSync('git rev-parse --show-toplevel', {
      cwd: effectiveCwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    if (mainRepoRoot !== worktreeTop) {
      const lastSep = transcriptPath.lastIndexOf('/');
      const sessionFile = lastSep !== -1 ? transcriptPath.substring(lastSep + 1) : '';
      if (sessionFile) {
        const projectsDir = join(getQoderConfigDir(), 'projects');
        if (existsSync(projectsDir)) {
          const encodedMain = mainRepoRoot.replace(/[/\\.]/g, '-');
          const resolvedPath = join(projectsDir, encodedMain, sessionFile);
          if (existsSync(resolvedPath)) return resolvedPath;
        }
      }
    }
  } catch {
    // Not in a git repo or git not available — skip
  }

  // No resolution found — return original path.
  // Callers should handle non-existent paths gracefully.
  return transcriptPath;
}

/**
 * Validate that a workingDirectory is within the trusted worktree root.
 * The trusted root is derived from process.cwd(), NOT from user input.
 *
 * Always returns a git worktree root — never a subdirectory.
 * This prevents .omq/state/ from being created in subdirectories (#576).
 *
 * @param workingDirectory - User-supplied working directory
 * @returns The validated worktree root
 * @throws Error if workingDirectory is outside trusted root
 */
export function validateWorkingDirectory(workingDirectory?: string): string {
  const trustedRoot = getWorktreeRoot(process.cwd()) || process.cwd();

  if (!workingDirectory) {
    return trustedRoot;
  }

  // Resolve to absolute
  const resolved = resolve(workingDirectory);

  let trustedRootReal: string;
  try {
    trustedRootReal = realpathSync(trustedRoot);
  } catch {
    trustedRootReal = trustedRoot;
  }

  // Try to resolve the provided directory to a git worktree root.
  const providedRoot = getWorktreeRoot(resolved);

  if (providedRoot) {
    // Git resolution succeeded — require exact worktree identity.
    let providedRootReal: string;
    try {
      providedRootReal = realpathSync(providedRoot);
    } catch {
      throw new Error(`workingDirectory '${workingDirectory}' does not exist or is not accessible.`);
    }

    if (providedRootReal !== trustedRootReal) {
      console.error('[worktree] workingDirectory resolved to different git worktree root, using trusted root', {
        workingDirectory: resolved,
        providedRoot: providedRootReal,
        trustedRoot: trustedRootReal,
      });
      return trustedRoot;
    }

    return providedRoot;
  }

  // Git resolution failed (lock contention, env issues, non-repo dir).
  // Validate that the raw directory is under the trusted root before falling
  // back — otherwise reject it as truly outside (#576).
  let resolvedReal: string;
  try {
    resolvedReal = realpathSync(resolved);
  } catch {
    throw new Error(`workingDirectory '${workingDirectory}' does not exist or is not accessible.`);
  }

  const rel = relative(trustedRootReal, resolvedReal);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`workingDirectory '${workingDirectory}' is outside the trusted worktree root '${trustedRoot}'.`);
  }

  // Directory is under trusted root but git failed — return trusted root,
  // never the subdirectory, to prevent .omq/ creation in subdirs (#576).
  return trustedRoot;
}

function getGitCommonDir(cwd: string): string | null {
  try {
    const commonDir = execSync('git rev-parse --path-format=absolute --git-common-dir', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    }).trim();
    return realpathSync(commonDir);
  } catch {
    return null;
  }
}

/**
 * Validate a workingDirectory while permitting linked git worktrees for the
 * same repository.
 *
 * This preserves validateWorkingDirectory's default cwd behavior and its
 * same-root/subdirectory normalization, but allows a per-call directory to
 * resolve to a sibling manual `git worktree` when both worktrees share the
 * same git common directory. Other unrelated git repositories still fall back
 * to the trusted startup cwd, and non-repo paths outside the trusted root are
 * rejected.
 */
export function validateWorkingDirectoryOrLinkedWorktree(workingDirectory?: string): string {
  const trustedRoot = getWorktreeRoot(process.cwd()) || process.cwd();

  if (!workingDirectory) {
    return trustedRoot;
  }

  const resolved = resolve(workingDirectory);

  let trustedRootReal: string;
  try {
    trustedRootReal = realpathSync(trustedRoot);
  } catch {
    trustedRootReal = trustedRoot;
  }

  const providedRoot = getWorktreeRoot(resolved);

  if (providedRoot) {
    let providedRootReal: string;
    try {
      providedRootReal = realpathSync(providedRoot);
    } catch {
      throw new Error(`workingDirectory '${workingDirectory}' does not exist or is not accessible.`);
    }

    if (providedRootReal === trustedRootReal) {
      return providedRoot;
    }

    const trustedCommonDir = getGitCommonDir(trustedRoot);
    const providedCommonDir = getGitCommonDir(providedRoot);
    if (trustedCommonDir && providedCommonDir && providedCommonDir === trustedCommonDir) {
      return providedRoot;
    }

    console.error('[worktree] workingDirectory resolved to different git worktree root, using trusted root', {
      workingDirectory: resolved,
      providedRoot: providedRootReal,
      trustedRoot: trustedRootReal,
    });
    return trustedRoot;
  }

  let resolvedReal: string;
  try {
    resolvedReal = realpathSync(resolved);
  } catch {
    throw new Error(`workingDirectory '${workingDirectory}' does not exist or is not accessible.`);
  }

  const rel = relative(trustedRootReal, resolvedReal);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`workingDirectory '${workingDirectory}' is outside the trusted worktree root '${trustedRoot}'.`);
  }

  return trustedRoot;
}
