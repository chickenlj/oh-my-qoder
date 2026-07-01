import { describe, it, expect, vi } from 'vitest';
import { render } from '../../hud/render.js';
import { DEFAULT_HUD_CONFIG } from '../../hud/types.js';
import type { HudRenderContext, HudConfig } from '../../hud/types.js';

// The HUD banner appends an "L" suffix when running from a local/dev checkout
// (isRuntimePackageLocal). Under test the package root has src/ and .git, so it
// would always report local. Force false for deterministic banner assertions.
vi.mock('../../lib/version.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/version.js')>()),
  isRuntimePackageLocal: () => false,
}));

function createMinimalContext(overrides: Partial<HudRenderContext> = {}): HudRenderContext {
  return {
    contextPercent: 30,
    modelName: 'claude-sonnet-4.6',
    ralph: null,
    ultrawork: null,
    prd: null,
    autopilot: null,
    activeAgents: [],
    todos: [],
    backgroundTasks: [],
    cwd: '/tmp/test',
    lastSkill: null,
    rateLimitsResult: null,
    customBuckets: null,
    pendingPermission: null,
    thinkingState: null,
    sessionHealth: null,
    omqVersion: null,
    updateAvailable: null,
    toolCallCount: 0,
    agentCallCount: 0,
    skillCallCount: 0,
    promptTime: null,
    apiKeySource: null,
    profileName: null,
    sessionSummary: null,
    ...overrides,
  };
}

function createMinimalConfig(overrides: Partial<HudConfig['elements']> = {}): HudConfig {
  return {
    ...DEFAULT_HUD_CONFIG,
    elements: {
      ...DEFAULT_HUD_CONFIG.elements,
      omqLabel: true,
      rateLimits: false,
      ralph: false,
      autopilot: false,
      prdStory: false,
      activeSkills: false,
      lastSkill: false,
      contextBar: false,
      agents: false,
      backgroundTasks: false,
      todos: false,
      permissionStatus: false,
      thinking: false,
      sessionHealth: false,
      ...overrides,
    },
  };
}

describe('HUD version display and update notification', () => {
  describe('OMQ label without version', () => {
    it('renders [OMQ] when omqVersion is null', async () => {
      const ctx = createMinimalContext({ omqVersion: null });
      const config = createMinimalConfig();
      const output = await render(ctx, config);
      expect(output).toContain('[OMQ]');
      expect(output).not.toContain('#');
    });
  });

  describe('OMQ label with version', () => {
    it('renders [OMQ#X.Y.Z] when omqVersion is set', async () => {
      const ctx = createMinimalContext({ omqVersion: '4.1.10' });
      const config = createMinimalConfig();
      const output = await render(ctx, config);
      expect(output).toContain('[OMQ#4.1.10]');
    });

    it('renders version without update notice when updateAvailable is null', async () => {
      const ctx = createMinimalContext({ omqVersion: '4.1.10', updateAvailable: null });
      const config = createMinimalConfig();
      const output = await render(ctx, config);
      expect(output).toContain('[OMQ#4.1.10]');
      expect(output).not.toContain('->');
      expect(output).not.toContain('omq update');
    });
  });

  describe('update notification', () => {
    it('renders update notification by default when updateAvailable is set', async () => {
      const ctx = createMinimalContext({ omqVersion: '4.1.10', updateAvailable: '4.2.0' });
      const config = createMinimalConfig();
      const output = await render(ctx, config);
      expect(output).toContain('[OMQ#4.1.10]');
      expect(output).toContain('-> 4.2.0');
      expect(output).toContain('omq update');
    });

    it('keeps OMQ version label but hides update notification when updateNotification is false', async () => {
      const ctx = createMinimalContext({ omqVersion: '4.1.10', updateAvailable: '4.2.0' });
      const config = createMinimalConfig({ updateNotification: false });
      const output = await render(ctx, config);
      expect(output).toContain('[OMQ#4.1.10]');
      expect(output).not.toContain('-> 4.2.0');
      expect(output).not.toContain('omq update');
    });

    it('renders update notification without version when omqVersion is null', async () => {
      const ctx = createMinimalContext({ omqVersion: null, updateAvailable: '4.2.0' });
      const config = createMinimalConfig();
      const output = await render(ctx, config);
      expect(output).toContain('[OMQ]');
      expect(output).toContain('-> 4.2.0');
    });
  });

  describe('omqLabel disabled', () => {
    it('does not render OMQ label when omqLabel is false', async () => {
      const ctx = createMinimalContext({ omqVersion: '4.1.10', updateAvailable: '4.2.0' });
      const config = createMinimalConfig({ omqLabel: false });
      const output = await render(ctx, config);
      expect(output).not.toContain('[OMQ');
      expect(output).not.toContain('omq update');
    });
  });
});
