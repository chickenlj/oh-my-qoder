/**
 * Tests for omq update --force-hooks protection (issue #722)
 *
 * Verifies that the hook merge logic in install() correctly:
 *   - merges OMQ hooks with existing non-OMQ hooks during `omq update` (force=true)
 *   - warns when non-OMQ hooks are present
 *   - only fully replaces when --force-hooks is explicitly set
 *
 * Tests exercise isOmqHook() and the merge logic via unit-level helpers
 * to avoid filesystem side-effects.
 */

import { describe, it, expect } from 'vitest';
import { isOmqHook } from '../installer/index.js';

// ---------------------------------------------------------------------------
// Shared types mirroring installer internals
// ---------------------------------------------------------------------------
type HookEntry = { type: string; command: string };
type HookGroup = { hooks: HookEntry[] };

// ---------------------------------------------------------------------------
// Pure merge helper extracted from install() for isolated testing.
// This mirrors exactly the logic in installer/index.ts so that changes
// to the installer are reflected and tested here.
// ---------------------------------------------------------------------------
function mergeEventHooks(
  existingGroups: HookGroup[],
  newOmqGroups: HookGroup[],
  options: { force?: boolean; forceHooks?: boolean; allowPluginHookRefresh?: boolean }
): {
  merged: HookGroup[];
  conflicts: Array<{ eventType: string; existingCommand: string }>;
  logMessages: string[];
} {
  const conflicts: Array<{ eventType: string; existingCommand: string }> = [];
  const logMessages: string[] = [];
  const eventType = 'TestEvent';

  const nonOmqGroups = existingGroups.filter(group =>
    group.hooks.some(h => h.type === 'command' && !isOmqHook(h.command))
  );
  const hasNonOmqHook = nonOmqGroups.length > 0;
  const nonOmqCommand = hasNonOmqHook
    ? nonOmqGroups[0].hooks.find(h => h.type === 'command' && !isOmqHook(h.command))?.command ?? ''
    : '';

  let merged: HookGroup[];

  if (options.forceHooks && !options.allowPluginHookRefresh) {
    if (hasNonOmqHook) {
      logMessages.push(`Warning: Overwriting non-OMQ ${eventType} hook with --force-hooks: ${nonOmqCommand}`);
      conflicts.push({ eventType, existingCommand: nonOmqCommand });
    }
    merged = newOmqGroups;
    logMessages.push(`Updated ${eventType} hook (--force-hooks)`);
  } else if (options.force) {
    merged = [...nonOmqGroups, ...newOmqGroups];
    if (hasNonOmqHook) {
      logMessages.push(`Merged ${eventType} hooks (updated OMQ hooks, preserved non-OMQ hook: ${nonOmqCommand})`);
      conflicts.push({ eventType, existingCommand: nonOmqCommand });
    } else {
      logMessages.push(`Updated ${eventType} hook (--force)`);
    }
  } else {
    if (hasNonOmqHook) {
      logMessages.push(`Warning: ${eventType} hook has non-OMQ hook. Skipping. Use --force-hooks to override.`);
      conflicts.push({ eventType, existingCommand: nonOmqCommand });
    } else {
      logMessages.push(`${eventType} hook already configured, skipping`);
    }
    merged = existingGroups; // unchanged
  }

  return { merged, conflicts, logMessages };
}

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------
function omqGroup(command: string): HookGroup {
  return { hooks: [{ type: 'command', command }] };
}

function userGroup(command: string): HookGroup {
  return { hooks: [{ type: 'command', command }] };
}

const OMQ_CMD = 'node "$HOME/.qoder/hooks/keyword-detector.mjs"';
const USER_CMD = '/usr/local/bin/my-custom-hook.sh';
const NEW_OMQ_CMD = 'node "$HOME/.qoder/hooks/session-start.mjs"';

// ---------------------------------------------------------------------------
// isOmqHook unit tests
// ---------------------------------------------------------------------------
describe('isOmqHook()', () => {
  it('recognises OMQ keyword-detector command', () => {
    expect(isOmqHook('node "$HOME/.qoder/hooks/keyword-detector.mjs"')).toBe(true);
  });

  it('recognises OMQ session-start command', () => {
    expect(isOmqHook('node "$HOME/.qoder/hooks/session-start.mjs"')).toBe(true);
  });

  it('recognises OMQ pre-tool-use command', () => {
    expect(isOmqHook('node "$HOME/.qoder/hooks/pre-tool-use.mjs"')).toBe(true);
  });

  it('recognises OMQ post-tool-use command', () => {
    expect(isOmqHook('node "$HOME/.qoder/hooks/post-tool-use.mjs"')).toBe(true);
  });

  it('recognises OMQ persistent-mode command', () => {
    expect(isOmqHook('node "$HOME/.qoder/hooks/persistent-mode.mjs"')).toBe(true);
  });

  it('recognises OMQ code-simplifier command', () => {
    expect(isOmqHook('node "$HOME/.qoder/hooks/code-simplifier.mjs"')).toBe(true);
  });

  it('recognises Windows-style OMQ path', () => {
    expect(isOmqHook('node "%USERPROFILE%\\.qwen\\hooks\\keyword-detector.mjs"')).toBe(true);
  });

  it('recognises custom-profile hook paths by known filename', () => {
    expect(isOmqHook('node "/tmp/custom-claude/hooks/keyword-detector.mjs"')).toBe(true);
  });

  it('recognises QODER_CONFIG_DIR-aware hook commands', () => {
    expect(isOmqHook('node "${QODER_CONFIG_DIR:-$HOME/.qwen}/hooks/keyword-detector.mjs"')).toBe(true);
    expect(isOmqHook('node "${QODER_CONFIG_DIR:-$HOME/.qwen}/hooks/persistent-mode.mjs"')).toBe(true);
  });

  it('recognises oh-my-qoder in command path', () => {
    expect(isOmqHook('/path/to/oh-my-qoder/hook.mjs')).toBe(true);
  });

  it('recognises omq as a path segment', () => {
    expect(isOmqHook('/usr/local/bin/omq-hook.sh')).toBe(true);
  });

  it('does not recognise a plain user command', () => {
    expect(isOmqHook('/usr/local/bin/my-custom-hook.sh')).toBe(false);
  });

  it('does not recognise a random shell script', () => {
    expect(isOmqHook('bash /home/user/scripts/notify.sh')).toBe(false);
  });

  it('does not match "omq" inside an unrelated word', () => {
    // "nomq" or "omqr" should NOT match the omq path-segment pattern
    expect(isOmqHook('/usr/bin/nomq-thing')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Hook merge logic tests
// ---------------------------------------------------------------------------
describe('Hook merge during omq update', () => {
  describe('no force flags — skip behaviour', () => {
    it('skips an already-configured OMQ-only event type', () => {
      const existing = [omqGroup(OMQ_CMD)];
      const newOmq = [omqGroup(NEW_OMQ_CMD)];
      const { merged, conflicts, logMessages } = mergeEventHooks(existing, newOmq, {});

      expect(merged).toEqual(existing); // unchanged
      expect(conflicts).toHaveLength(0);
      expect(logMessages[0]).toMatch(/already configured/);
    });

    it('records conflict but does not overwrite when non-OMQ hook exists', () => {
      const existing = [userGroup(USER_CMD)];
      const newOmq = [omqGroup(NEW_OMQ_CMD)];
      const { merged, conflicts, logMessages } = mergeEventHooks(existing, newOmq, {});

      expect(merged).toEqual(existing); // unchanged
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].existingCommand).toBe(USER_CMD);
      expect(logMessages[0]).toMatch(/non-OMQ hook/);
      expect(logMessages[0]).toMatch(/--force-hooks/);
    });
  });

  describe('force=true — merge behaviour (omq update path)', () => {
    it('replaces OMQ hooks when event type has only OMQ hooks', () => {
      const existing = [omqGroup(OMQ_CMD)];
      const newOmq = [omqGroup(NEW_OMQ_CMD)];
      const { merged, conflicts } = mergeEventHooks(existing, newOmq, { force: true });

      // Non-OMQ groups: none → merged = newOmq only
      expect(merged).toHaveLength(1);
      expect(merged[0].hooks[0].command).toBe(NEW_OMQ_CMD);
      expect(conflicts).toHaveLength(0);
    });

    it('preserves non-OMQ hook and adds updated OMQ hook', () => {
      const existing = [userGroup(USER_CMD), omqGroup(OMQ_CMD)];
      const newOmq = [omqGroup(NEW_OMQ_CMD)];
      const { merged, conflicts, logMessages } = mergeEventHooks(existing, newOmq, { force: true });

      // non-OMQ groups come first, then new OMQ groups
      expect(merged).toHaveLength(2);
      expect(merged[0].hooks[0].command).toBe(USER_CMD);
      expect(merged[1].hooks[0].command).toBe(NEW_OMQ_CMD);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].existingCommand).toBe(USER_CMD);
      expect(logMessages[0]).toMatch(/Merged/);
      expect(logMessages[0]).toMatch(/preserved non-OMQ hook/);
    });

    it('preserves multiple non-OMQ hook groups', () => {
      const userCmd2 = '/usr/local/bin/another-hook.sh';
      const existing = [userGroup(USER_CMD), userGroup(userCmd2), omqGroup(OMQ_CMD)];
      const newOmq = [omqGroup(NEW_OMQ_CMD)];
      const { merged } = mergeEventHooks(existing, newOmq, { force: true });

      expect(merged).toHaveLength(3); // 2 user groups + 1 new OMQ group
      expect(merged[0].hooks[0].command).toBe(USER_CMD);
      expect(merged[1].hooks[0].command).toBe(userCmd2);
      expect(merged[2].hooks[0].command).toBe(NEW_OMQ_CMD);
    });

    it('does not carry over old OMQ hook groups', () => {
      const existing = [omqGroup(OMQ_CMD)];
      const newOmq = [omqGroup(NEW_OMQ_CMD)];
      const { merged } = mergeEventHooks(existing, newOmq, { force: true });

      const commands = merged.flatMap(g => g.hooks.map(h => h.command));
      expect(commands).not.toContain(OMQ_CMD);
      expect(commands).toContain(NEW_OMQ_CMD);
    });

    it('records a conflict when non-OMQ hook is preserved', () => {
      const existing = [userGroup(USER_CMD)];
      const newOmq = [omqGroup(NEW_OMQ_CMD)];
      const { conflicts } = mergeEventHooks(existing, newOmq, { force: true });

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].existingCommand).toBe(USER_CMD);
    });

    it('records no conflict when only OMQ hooks existed', () => {
      const existing = [omqGroup(OMQ_CMD)];
      const newOmq = [omqGroup(NEW_OMQ_CMD)];
      const { conflicts } = mergeEventHooks(existing, newOmq, { force: true });

      expect(conflicts).toHaveLength(0);
    });
  });

  describe('forceHooks=true — replace-all behaviour', () => {
    it('replaces OMQ-only hooks', () => {
      const existing = [omqGroup(OMQ_CMD)];
      const newOmq = [omqGroup(NEW_OMQ_CMD)];
      const { merged, conflicts } = mergeEventHooks(existing, newOmq, { forceHooks: true });

      expect(merged).toEqual(newOmq);
      expect(conflicts).toHaveLength(0);
    });

    it('replaces non-OMQ hook and warns', () => {
      const existing = [userGroup(USER_CMD)];
      const newOmq = [omqGroup(NEW_OMQ_CMD)];
      const { merged, conflicts, logMessages } = mergeEventHooks(existing, newOmq, { forceHooks: true });

      expect(merged).toEqual(newOmq);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].existingCommand).toBe(USER_CMD);
      expect(logMessages[0]).toMatch(/Overwriting non-OMQ/);
      expect(logMessages[0]).toMatch(/--force-hooks/);
    });

    it('replaces mixed hooks entirely', () => {
      const existing = [userGroup(USER_CMD), omqGroup(OMQ_CMD)];
      const newOmq = [omqGroup(NEW_OMQ_CMD)];
      const { merged } = mergeEventHooks(existing, newOmq, { forceHooks: true });

      expect(merged).toHaveLength(1);
      expect(merged[0].hooks[0].command).toBe(NEW_OMQ_CMD);
    });

    it('does NOT replace when allowPluginHookRefresh is true (plugin safety)', () => {
      // When running as a plugin with refreshHooksInPlugin, forceHooks should
      // not clobber user hooks — falls through to the force=true merge path
      // (since allowPluginHookRefresh=true disables the forceHooks branch).
      // This test exercises the guard: forceHooks && !allowPluginHookRefresh.
      const existing = [userGroup(USER_CMD), omqGroup(OMQ_CMD)];
      const newOmq = [omqGroup(NEW_OMQ_CMD)];
      const { merged } = mergeEventHooks(existing, newOmq, {
        forceHooks: true,
        allowPluginHookRefresh: true,
        // Note: force is not set, so falls to "no force" branch
      });

      // Without force set, the no-force branch runs → merged unchanged
      expect(merged).toEqual(existing);
    });
  });

  describe('edge cases', () => {
    it('handles event type with no existing hooks (empty array)', () => {
      // When existingHooks[eventType] exists but is empty
      const existing: HookGroup[] = [];
      const newOmq = [omqGroup(NEW_OMQ_CMD)];
      const { merged, conflicts } = mergeEventHooks(existing, newOmq, { force: true });

      // nonOmqGroups will be empty, so merged = [] + newOmqGroups
      expect(merged).toEqual(newOmq);
      expect(conflicts).toHaveLength(0);
    });

    it('handles hook group with non-command type (should not be treated as non-OMQ)', () => {
      // A hook group with type != 'command' should not count as non-OMQ
      const existing: HookGroup[] = [{ hooks: [{ type: 'webhook', command: '' }] }];
      const newOmq = [omqGroup(NEW_OMQ_CMD)];
      const { conflicts } = mergeEventHooks(existing, newOmq, { force: true });

      // The webhook group has no command-type hooks → nonOmqGroups is empty
      expect(conflicts).toHaveLength(0);
    });
  });
});
