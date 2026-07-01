/**
 * Tests for non-default provider auto-detection
 *
 * When users configure non-Qwen models or custom DashScope endpoints,
 * OMQ should auto-enable forceInherit to avoid passing Qwen-specific
 * model tier names (turbo/plus/max) that cause errors on other providers.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isNonDefaultProvider } from '../config/models.js';
import { loadConfig } from '../config/loader.js';

describe('isNonDefaultProvider', () => {
  const savedEnv: Record<string, string | undefined> = {};
  const envKeys = [
    'QODER_MODEL',
    'DASHSCOPE_MODEL',
    'DASHSCOPE_BASE_URL',
    'OMQ_ROUTING_FORCE_INHERIT',
    'OMQ_MODEL_HIGH',
    'OMQ_MODEL_MEDIUM',
    'OMQ_MODEL_LOW',
    'DASHSCOPE_DEFAULT_MAX_MODEL',
    'DASHSCOPE_DEFAULT_PLUS_MODEL',
    'DASHSCOPE_DEFAULT_TURBO_MODEL',
  ];

  beforeEach(() => {
    for (const key of envKeys) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  });

  it('returns false when no env vars are set (default Qwen provider)', () => {
    expect(isNonDefaultProvider()).toBe(false);
  });

  // --- OMQ_ROUTING_FORCE_INHERIT ---

  it('returns true when OMQ_ROUTING_FORCE_INHERIT=true', () => {
    process.env.OMQ_ROUTING_FORCE_INHERIT = 'true';
    expect(isNonDefaultProvider()).toBe(true);
  });

  it('returns false when OMQ_ROUTING_FORCE_INHERIT=1 (only string "true" triggers)', () => {
    process.env.OMQ_ROUTING_FORCE_INHERIT = '1';
    expect(isNonDefaultProvider()).toBe(false);
  });

  it('returns false when OMQ_ROUTING_FORCE_INHERIT=0', () => {
    process.env.OMQ_ROUTING_FORCE_INHERIT = '0';
    expect(isNonDefaultProvider()).toBe(false);
  });

  it('returns false when OMQ_ROUTING_FORCE_INHERIT is not set', () => {
    expect(isNonDefaultProvider()).toBe(false);
  });

  // --- Non-Qwen model detection ---

  it('returns true when QODER_MODEL is a non-Qwen model', () => {
    process.env.QODER_MODEL = 'glm-5';
    expect(isNonDefaultProvider()).toBe(true);
  });

  it('returns true when DASHSCOPE_MODEL is a non-Qwen model', () => {
    process.env.DASHSCOPE_MODEL = 'deepseek-v3';
    expect(isNonDefaultProvider()).toBe(true);
  });

  it('returns true when DASHSCOPE_MODEL is glm-4 (future multi-provider)', () => {
    process.env.DASHSCOPE_MODEL = 'glm-4';
    expect(isNonDefaultProvider()).toBe(true);
  });

  it('detects kimi model as non-Qwen', () => {
    process.env.QODER_MODEL = 'kimi-k2';
    expect(isNonDefaultProvider()).toBe(true);
  });

  it('returns false when QODER_MODEL contains "qwen"', () => {
    process.env.QODER_MODEL = 'qwen-plus';
    expect(isNonDefaultProvider()).toBe(false);
  });

  it('returns false when DASHSCOPE_MODEL is a Qwen model', () => {
    process.env.DASHSCOPE_MODEL = 'qwen-max';
    expect(isNonDefaultProvider()).toBe(false);
  });

  it('is case-insensitive for Qwen detection in model name', () => {
    process.env.QODER_MODEL = 'Qwen-Plus';
    expect(isNonDefaultProvider()).toBe(false);
  });

  // --- DashScope base URL detection ---

  it('returns false when DASHSCOPE_BASE_URL contains dashscope.aliyuncs.com', () => {
    process.env.DASHSCOPE_BASE_URL = 'https://dashscope.aliyuncs.com/v1';
    expect(isNonDefaultProvider()).toBe(false);
  });

  it('returns true when DASHSCOPE_BASE_URL is a custom proxy', () => {
    process.env.DASHSCOPE_BASE_URL = 'https://my-proxy.example.com/v1';
    expect(isNonDefaultProvider()).toBe(true);
  });

  it('returns true when DASHSCOPE_BASE_URL is a non-DashScope URL', () => {
    process.env.DASHSCOPE_BASE_URL = 'https://api.deepseek.com/v1';
    expect(isNonDefaultProvider()).toBe(true);
  });

  // --- Tier model env vars ---

  it('returns true when DASHSCOPE_DEFAULT_PLUS_MODEL is non-Qwen', () => {
    process.env.DASHSCOPE_DEFAULT_PLUS_MODEL = 'kimi-k2.6:cloud';
    expect(isNonDefaultProvider()).toBe(true);
  });

  it('returns true when OMQ_MODEL_MEDIUM is non-Qwen', () => {
    process.env.OMQ_MODEL_MEDIUM = 'glm-5.1:cloud';
    expect(isNonDefaultProvider()).toBe(true);
  });
});

describe('loadConfig auto-enables forceInherit for non-Qwen providers', () => {
  const savedEnv: Record<string, string | undefined> = {};
  const envKeys = [
    'QODER_MODEL',
    'DASHSCOPE_MODEL',
    'DASHSCOPE_BASE_URL',
    'OMQ_ROUTING_FORCE_INHERIT',
    'OMQ_MODEL_HIGH',
    'OMQ_MODEL_MEDIUM',
    'OMQ_MODEL_LOW',
    'DASHSCOPE_DEFAULT_MAX_MODEL',
    'DASHSCOPE_DEFAULT_PLUS_MODEL',
    'DASHSCOPE_DEFAULT_TURBO_MODEL',
  ];

  beforeEach(() => {
    for (const key of envKeys) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  });

  it('auto-enables forceInherit when QODER_MODEL is non-Qwen', () => {
    process.env.QODER_MODEL = 'glm-5';
    const config = loadConfig();
    expect(config.routing?.forceInherit).toBe(true);
  });

  it('does not auto-enable forceInherit for partial OMQ tier env overrides', () => {
    process.env.OMQ_MODEL_HIGH = 'glm-5.1:cloud';
    const config = loadConfig();

    expect(config.routing?.forceInherit).toBe(false);
  });

  it('auto-enables forceInherit when DASHSCOPE_BASE_URL is non-DashScope', () => {
    process.env.DASHSCOPE_BASE_URL = 'https://litellm.example.com/v1';
    const config = loadConfig();
    expect(config.routing?.forceInherit).toBe(true);
  });

  it('does NOT auto-enable forceInherit for default Qwen setup', () => {
    const config = loadConfig();
    expect(config.routing?.forceInherit).toBe(false);
  });

  it('respects explicit OMQ_ROUTING_FORCE_INHERIT=false even with non-Qwen model', () => {
    process.env.QODER_MODEL = 'glm-5';
    process.env.OMQ_ROUTING_FORCE_INHERIT = 'false';
    const config = loadConfig();
    expect(config.routing?.forceInherit).toBe(false);
  });

  it('does not double-enable when OMQ_ROUTING_FORCE_INHERIT=true is already set', () => {
    process.env.OMQ_ROUTING_FORCE_INHERIT = 'true';
    const config = loadConfig();
    expect(config.routing?.forceInherit).toBe(true);
  });
});
