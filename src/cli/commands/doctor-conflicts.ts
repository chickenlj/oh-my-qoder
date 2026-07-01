/**
 * Conflict diagnostic command
 * Scans for and reports plugin coexistence issues.
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { basename, dirname, join } from 'path';
import { getQoderConfigDir } from '../../utils/config-dir.js';
import { isOmqHook } from '../../installer/index.js';
import { colors } from '../utils/formatting.js';
import { getSkillsDir, listBuiltinSkillNames } from '../../features/builtin-skills/skills.js';
import { inspectUnifiedMcpRegistrySync } from '../../installer/mcp-registry.js';
import { findWorkspaceRoot, WORKSPACE_MARKER } from '../../lib/worktree-paths.js';

export interface WorkspaceMarkerStatus {
  /** Absolute path to the directory containing .omq-workspace, or null if absent. */
  markerRoot: string | null;
  /** True when OMQ_STATE_DIR env var is set. */
  stateDirEnvSet: boolean;
  /** Value of OMQ_STATE_DIR, or null when unset. */
  stateDirEnvValue: string | null;
  /** When both OMQ_STATE_DIR and .omq-workspace are active, this is true (warn: OMQ_STATE_DIR wins). */
  precedenceConflict: boolean;
}

export interface ConflictReport {
  hookConflicts: { event: string; command: string; isOmq: boolean }[];
  claudeMdStatus: { hasMarkers: boolean; hasUserContent: boolean; path: string; companionFile?: string } | null;
  legacySkills: { name: string; path: string }[];
  envFlags: { disableOmq: boolean; skipHooks: string[] };
  configIssues: { unknownFields: string[] };
  windowsUnsafePluginHooks: { pluginRoot: string; event: string; command: string }[];
  mcpRegistrySync: ReturnType<typeof inspectUnifiedMcpRegistrySync>;
  workspaceMarker: WorkspaceMarkerStatus;
  hasConflicts: boolean;
}

/**
 * Collect hook entries from a single settings.json file.
 */
function collectHooksFromSettings(settingsPath: string): ConflictReport['hookConflicts'] {
  const conflicts: ConflictReport['hookConflicts'] = [];

  if (!existsSync(settingsPath)) {
    return conflicts;
  }

  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    const hooks = settings.hooks || {};

    // Hook events to check
    const hookEvents = [
      'PreToolUse',
      'PostToolUse',
      'Stop',
      'SessionStart',
      'SessionEnd',
      'UserPromptSubmit'
    ];

    for (const event of hookEvents) {
      if (hooks[event] && Array.isArray(hooks[event])) {
        const eventHookGroups = hooks[event] as Array<{ hooks?: Array<{ type?: string; command?: string }> }>;
        for (const group of eventHookGroups) {
          if (!group.hooks || !Array.isArray(group.hooks)) continue;
          for (const hook of group.hooks) {
            if (hook.type === 'command' && hook.command) {
              conflicts.push({ event, command: hook.command, isOmq: isOmqHook(hook.command) });
            }
          }
        }
      }
    }
  } catch (_error) {
    // Ignore parse errors, will be reported separately
  }

  return conflicts;
}

/**
 * Check for hook conflicts in both profile-level (~/.qoder/settings.json)
 * and project-level (./.qoder/settings.json).
 *
 * Qoder CLI settings precedence: project > profile > defaults.
 * We check both levels so the diagnostic is complete.
 */
export function checkHookConflicts(): ConflictReport['hookConflicts'] {
  const profileSettingsPath = join(getQoderConfigDir(), 'settings.json');
  const projectSettingsPath = join(process.cwd(), '.claude', 'settings.json');

  const profileHooks = collectHooksFromSettings(profileSettingsPath);
  const projectHooks = collectHooksFromSettings(projectSettingsPath);

  // Deduplicate by event+command (same hook in both levels should appear once)
  const seen = new Set<string>();
  const merged: ConflictReport['hookConflicts'] = [];

  for (const hook of [...projectHooks, ...profileHooks]) {
    const key = `${hook.event}::${hook.command}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(hook);
    }
  }

  return merged;
}

function isWindowsUnsafePluginHookCommand(command: string): boolean {
  return command.includes('find-node.sh')
    || command.includes('/bin/sh')
    || /^sh\s/.test(command);
}

/**
 * Native Windows cannot execute plugin hooks that still route through sh/find-node.
 * Detect stale cache manifests so doctor can point users at setup/update repair
 * instead of reporting a generic hook conflict.
 */
export function checkWindowsUnsafePluginHooks(): ConflictReport['windowsUnsafePluginHooks'] {
  if (process.platform !== 'win32') {
    return [];
  }

  const roots = [process.env.QODER_PLUGIN_ROOT, ...readInstalledPluginRoots()]
    .filter((root): root is string => typeof root === 'string' && root.length > 0);
  const seenRoots = new Set<string>();
  const unsafe: ConflictReport['windowsUnsafePluginHooks'] = [];

  for (const pluginRoot of roots) {
    if (seenRoots.has(pluginRoot)) continue;
    seenRoots.add(pluginRoot);

    const hooksJsonPath = join(pluginRoot, 'hooks', 'hooks.json');
    if (!existsSync(hooksJsonPath)) continue;

    try {
      const parsed = JSON.parse(readFileSync(hooksJsonPath, 'utf-8')) as {
        hooks?: Record<string, Array<{ hooks?: Array<{ type?: string; command?: string }> }>>;
      };

      for (const [event, groups] of Object.entries(parsed.hooks ?? {})) {
        for (const group of groups) {
          for (const hook of group.hooks ?? []) {
            if (hook.type !== 'command' || typeof hook.command !== 'string') continue;
            if (isWindowsUnsafePluginHookCommand(hook.command)) {
              unsafe.push({ pluginRoot, event, command: hook.command });
            }
          }
        }
      }
    } catch {
      // Ignore unreadable manifests; doctor should remain best-effort.
    }
  }

  return unsafe;
}

/**
 * Check a single file for OMQ markers.
 * Returns { hasMarkers, hasUserContent } or null on error.
 */
function checkFileForOmqMarkers(filePath: string): { hasMarkers: boolean; hasUserContent: boolean } | null {
  if (!existsSync(filePath)) return null;
  try {
    const content = readFileSync(filePath, 'utf-8');
    const hasStartMarker = content.includes('<!-- OMQ:START -->');
    const hasEndMarker = content.includes('<!-- OMQ:END -->');
    const hasMarkers = hasStartMarker && hasEndMarker;

    let hasUserContent = false;
    if (hasMarkers) {
      const startIdx = content.indexOf('<!-- OMQ:START -->');
      const endIdx = content.indexOf('<!-- OMQ:END -->');
      const beforeMarker = content.substring(0, startIdx).trim();
      const afterMarker = content.substring(endIdx + '<!-- OMQ:END -->'.length).trim();
      hasUserContent = beforeMarker.length > 0 || afterMarker.length > 0;
    } else {
      hasUserContent = content.trim().length > 0;
    }
    return { hasMarkers, hasUserContent };
  } catch {
    return null;
  }
}

/**
 * Find companion AGENTS-*.md files in the config directory.
 * These are files like AGENTS-omq.md that users create as part of a
 * file-split pattern to keep OMQ config separate from their own AGENTS.md.
 */
function findCompanionClaudeMdFiles(configDir: string): string[] {
  try {
    return readdirSync(configDir)
      .filter(f => /^AGENTS-.+\.md$/i.test(f))
      .map(f => join(configDir, f));
  } catch {
    return [];
  }
}

/**
 * Check AGENTS.md for OMQ markers and user content.
 * Also checks companion files (AGENTS-omq.md, etc.) for the file-split pattern
 * where users keep OMQ config in a separate file.
 */
export function checkClaudeMdStatus(): ConflictReport['claudeMdStatus'] {
  const configDir = getQoderConfigDir();
  const claudeMdPath = join(configDir, 'AGENTS.md');

  if (!existsSync(claudeMdPath)) {
    return null;
  }

  try {
    // Check the main AGENTS.md first
    const mainResult = checkFileForOmqMarkers(claudeMdPath);
    if (!mainResult) return null;

    if (mainResult.hasMarkers) {
      return {
        hasMarkers: true,
        hasUserContent: mainResult.hasUserContent,
        path: claudeMdPath
      };
    }

    // No markers in main file - check companion files (file-split pattern)
    const companions = findCompanionClaudeMdFiles(configDir);
    for (const companionPath of companions) {
      const companionResult = checkFileForOmqMarkers(companionPath);
      if (companionResult?.hasMarkers) {
        return {
          hasMarkers: true,
          hasUserContent: mainResult.hasUserContent,
          path: claudeMdPath,
          companionFile: companionPath
        };
      }
    }

    // No markers in main or companions - check if AGENTS.md references a companion
    const content = readFileSync(claudeMdPath, 'utf-8');
    const companionRefPattern = /AGENTS-[^\s)]+\.md/i;
    const refMatch = content.match(companionRefPattern);
    if (refMatch) {
      // AGENTS.md references a companion file but it doesn't have markers yet
      return {
        hasMarkers: false,
        hasUserContent: mainResult.hasUserContent,
        path: claudeMdPath,
        companionFile: join(configDir, refMatch[0])
      };
    }

    return {
      hasMarkers: false,
      hasUserContent: mainResult.hasUserContent,
      path: claudeMdPath
    };
  } catch (_error) {
    return null;
  }
}

/**
 * Check environment flags that affect OMQ behavior
 */
export function checkEnvFlags(): ConflictReport['envFlags'] {
  const disableOmq = process.env.DISABLE_OMQ === 'true' || process.env.DISABLE_OMQ === '1';
  const skipHooks: string[] = [];

  if (process.env.OMQ_SKIP_HOOKS) {
    skipHooks.push(...process.env.OMQ_SKIP_HOOKS.split(',').map(h => h.trim()));
  }

  return { disableOmq, skipHooks };
}

const SETUP_FALLBACK_SKILL_NAMES = new Set(['omq-reference']);

function parseSemverLikeVersion(version: string): number[] | null {
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    return null;
  }

  return version.split(/[+-]/, 1)[0].split('.').map(part => Number.parseInt(part, 10));
}

function compareSemverLikeVersions(a: string, b: string): number {
  const parsedA = parseSemverLikeVersion(a);
  const parsedB = parseSemverLikeVersion(b);
  if (!parsedA || !parsedB) {
    return 0;
  }

  for (let index = 0; index < 3; index += 1) {
    const delta = parsedA[index] - parsedB[index];
    if (delta !== 0) {
      return delta;
    }
  }

  return 0;
}

function isValidSetupPluginRoot(pluginRoot: string): boolean {
  return existsSync(join(pluginRoot, 'docs', 'CLAUDE.md'));
}

function readInstalledPluginRoots(): string[] {
  const installedPluginsPath = join(getQoderConfigDir(), 'plugins', 'installed_plugins.json');
  if (!existsSync(installedPluginsPath)) {
    return [];
  }

  try {
    const parsed = JSON.parse(readFileSync(installedPluginsPath, 'utf-8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return [];
    }

    const plugins = 'plugins' in parsed
      && parsed.plugins
      && typeof parsed.plugins === 'object'
      && !Array.isArray(parsed.plugins)
      ? parsed.plugins as Record<string, unknown>
      : parsed as Record<string, unknown>;

    return Object.entries(plugins)
      .filter(([key]) => key.startsWith('oh-my-qoder'))
      .flatMap(([, value]) => Array.isArray(value) ? value : [])
      .map(entry => entry && typeof entry === 'object' && 'installPath' in entry
        ? (entry as { installPath?: unknown }).installPath
        : null)
      .filter((installPath): installPath is string => typeof installPath === 'string' && installPath.length > 0);
  } catch {
    return [];
  }
}

function findLatestSiblingPluginRoot(pluginRoot: string): string | null {
  const cacheBase = dirname(pluginRoot);
  if (!existsSync(cacheBase)) {
    return null;
  }

  try {
    return readdirSync(cacheBase)
      .filter(entry => parseSemverLikeVersion(entry))
      .map(entry => join(cacheBase, entry))
      .filter(isValidSetupPluginRoot)
      .sort((a, b) => compareSemverLikeVersions(basename(b), basename(a)))[0] || null;
  } catch {
    return null;
  }
}

function getSetupFallbackCanonicalSkillPaths(baseName: string): string[] {
  const currentSkillsDir = getSkillsDir();
  const currentPluginRoot = dirname(currentSkillsDir);
  const roots = [
    currentPluginRoot,
    process.env.QODER_PLUGIN_ROOT,
    ...readInstalledPluginRoots(),
  ].filter((root): root is string => typeof root === 'string' && root.length > 0);

  for (const root of [...roots]) {
    const latestSibling = findLatestSiblingPluginRoot(root);
    if (latestSibling) {
      roots.push(latestSibling);
    }
  }

  const seen = new Set<string>();
  return [
    join(currentSkillsDir, baseName, 'SKILL.md'),
    ...roots.flatMap(root => [join(root, 'skills', baseName, 'SKILL.md')]),
  ]
    .filter(path => {
      if (seen.has(path)) {
        return false;
      }
      seen.add(path);
      return true;
    });
}

function isSupportedSetupFallbackSkill(legacySkillsDir: string, entry: string, baseName: string): boolean {
  if (!SETUP_FALLBACK_SKILL_NAMES.has(baseName)) {
    return false;
  }

  // scripts/setup-agents-md.sh intentionally syncs the raw bundled
  // skills/omq-reference/SKILL.md file into ~/.qoder/skills/omq-reference/SKILL.md
  // as a Qoder CLI fallback. Suppress only that exact, unmodified sync so real
  // legacy collisions and user-edited omq-reference copies still surface.
  if (entry.toLowerCase() !== baseName) {
    return false;
  }

  const installedSkillPath = join(legacySkillsDir, entry, 'SKILL.md');
  if (!existsSync(installedSkillPath)) {
    return false;
  }

  try {
    const installedContent = readFileSync(installedSkillPath, 'utf-8');
    return getSetupFallbackCanonicalSkillPaths(baseName).some(canonicalSkillPath => (
      existsSync(canonicalSkillPath)
      && installedContent === readFileSync(canonicalSkillPath, 'utf-8')
    ));
  } catch {
    return false;
  }
}

/**
 * Check for legacy curl-installed skills that collide with plugin skill names.
 * Only flags skills whose names match actual installed plugin skills, avoiding
 * false positives for user's custom skills.
 */
export function checkLegacySkills(): ConflictReport['legacySkills'] {
  const legacySkillsDir = join(getQoderConfigDir(), 'skills');
  if (!existsSync(legacySkillsDir)) return [];

  const collisions: ConflictReport['legacySkills'] = [];
  try {
    const pluginSkillNames = new Set(
      listBuiltinSkillNames({ includeAliases: true }).map(n => n.toLowerCase())
    );
    const entries = readdirSync(legacySkillsDir);
    for (const entry of entries) {
      // Match .md files or directories whose name collides with a plugin skill
      const baseName = entry.replace(/\.md$/i, '').toLowerCase();
      if (pluginSkillNames.has(baseName)) {
        if (isSupportedSetupFallbackSkill(legacySkillsDir, entry, baseName)) {
          continue;
        }
        collisions.push({ name: baseName, path: join(legacySkillsDir, entry) });
      }
    }
  } catch {
    // Ignore read errors
  }
  return collisions;
}

/**
 * Check for unknown fields in config files
 */
export function checkConfigIssues(): ConflictReport['configIssues'] {
  const unknownFields: string[] = [];
  const configPath = join(getQoderConfigDir(), '.omq-config.json');

  if (!existsSync(configPath)) {
    return { unknownFields };
  }

  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));

    // Known top-level fields from the current config surfaces:
    // - PluginConfig (src/shared/types.ts)
    // - OMQConfig (src/features/auto-update.ts)
    // - direct .omq-config.json readers/writers (notifications, auto-invoke,
    //   delegation enforcement, omq-setup team config)
    // - preserved legacy compatibility keys that still appear in user configs
    const knownFields = new Set([
      // PluginConfig fields
      'agents',
      'features',
      'mcpServers',
      'permissions',
      'magicKeywords',
      'routing',
      // OMQConfig fields (from auto-update.ts / omq-setup)
      'silentAutoUpdate',
      'configuredAt',
      'configVersion',
      'taskTool',
      'taskToolConfig',
      'defaultExecutionMode',
      'bashHistory',
      'agentTiers',
      'setupCompleted',
      'setupVersion',
      'stopHookCallbacks',
      'notifications',
      'notificationProfiles',
      'hudEnabled',
      'autoUpgradePrompt',
      'nodeBinary',
      // Direct config readers / writers outside OMQConfig
      'customIntegrations',
      'delegationEnforcementLevel',
      'enforcementLevel',
      'autoInvoke',
      'team',
    ]);

    for (const field of Object.keys(config)) {
      if (!knownFields.has(field)) {
        unknownFields.push(field);
      }
    }
  } catch (_error) {
    // Ignore parse errors
  }

  return { unknownFields };
}

/**
 * Check for .omq-workspace marker presence and OMQ_STATE_DIR precedence.
 *
 * Reports:
 *  - Whether a .omq-workspace marker was found (and where).
 *  - Whether OMQ_STATE_DIR is set.
 *  - When both are set, emits a precedenceConflict flag (OMQ_STATE_DIR wins per
 *    the resolution-order principle: OMQ_STATE_DIR > .omq-workspace > git > cwd).
 */
export function checkWorkspaceMarker(): WorkspaceMarkerStatus {
  const markerRoot = findWorkspaceRoot();
  const stateDirEnvValue = process.env.OMQ_STATE_DIR && process.env.OMQ_STATE_DIR.trim()
    ? process.env.OMQ_STATE_DIR.trim()
    : null;
  const stateDirEnvSet = stateDirEnvValue !== null;
  const precedenceConflict = stateDirEnvSet && markerRoot !== null;

  return { markerRoot, stateDirEnvSet, stateDirEnvValue, precedenceConflict };
}

/**
 * Run complete conflict check
 */
export function runConflictCheck(): ConflictReport {
  const hookConflicts = checkHookConflicts();
  const claudeMdStatus = checkClaudeMdStatus();
  const legacySkills = checkLegacySkills();
  const envFlags = checkEnvFlags();
  const configIssues = checkConfigIssues();
  const windowsUnsafePluginHooks = checkWindowsUnsafePluginHooks();
  const mcpRegistrySync = inspectUnifiedMcpRegistrySync();
  const workspaceMarker = checkWorkspaceMarker();

  // Determine if there are actual conflicts
  const hasConflicts =
    hookConflicts.some(h => !h.isOmq) || // Non-OMQ hooks present
    legacySkills.length > 0 || // Legacy skills colliding with plugin
    envFlags.disableOmq || // OMQ is disabled
    envFlags.skipHooks.length > 0 || // Hooks are being skipped
    configIssues.unknownFields.length > 0 || // Unknown config fields
    windowsUnsafePluginHooks.length > 0 || // Stale plugin hooks still use sh/find-node on Windows
    mcpRegistrySync.claudeMissing.length > 0 ||
    mcpRegistrySync.claudeMismatched.length > 0 ||
    mcpRegistrySync.codexMissing.length > 0 ||
    mcpRegistrySync.codexMismatched.length > 0;
    // Note: Missing OMQ markers is informational (normal for fresh install), not a conflict
    // Note: workspaceMarker.precedenceConflict is a WARN, not a hard conflict

  return {
    hookConflicts,
    claudeMdStatus,
    legacySkills,
    envFlags,
    configIssues,
    windowsUnsafePluginHooks,
    mcpRegistrySync,
    workspaceMarker,
    hasConflicts
  };
}

/**
 * Format report for display
 */
export function formatReport(report: ConflictReport, json: boolean): string {
  if (json) {
    return JSON.stringify(report, null, 2);
  }

  // Human-readable format
  const lines: string[] = [];

  lines.push('');
  lines.push(colors.bold('🔍 Oh-My-Qoder Conflict Diagnostic'));
  lines.push(colors.gray('━'.repeat(60)));
  lines.push('');

  // Hook conflicts
  if (report.hookConflicts.length > 0) {
    lines.push(colors.bold('📌 Hook Configuration'));
    lines.push('');
    for (const hook of report.hookConflicts) {
      const status = hook.isOmq ? colors.green('✓ OMQ') : colors.yellow('⚠ Other');
      lines.push(`  ${hook.event.padEnd(20)} ${status}`);
      lines.push(`    ${colors.gray(hook.command)}`);
    }
    lines.push('');
  } else {
    lines.push(colors.bold('📌 Hook Configuration'));
    lines.push(`  ${colors.gray('No hooks configured')}`);
    lines.push('');
  }

  // AGENTS.md status
  if (report.claudeMdStatus) {
    lines.push(colors.bold('📄 AGENTS.md Status'));
    lines.push('');

    if (report.claudeMdStatus.hasMarkers) {
      if (report.claudeMdStatus.companionFile) {
        lines.push(`  ${colors.green('✓')} OMQ markers found in companion file`);
        lines.push(`    ${colors.gray(`Companion: ${report.claudeMdStatus.companionFile}`)}`);
      } else {
        lines.push(`  ${colors.green('✓')} OMQ markers present`);
      }
      if (report.claudeMdStatus.hasUserContent) {
        lines.push(`  ${colors.green('✓')} User content preserved outside markers`);
      }
    } else {
      lines.push(`  ${colors.yellow('⚠')} No OMQ markers found`);
      lines.push(`    ${colors.gray('Run /oh-my-qoder:omq-setup to add markers')}`);
      if (report.claudeMdStatus.hasUserContent) {
        lines.push(`  ${colors.blue('ℹ')} User content present - will be preserved`);
      }
    }
    lines.push(`  ${colors.gray(`Path: ${report.claudeMdStatus.path}`)}`);
    lines.push('');
  } else {
    lines.push(colors.bold('📄 AGENTS.md Status'));
    lines.push(`  ${colors.gray('No AGENTS.md found')}`);
    lines.push('');
  }

  // Environment flags
  lines.push(colors.bold('🔧 Environment Flags'));
  lines.push('');
  if (report.envFlags.disableOmq) {
    lines.push(`  ${colors.red('✗')} DISABLE_OMQ is set - OMQ is disabled`);
  } else {
    lines.push(`  ${colors.green('✓')} DISABLE_OMQ not set`);
  }

  if (report.envFlags.skipHooks.length > 0) {
    lines.push(`  ${colors.yellow('⚠')} OMQ_SKIP_HOOKS: ${report.envFlags.skipHooks.join(', ')}`);
  } else {
    lines.push(`  ${colors.green('✓')} No hooks are being skipped`);
  }
  lines.push('');

  // Legacy skills
  if (report.legacySkills.length > 0) {
    lines.push(colors.bold('📦 Legacy Skills'));
    lines.push('');
    lines.push(`  ${colors.yellow('⚠')} Skills colliding with plugin skill names:`);
    for (const skill of report.legacySkills) {
      lines.push(`    - ${skill.name} ${colors.gray(`(${skill.path})`)}`);
    }
    lines.push(`    ${colors.gray('These legacy files shadow plugin skills. Remove them or rename to avoid conflicts.')}`);
    lines.push('');
  }

  // Windows plugin hook portability
  if (report.windowsUnsafePluginHooks.length > 0) {
    lines.push(colors.bold('🪟 Windows Plugin Hooks'));
    lines.push('');
    lines.push(`  ${colors.yellow('⚠')} Plugin hooks still route through sh/find-node on native Windows:`);
    for (const hook of report.windowsUnsafePluginHooks) {
      lines.push(`    - ${hook.event} ${colors.gray(`(${hook.pluginRoot})`)}`);
      lines.push(`      ${colors.gray(hook.command)}`);
    }
    lines.push(`    ${colors.gray('Run /oh-my-qoder:omq-setup or update/reinstall the plugin to rewrite hooks to direct node run.cjs commands.')}`);
    lines.push('');
  }

  // Config issues
  if (report.configIssues.unknownFields.length > 0) {
    lines.push(colors.bold('⚙️  Configuration Issues'));
    lines.push('');
    lines.push(`  ${colors.yellow('⚠')} Unknown fields in .omq-config.json:`);
    for (const field of report.configIssues.unknownFields) {
      lines.push(`    - ${field}`);
    }
    lines.push('');
  }

  // Unified MCP registry sync
  lines.push(colors.bold('🧩 Unified MCP Registry'));
  lines.push('');
  if (!report.mcpRegistrySync.registryExists) {
    lines.push(`  ${colors.gray('No unified MCP registry found')}`);
    lines.push(`    ${colors.gray(`Expected path: ${report.mcpRegistrySync.registryPath}`)}`);
  } else if (report.mcpRegistrySync.serverNames.length === 0) {
    lines.push(`  ${colors.gray('Registry exists but has no MCP servers')}`);
    lines.push(`    ${colors.gray(`Path: ${report.mcpRegistrySync.registryPath}`)}`);
  } else {
    lines.push(`  ${colors.green('✓')} Registry servers: ${report.mcpRegistrySync.serverNames.join(', ')}`);
    lines.push(`    ${colors.gray(`Registry: ${report.mcpRegistrySync.registryPath}`)}`);
    lines.push(`    ${colors.gray(`Claude MCP: ${report.mcpRegistrySync.claudeConfigPath}`)}`);
    lines.push(`    ${colors.gray(`Codex: ${report.mcpRegistrySync.codexConfigPath}`)}`);

    if (report.mcpRegistrySync.claudeMissing.length > 0) {
      lines.push(`  ${colors.yellow('⚠')} Missing from Claude MCP config: ${report.mcpRegistrySync.claudeMissing.join(', ')}`);
    } else if (report.mcpRegistrySync.claudeMismatched.length > 0) {
      lines.push(`  ${colors.yellow('⚠')} Mismatched in Claude MCP config: ${report.mcpRegistrySync.claudeMismatched.join(', ')}`);
    } else {
      lines.push(`  ${colors.green('✓')} Claude MCP config is in sync`);
    }

    if (report.mcpRegistrySync.codexMissing.length > 0) {
      lines.push(`  ${colors.yellow('⚠')} Missing from Codex config.toml: ${report.mcpRegistrySync.codexMissing.join(', ')}`);
    } else if (report.mcpRegistrySync.codexMismatched.length > 0) {
      lines.push(`  ${colors.yellow('⚠')} Mismatched in Codex config.toml: ${report.mcpRegistrySync.codexMismatched.join(', ')}`);
    } else {
      lines.push(`  ${colors.green('✓')} Codex config.toml is in sync`);
    }
  }
  lines.push('');

  // Workspace marker
  lines.push(colors.bold('🗂  Workspace Marker (.omq-workspace)'));
  lines.push('');
  const wm = report.workspaceMarker;
  if (wm.markerRoot) {
    lines.push(`  ${colors.green('✓')} ${WORKSPACE_MARKER} found`);
    lines.push(`    ${colors.gray(`Marker root: ${wm.markerRoot}`)}`);
  } else {
    lines.push(`  ${colors.gray('ℹ')} No ${WORKSPACE_MARKER} marker found (single-repo mode)`);
  }
  if (wm.stateDirEnvSet) {
    lines.push(`  ${colors.green('✓')} OMQ_STATE_DIR is set: ${wm.stateDirEnvValue}`);
  } else {
    lines.push(`  ${colors.gray('ℹ')} OMQ_STATE_DIR not set`);
  }
  if (wm.precedenceConflict) {
    lines.push(`  ${colors.yellow('⚠')} Both OMQ_STATE_DIR and ${WORKSPACE_MARKER} are active.`);
    lines.push(`    ${colors.gray('OMQ_STATE_DIR takes precedence (resolution order: OMQ_STATE_DIR > .omq-workspace > git > cwd).')}`);
    lines.push(`    ${colors.gray('If you intended .omq-workspace to anchor state, unset OMQ_STATE_DIR.')}`);
  }
  lines.push('');

  // Summary
  lines.push(colors.gray('━'.repeat(60)));
  if (report.hasConflicts) {
    lines.push(`${colors.yellow('⚠')} Potential conflicts detected`);
    lines.push(`${colors.gray('Review the issues above and run /oh-my-qoder:omq-setup if needed')}`);
  } else {
    lines.push(`${colors.green('✓')} No conflicts detected`);
    lines.push(`${colors.gray('OMQ is properly configured')}`);
  }
  lines.push('');

  return lines.join('\n');
}

/**
 * Doctor conflicts command
 */
export async function doctorConflictsCommand(options: { json?: boolean }): Promise<number> {
  const report = runConflictCheck();
  console.log(formatReport(report, options.json ?? false));
  return report.hasConflicts ? 1 : 0;
}
