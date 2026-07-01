import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  isNonDefaultProvider,
  isProviderSpecificModelId,
  resolveQwenFamily,
  QWEN_FAMILY_DEFAULTS,
  hasExtendedContextSuffix,
  isSubagentSafeModelId,
  resolveInheritedModelFromEnv,
  shouldAutoForceInherit,
} from '../models.js';
import { saveAndClear, restore } from './test-helpers.js';

const TIER_MODEL_ENV_KEYS = [
  'OMQ_MODEL_HIGH',
  'OMQ_MODEL_MEDIUM',
  'OMQ_MODEL_LOW',
  'DASHSCOPE_DEFAULT_MAX_MODEL',
  'DASHSCOPE_DEFAULT_PLUS_MODEL',
  'DASHSCOPE_DEFAULT_TURBO_MODEL',
] as const;

const ALL_KEYS = [
  'OMQ_ROUTING_FORCE_INHERIT',
  'QODER_MODEL',
  'DASHSCOPE_MODEL',
  'DASHSCOPE_BASE_URL',
  ...TIER_MODEL_ENV_KEYS,
] as const;

// ---------------------------------------------------------------------------
// isNonDefaultProvider()
// ---------------------------------------------------------------------------
describe('isNonDefaultProvider()', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => { saved = saveAndClear(ALL_KEYS); });
  afterEach(() => { restore(saved); });

  it('returns true when OMQ_ROUTING_FORCE_INHERIT=true', () => {
    process.env.OMQ_ROUTING_FORCE_INHERIT = 'true';
    expect(isNonDefaultProvider()).toBe(true);
  });

  it('returns false when OMQ_ROUTING_FORCE_INHERIT=1 (only "true" triggers)', () => {
    process.env.OMQ_ROUTING_FORCE_INHERIT = '1';
    expect(isNonDefaultProvider()).toBe(false);
  });

  it('returns false when OMQ_ROUTING_FORCE_INHERIT=0', () => {
    process.env.OMQ_ROUTING_FORCE_INHERIT = '0';
    expect(isNonDefaultProvider()).toBe(false);
  });

  // --- Non-Qwen model detection ---

  it('detects non-Qwen model in DASHSCOPE_MODEL', () => {
    process.env.DASHSCOPE_MODEL = 'deepseek-v3';
    expect(isNonDefaultProvider()).toBe(true);
  });

  it('detects non-Qwen model in QODER_MODEL', () => {
    process.env.QODER_MODEL = 'glm-4';
    expect(isNonDefaultProvider()).toBe(true);
  });

  it('returns false for Qwen model in DASHSCOPE_MODEL', () => {
    process.env.DASHSCOPE_MODEL = 'qwen-max';
    expect(isNonDefaultProvider()).toBe(false);
  });

  it('returns false for Qwen model in QODER_MODEL', () => {
    process.env.QODER_MODEL = 'qwen-plus';
    expect(isNonDefaultProvider()).toBe(false);
  });

  it('is case-insensitive for Qwen detection', () => {
    process.env.DASHSCOPE_MODEL = 'Qwen-Max';
    expect(isNonDefaultProvider()).toBe(false);
  });

  // --- DASHSCOPE_BASE_URL detection ---

  it('returns true when DASHSCOPE_BASE_URL is a non-DashScope endpoint', () => {
    process.env.DASHSCOPE_BASE_URL = 'https://api.deepseek.com/v1';
    expect(isNonDefaultProvider()).toBe(true);
  });

  it('returns false when DASHSCOPE_BASE_URL contains dashscope.aliyuncs.com', () => {
    process.env.DASHSCOPE_BASE_URL = 'https://dashscope.aliyuncs.com/v1';
    expect(isNonDefaultProvider()).toBe(false);
  });

  // --- Tier model env vars ---

  it('returns true when tier model env var targets a non-Qwen provider', () => {
    process.env.DASHSCOPE_DEFAULT_PLUS_MODEL = 'kimi-k2.6:cloud';
    expect(isNonDefaultProvider()).toBe(true);
  });

  it('returns true when OMQ tier defaults target a non-Qwen provider', () => {
    process.env.OMQ_MODEL_MEDIUM = 'glm-5.1:cloud';
    expect(isNonDefaultProvider()).toBe(true);
  });

  it('does not treat bare tier aliases as non-Qwen provider IDs', () => {
    process.env.DASHSCOPE_DEFAULT_PLUS_MODEL = 'medium';
    expect(isNonDefaultProvider()).toBe(false);
  });

  // --- Direct model priority ---

  it('lets a direct Qwen QODER_MODEL beat stale non-Qwen tier defaults', () => {
    process.env.QODER_MODEL = 'qwen-plus';
    process.env.OMQ_MODEL_MEDIUM = 'glm-5.1:cloud';
    expect(isNonDefaultProvider()).toBe(false);
  });

  it('lets a direct Qwen DASHSCOPE_MODEL beat stale non-Qwen tier defaults', () => {
    process.env.DASHSCOPE_MODEL = 'qwen-plus';
    process.env.OMQ_MODEL_MEDIUM = 'glm-5.1:cloud';
    expect(isNonDefaultProvider()).toBe(false);
  });

  it('lets a direct Qwen QODER_MODEL beat a stale non-Qwen DASHSCOPE_MODEL', () => {
    process.env.QODER_MODEL = 'qwen-plus';
    process.env.DASHSCOPE_MODEL = 'kimi-k2.6:cloud';
    expect(isNonDefaultProvider()).toBe(false);
  });

  // --- shouldAutoForceInherit interaction ---

  it('does not globally force inheritance for tier-only non-Qwen defaults', () => {
    process.env.OMQ_MODEL_HIGH = 'glm-5.1:cloud';
    expect(isNonDefaultProvider()).toBe(true);
    expect(shouldAutoForceInherit()).toBe(false);
  });

  it('does globally force inheritance for direct non-Qwen session models', () => {
    process.env.QODER_MODEL = 'glm-5.1:cloud';
    expect(isNonDefaultProvider()).toBe(true);
    expect(shouldAutoForceInherit()).toBe(true);
  });

  // --- Default ---

  it('returns false when no env vars are set', () => {
    expect(isNonDefaultProvider()).toBe(false);
  });
});


// ---------------------------------------------------------------------------
// resolveInheritedModelFromEnv()
// ---------------------------------------------------------------------------
describe('resolveInheritedModelFromEnv()', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => { saved = saveAndClear(ALL_KEYS); });
  afterEach(() => { restore(saved); });

  it('prefers explicit session model env vars over tier defaults', () => {
    process.env.QODER_MODEL = 'qwen-session-parent';
    process.env.DASHSCOPE_DEFAULT_PLUS_MODEL = 'kimi-k2.6:cloud';

    expect(resolveInheritedModelFromEnv()).toBe('qwen-session-parent');
  });

  it('falls back to the medium tier env model for forceInherit without session model vars', () => {
    process.env.DASHSCOPE_DEFAULT_MAX_MODEL = 'glm-5.1:cloud';
    process.env.DASHSCOPE_DEFAULT_PLUS_MODEL = 'kimi-k2.6:cloud';

    expect(resolveInheritedModelFromEnv()).toBe('kimi-k2.6:cloud');
  });

  it('uses OMQ tier model env vars as inherit fallback when provider envs are absent', () => {
    process.env.OMQ_MODEL_MEDIUM = 'gpt-5.3:proxy';

    expect(resolveInheritedModelFromEnv()).toBe('gpt-5.3:proxy');
  });

  it('returns undefined when no model env is configured', () => {
    expect(resolveInheritedModelFromEnv()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// isProviderSpecificModelId()
// ---------------------------------------------------------------------------
describe('isProviderSpecificModelId()', () => {
  it('detects dashscope/ prefix', () => {
    expect(isProviderSpecificModelId('dashscope/qwen-max')).toBe(true);
    expect(isProviderSpecificModelId('DashScope/qwen-plus')).toBe(true);
  });

  it('returns false for bare Qwen model IDs', () => {
    expect(isProviderSpecificModelId('qwen-plus')).toBe(false);
    expect(isProviderSpecificModelId('qwen-max')).toBe(false);
    expect(isProviderSpecificModelId('qwen-turbo')).toBe(false);
  });

  it('returns false for aliases', () => {
    expect(isProviderSpecificModelId('medium')).toBe(false);
    expect(isProviderSpecificModelId('high')).toBe(false);
    expect(isProviderSpecificModelId('low')).toBe(false);
  });

  it('returns false for non-Qwen model IDs', () => {
    expect(isProviderSpecificModelId('gpt-4o')).toBe(false);
    expect(isProviderSpecificModelId('gemini-1.5-pro')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolveQwenFamily()
// ---------------------------------------------------------------------------
describe('resolveQwenFamily()', () => {
  it('resolves qwen-turbo to TURBO', () => {
    expect(resolveQwenFamily('qwen-turbo')).toBe('TURBO');
  });

  it('resolves qwen-plus to PLUS', () => {
    expect(resolveQwenFamily('qwen-plus')).toBe('PLUS');
  });

  it('resolves qwen-max to MAX', () => {
    expect(resolveQwenFamily('qwen-max')).toBe('MAX');
  });

  it('is case-insensitive for Qwen family detection', () => {
    expect(resolveQwenFamily('Qwen-Turbo')).toBe('TURBO');
    expect(resolveQwenFamily('QWEN-PLUS')).toBe('PLUS');
    expect(resolveQwenFamily('QWEN-MAX')).toBe('MAX');
  });

  it('returns null for non-Qwen model IDs', () => {
    expect(resolveQwenFamily('deepseek-v3')).toBeNull();
    expect(resolveQwenFamily('gpt-4')).toBeNull();
    expect(resolveQwenFamily('glm-4')).toBeNull();
  });

  it('returns null for qwen model without family suffix', () => {
    expect(resolveQwenFamily('qwen-72b')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// QWEN_FAMILY_DEFAULTS
// ---------------------------------------------------------------------------
describe('QWEN_FAMILY_DEFAULTS', () => {
  it('maps TURBO to qwen-turbo', () => {
    expect(QWEN_FAMILY_DEFAULTS.TURBO).toBe('qwen-turbo');
  });

  it('maps PLUS to qwen-plus', () => {
    expect(QWEN_FAMILY_DEFAULTS.PLUS).toBe('qwen-plus');
  });

  it('maps MAX to qwen-max', () => {
    expect(QWEN_FAMILY_DEFAULTS.MAX).toBe('qwen-max');
  });
});

// ---------------------------------------------------------------------------
// hasExtendedContextSuffix()
// ---------------------------------------------------------------------------
describe('hasExtendedContextSuffix()', () => {
  it('detects [1m] suffix', () => {
    expect(hasExtendedContextSuffix('qwen-plus[1m]')).toBe(true);
  });

  it('detects [200k] suffix', () => {
    expect(hasExtendedContextSuffix('qwen-max[200k]')).toBe(true);
  });

  it('detects [100k] suffix', () => {
    expect(hasExtendedContextSuffix('qwen-turbo[100k]')).toBe(true);
  });

  it('returns false for model ID without suffix', () => {
    expect(hasExtendedContextSuffix('qwen-plus')).toBe(false);
  });

  it('returns false for tier aliases', () => {
    expect(hasExtendedContextSuffix('medium')).toBe(false);
    expect(hasExtendedContextSuffix('high')).toBe(false);
    expect(hasExtendedContextSuffix('low')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isSubagentSafeModelId()
// ---------------------------------------------------------------------------
describe('isSubagentSafeModelId()', () => {
  it('accepts bare Qwen model IDs', () => {
    expect(isSubagentSafeModelId('qwen-plus')).toBe(true);
  });

  it('accepts DashScope-prefixed model IDs', () => {
    expect(isSubagentSafeModelId('dashscope/qwen-max')).toBe(true);
  });

  it('rejects [1m]-suffixed model ID', () => {
    expect(isSubagentSafeModelId('qwen-plus[1m]')).toBe(false);
  });

  it('rejects [200k]-suffixed model ID', () => {
    expect(isSubagentSafeModelId('qwen-max[200k]')).toBe(false);
  });

  it('accepts tier aliases (no extended context suffix)', () => {
    expect(isSubagentSafeModelId('medium')).toBe(true);
    expect(isSubagentSafeModelId('high')).toBe(true);
    expect(isSubagentSafeModelId('low')).toBe(true);
  });
});
