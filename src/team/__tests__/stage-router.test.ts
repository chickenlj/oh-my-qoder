import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolveRoleAssignment, buildResolvedRoutingSnapshot } from '../stage-router.js';
import { CANONICAL_TEAM_ROLES } from '../../shared/types.js';
import type { CanonicalTeamRole, PluginConfig } from '../../shared/types.js';
import { QWEN_FAMILY_DEFAULTS, BUILTIN_EXTERNAL_MODEL_DEFAULTS } from '../../config/models.js';

type TeamRoleRoutingConfig = NonNullable<NonNullable<PluginConfig['team']>['roleRouting']>;

const EMPTY: PluginConfig = {};

const ENV_KEYS = [
  'OMQ_MODEL_HIGH',
  'OMQ_MODEL_MEDIUM',
  'OMQ_MODEL_LOW',
  'DASHSCOPE_DEFAULT_MAX_MODEL',
  'DASHSCOPE_DEFAULT_PLUS_MODEL',
  'DASHSCOPE_DEFAULT_TURBO_MODEL',
  'DASHSCOPE_DEFAULT_MAX_MODEL',
  'DASHSCOPE_DEFAULT_PLUS_MODEL',
  'DASHSCOPE_DEFAULT_TURBO_MODEL',
];

const savedEnv: Record<string, string | undefined> = {};

beforeAll(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] !== undefined) {
      process.env[key] = savedEnv[key];
    } else {
      delete process.env[key];
    }
  }
});

const EXPECTED_DEFAULTS: Record<CanonicalTeamRole, { model: string; agent: string }> = {
  orchestrator: { model: QWEN_FAMILY_DEFAULTS.MAX, agent: 'omq' },
  planner: { model: QWEN_FAMILY_DEFAULTS.MAX, agent: 'planner' },
  analyst: { model: QWEN_FAMILY_DEFAULTS.MAX, agent: 'analyst' },
  architect: { model: QWEN_FAMILY_DEFAULTS.MAX, agent: 'architect' },
  executor: { model: QWEN_FAMILY_DEFAULTS.PLUS, agent: 'executor' },
  debugger: { model: QWEN_FAMILY_DEFAULTS.PLUS, agent: 'debugger' },
  critic: { model: QWEN_FAMILY_DEFAULTS.MAX, agent: 'critic' },
  'code-reviewer': { model: QWEN_FAMILY_DEFAULTS.MAX, agent: 'codeReviewer' },
  'security-reviewer': { model: QWEN_FAMILY_DEFAULTS.PLUS, agent: 'securityReviewer' },
  'test-engineer': { model: QWEN_FAMILY_DEFAULTS.PLUS, agent: 'testEngineer' },
  designer: { model: QWEN_FAMILY_DEFAULTS.PLUS, agent: 'designer' },
  writer: { model: QWEN_FAMILY_DEFAULTS.TURBO, agent: 'writer' },
  'code-simplifier': { model: QWEN_FAMILY_DEFAULTS.MAX, agent: 'codeSimplifier' },
  explore: { model: QWEN_FAMILY_DEFAULTS.TURBO, agent: 'explore' },
  'document-specialist': { model: QWEN_FAMILY_DEFAULTS.PLUS, agent: 'documentSpecialist' },
};

describe('stage-router resolveRoleAssignment', () => {
  describe('defaults (no team.roleRouting)', () => {
    for (const role of CANONICAL_TEAM_ROLES) {
      it(`resolves ${role} → claude + tier-default model + canonical agent`, () => {
        const out = resolveRoleAssignment(role, EMPTY);
        expect(out.provider).toBe('qwen');
        expect(out.agent).toBe(EXPECTED_DEFAULTS[role].agent);
        expect(out.model).toBe(EXPECTED_DEFAULTS[role].model);
      });
    }
  });

  describe('explicit overrides', () => {
    it('respects provider=codex with explicit model passthrough', () => {
      const cfg: PluginConfig = {
        team: { roleRouting: { critic: { provider: 'codex', model: 'gpt-5.3-codex' } } },
      };
      const out = resolveRoleAssignment('critic', cfg);
      expect(out.provider).toBe('codex');
      expect(out.model).toBe('gpt-5.3-codex');
      expect(out.agent).toBe('critic');
    });

    it('respects provider=gemini and resolves model from builtin defaults when omitted', () => {
      const cfg: PluginConfig = {
        team: { roleRouting: { 'code-reviewer': { provider: 'gemini' } } },
      };
      const out = resolveRoleAssignment('code-reviewer', cfg);
      expect(out.provider).toBe('gemini');
      expect(out.model).toBe(BUILTIN_EXTERNAL_MODEL_DEFAULTS.geminiModel);
      expect(out.agent).toBe('codeReviewer');
    });

    it('respects provider=grok and resolves to empty model (no Claude fallthrough) when omitted', () => {
      const cfg: PluginConfig = {
        team: { roleRouting: { 'code-reviewer': { provider: 'grok' } } },
      };
      const out = resolveRoleAssignment('code-reviewer', cfg);
      expect(out.provider).toBe('grok');
      // grok has no builtin default model and none configured → resolves to ''
      // (NOT a Claude tier model id).
      expect(out.model).toBe('');
      expect(out.model).not.toBe(QWEN_FAMILY_DEFAULTS.MAX);
      expect(out.agent).toBe('codeReviewer');
    });

    it('respects provider=grok with explicit model passthrough', () => {
      const cfg: PluginConfig = {
        team: { roleRouting: { critic: { provider: 'grok', model: 'grok-4-fast' } } },
      };
      const out = resolveRoleAssignment('critic', cfg);
      expect(out.provider).toBe('grok');
      expect(out.model).toBe('grok-4-fast');
      expect(out.agent).toBe('critic');
    });

    it('respects provider=cursor and resolves to empty model (cursor-agent owns model selection)', () => {
      const cfg: PluginConfig = {
        team: { roleRouting: { executor: { provider: 'cursor' } } },
      };
      const out = resolveRoleAssignment('executor', cfg);
      expect(out.provider).toBe('cursor');
      expect(out.model).toBe('');
      expect(out.model).not.toBe(QWEN_FAMILY_DEFAULTS.MAX);
      expect(out.agent).toBe('executor');
    });

    it('grok resolves configured externalModels.defaults.grokModel when model omitted', () => {
      const cfg: PluginConfig = {
        externalModels: { defaults: { grokModel: 'grok-code-fast-1' } },
        team: { roleRouting: { 'code-reviewer': { provider: 'grok' } } },
      };
      const out = resolveRoleAssignment('code-reviewer', cfg);
      expect(out.provider).toBe('grok');
      expect(out.model).toBe('grok-code-fast-1');
    });

    it('tier name on grok provider falls back to provider default (tiers are claude-centric)', () => {
      const cfg: PluginConfig = {
        team: { roleRouting: { executor: { provider: 'grok', model: 'HIGH' } } },
      };
      const out = resolveRoleAssignment('executor', cfg);
      expect(out.provider).toBe('grok');
      // tier names are claude-centric → grok ignores them and uses its (empty) default
      expect(out.model).toBe('');
      expect(out.model).not.toBe(QWEN_FAMILY_DEFAULTS.MAX);
    });

    it('resolves tier name (HIGH) into Claude opus model for claude provider', () => {
      const cfg: PluginConfig = {
        team: { roleRouting: { executor: { provider: 'qwen', model: 'HIGH' } } },
      };
      const out = resolveRoleAssignment('executor', cfg);
      expect(out.provider).toBe('qwen');
      expect(out.model).toBe(QWEN_FAMILY_DEFAULTS.MAX);
    });

    it('tier name on external provider falls back to provider builtin (tiers are claude-centric)', () => {
      const cfg: PluginConfig = {
        team: { roleRouting: { executor: { provider: 'codex', model: 'HIGH' } } },
      };
      const out = resolveRoleAssignment('executor', cfg);
      expect(out.provider).toBe('codex');
      expect(out.model).toBe(BUILTIN_EXTERNAL_MODEL_DEFAULTS.codexModel);
    });

    it('respects explicit agent override', () => {
      const cfg: PluginConfig = {
        team: { roleRouting: { executor: { agent: 'debugger' } } },
      };
      const out = resolveRoleAssignment('executor', cfg);
      expect(out.agent).toBe('debugger');
    });

    it('respects routing.tierModels overrides for claude tier resolution', () => {
      const cfg: PluginConfig = {
        routing: { tierModels: { HIGH: 'claude-opus-custom-id' } },
        team: { roleRouting: { critic: { provider: 'qwen', model: 'HIGH' } } },
      };
      const out = resolveRoleAssignment('critic', cfg);
      expect(out.model).toBe('claude-opus-custom-id');
    });
  });

  describe('orchestrator pinning', () => {
    it('orchestrator provider always pinned to claude even when user specifies codex', () => {
      const cfg: PluginConfig = {
        team: { roleRouting: { orchestrator: { model: 'HIGH' } } },
      };
      const out = resolveRoleAssignment('orchestrator', cfg);
      expect(out.provider).toBe('qwen');
      expect(out.agent).toBe('omq');
    });
  });

  describe('alias normalization', () => {
    it('"reviewer" alias normalizes to code-reviewer (resolved as code-reviewer)', () => {
      const cfg: PluginConfig = {
        team: { roleRouting: { reviewer: { provider: 'codex' } } as TeamRoleRoutingConfig },
      };
      const out = resolveRoleAssignment('reviewer' as CanonicalTeamRole, cfg);
      expect(out.provider).toBe('codex');
      expect(out.agent).toBe('codeReviewer');
    });

    it('canonical role lookup honors alias-keyed roleRouting entries', () => {
      const cfg: PluginConfig = {
        team: { roleRouting: { reviewer: { provider: 'gemini' } } as TeamRoleRoutingConfig },
      };
      const out = resolveRoleAssignment('code-reviewer', cfg);
      expect(out.provider).toBe('gemini');
      expect(out.agent).toBe('codeReviewer');
    });

    it('resolved snapshot uses alias-keyed routing entries for canonical stage roles', () => {
      const cfg: PluginConfig = {
        team: { roleRouting: { reviewer: { provider: 'codex' } } as TeamRoleRoutingConfig },
      };
      const snap = buildResolvedRoutingSnapshot(cfg);
      expect(snap['code-reviewer'].primary.provider).toBe('codex');
    });
  });
});
