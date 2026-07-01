/**
 * Tests for the forceInherit hook's handling of [1m]-suffixed Bedrock model IDs.
 *
 * These tests verify the decision functions that underpin the updated forceInherit
 * block in scripts/pre-tool-enforcer.mjs. The hook uses isSubagentSafeModelId()
 * to decide whether to allow or deny an explicit `model` param, and
 * hasExtendedContextSuffix() to detect when the session model would cause a
 * silent sub-agent failure on Bedrock.
 *
 * Manual hook verification (stdin test):
 *   echo '{"tool_name":"Agent","toolInput":{},"cwd":"/tmp"}' | \
 *     DASHSCOPE_MODEL='dashscope/qwen-plus[1m]' \
 *     OMQ_ROUTING_FORCE_INHERIT=true \
 *     node scripts/pre-tool-enforcer.mjs
 *   → expect: continue (stripped ID is provider-specific — inheritance is safe)
 *
 *   echo '{"tool_name":"Agent","toolInput":{},"cwd":"/tmp"}' | \
 *     DASHSCOPE_MODEL='qwen-plus[1m]' \
 *     OMQ_ROUTING_FORCE_INHERIT=true \
 *     node scripts/pre-tool-enforcer.mjs
 *   → expect: deny (stripped ID is a bare Anthropic model ID, invalid on Bedrock)
 *
 *   echo '{"tool_name":"Agent","toolInput":{"model":"dashscope/qwen-plus-20250929-v1:0"},"cwd":"/tmp"}' | \
 *     DASHSCOPE_MODEL='dashscope/qwen-plus[1m]' \
 *     OMQ_ROUTING_FORCE_INHERIT=true \
 *     node scripts/pre-tool-enforcer.mjs
 *   → expect: continue (allowed through as valid Bedrock ID)
 */

import { spawnSync } from 'child_process';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  hasExtendedContextSuffix,
  isSubagentSafeModelId,
  isProviderSpecificModelId,
} from '../config/models.js';
import { saveAndClear, restore } from '../config/__tests__/test-helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK_PATH = resolve(__dirname, '../../scripts/pre-tool-enforcer.mjs');

const ENV_KEYS = ['DASHSCOPE_MODEL', 'QODER_MODEL', 'OMQ_ROUTING_FORCE_INHERIT', 'OMQ_SUBAGENT_MODEL'] as const;

// ---------------------------------------------------------------------------
// Hook ALLOW path: explicit model param is a valid provider-specific ID
// ---------------------------------------------------------------------------
describe('hook allow path — isSubagentSafeModelId(model) === true', () => {
  it('allows global. cross-region Bedrock profile (the standard escape hatch)', () => {
    expect(isSubagentSafeModelId('dashscope/qwen-plus-v1:0')).toBe(true);
  });

  it('allows us. regional Bedrock cross-region inference profile', () => {
    expect(isSubagentSafeModelId('dashscope/qwen-plus-20250929-v1:0')).toBe(true);
  });

  it('allows ap. regional Bedrock profile', () => {
    expect(isSubagentSafeModelId('dashscope/qwen-plus-v1:0')).toBe(true);
  });

  it('allows Bedrock ARN inference-profile format', () => {
    expect(isSubagentSafeModelId(
      'dashscope/qwen-max'
    )).toBe(true);
  });

  it('allows Vertex AI model ID', () => {
    expect(isSubagentSafeModelId('vertex_ai/qwen-plus@20250514')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Hook DENY path: explicit model param is invalid for sub-agents
// ---------------------------------------------------------------------------
describe('hook deny path — explicit model param is invalid', () => {
  it('denies [1m]-suffixed model ID (the core bug case)', () => {
    expect(isSubagentSafeModelId('dashscope/qwen-plus[1m]')).toBe(false);
  });

  it('denies [200k]-suffixed model ID', () => {
    expect(isSubagentSafeModelId('dashscope/qwen-plus[200k]')).toBe(false);
  });

  it('allows tier alias "medium" (no extended context suffix)', () => {
    expect(isSubagentSafeModelId('medium')).toBe(true);
  });

  it('allows tier alias "high" (no extended context suffix)', () => {
    expect(isSubagentSafeModelId('high')).toBe(true);
  });

  it('allows tier alias "low" (no extended context suffix)', () => {
    expect(isSubagentSafeModelId('low')).toBe(true);
  });

  it('allows bare Qwen model ID (no extended context suffix)', () => {
    expect(isSubagentSafeModelId('qwen-plus')).toBe(true);
    expect(isSubagentSafeModelId('qwen-max')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Session model [1m] detection — the no-model-param deny path
// ---------------------------------------------------------------------------
describe('session model [1m] detection — hasExtendedContextSuffix', () => {
  it('detects [1m] on the exact model from the bug report', () => {
    expect(hasExtendedContextSuffix('dashscope/qwen-plus[1m]')).toBe(true);
  });

  it('detects [200k] on hypothetical future variant', () => {
    expect(hasExtendedContextSuffix('dashscope/qwen-plus[200k]')).toBe(true);
  });

  it('does NOT flag the standard Bedrock profile without suffix', () => {
    expect(hasExtendedContextSuffix('dashscope/qwen-plus-v1:0')).toBe(false);
  });

  it('does NOT flag the opus env var from the bug report env', () => {
    // DASHSCOPE_DEFAULT_MAX_MODEL=dashscope/qwen-max-v1 (no [1m])
    expect(hasExtendedContextSuffix('dashscope/qwen-max-v1')).toBe(false);
  });

  it('does NOT flag the haiku env var from the bug report env', () => {
    // DASHSCOPE_DEFAULT_TURBO_MODEL=dashscope/qwen-turbo-20251001-v1:0
    expect(hasExtendedContextSuffix('dashscope/qwen-turbo-20251001-v1:0')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Provider-specific check still correct for Bedrock IDs used in guidance
// ---------------------------------------------------------------------------
describe('isProviderSpecificModelId — Bedrock IDs used in OMQ_SUBAGENT_MODEL guidance', () => {
  it('accepts the model from the 400 error message', () => {
    expect(isProviderSpecificModelId('dashscope/qwen-plus-20250929-v1:0')).toBe(true);
  });

  it('accepts dashscope/ prefixed model as provider-specific', () => {
    // isProviderSpecificModelId checks for lower.startsWith('dashscope/')
    expect(isProviderSpecificModelId('dashscope/qwen-plus-v1:0')).toBe(true);
  });

  it('rejects [1m]-suffixed model — isSubagentSafeModelId only checks suffix', () => {
    // isSubagentSafeModelId only checks for extended context suffix, not provider prefix
    expect(isSubagentSafeModelId('dashscope/qwen-plus[1m]')).toBe(false);
    expect(isSubagentSafeModelId('qwen-plus[1m]')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Environment-based session model detection (simulates hook reading env vars)
// ---------------------------------------------------------------------------
describe('environment-based session model detection', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => { saved = saveAndClear(ENV_KEYS); });
  afterEach(() => { restore(saved); });

  // Helper matching the dual-check logic in pre-tool-enforcer.mjs
  const sessionHasLmSuffix = () =>
    hasExtendedContextSuffix(process.env.QODER_MODEL || '') ||
    hasExtendedContextSuffix(process.env.DASHSCOPE_MODEL || '');

  it('detects [1m] session model via DASHSCOPE_MODEL env var', () => {
    process.env.DASHSCOPE_MODEL = 'dashscope/qwen-plus[1m]';
    expect(sessionHasLmSuffix()).toBe(true);
  });

  it('detects [1m] session model via QODER_MODEL env var', () => {
    process.env.QODER_MODEL = 'dashscope/qwen-plus[1m]';
    expect(sessionHasLmSuffix()).toBe(true);
  });

  it('detects [1m] when only DASHSCOPE_MODEL has suffix and QODER_MODEL is set without it', () => {
    // Split-brain scenario: QODER_MODEL is clean but DASHSCOPE_MODEL carries [1m].
    // A single QODER_MODEL || DASHSCOPE_MODEL lookup would miss this.
    process.env.QODER_MODEL = 'dashscope/qwen-plus-v1:0';
    process.env.DASHSCOPE_MODEL = 'dashscope/qwen-plus[1m]';
    expect(sessionHasLmSuffix()).toBe(true);
  });

  it('does not flag missing env vars', () => {
    expect(sessionHasLmSuffix()).toBe(false);
  });

  it('does not flag a valid Bedrock model in env vars', () => {
    process.env.DASHSCOPE_MODEL = 'dashscope/qwen-max-v1';
    expect(sessionHasLmSuffix()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Hook integration tests — spawn the hook and verify stdin→stdout behaviour
// ---------------------------------------------------------------------------

function runHook(
  toolInput: Record<string, unknown>,
  env: Record<string, string>,
): { denied: boolean; reason?: string } {
  const stdin = JSON.stringify({
    tool_name: 'Agent',
    toolInput,
    cwd: '/tmp',
    session_id: 'test-hook-integration',
  });
  const result = spawnSync('node', [HOOK_PATH], {
    input: stdin,
    encoding: 'utf8',
    env: {
      ...process.env,
      // Reset tier-resolution chain so host env doesn't leak into tests.
      OMQ_SUBAGENT_MODEL: '',
      OMQ_MODEL_LOW: '',
      OMQ_MODEL_MEDIUM: '',
      OMQ_MODEL_HIGH: '',
      DASHSCOPE_DEFAULT_LOW_MODEL: '',
      DASHSCOPE_DEFAULT_MEDIUM_MODEL: '',
      DASHSCOPE_DEFAULT_HIGH_MODEL: '',
      ...env,
      OMQ_ROUTING_FORCE_INHERIT: 'true',
    },
    timeout: 10000,
  });
  const lines = (result.stdout || '').split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed?.hookSpecificOutput?.permissionDecision === 'deny') {
        return { denied: true, reason: parsed.hookSpecificOutput.permissionDecisionReason };
      }
    } catch {
      // non-JSON line — skip
    }
  }
  return { denied: false };
}

describe('hook integration — force-inherit + [1m] scenarios', () => {
  it('denies [1m]-suffixed explicit model param', () => {
    const result = runHook(
      { model: 'dashscope/qwen-plus[1m]' },
      { DASHSCOPE_MODEL: 'dashscope/qwen-plus[1m]' },
    );
    expect(result.denied).toBe(true);
    expect(result.reason).toMatch(/\[1m\]/);
    expect(result.reason).toMatch(/MODEL ROUTING/);
  });

  it('allows valid Qwen model ID through without denying', () => {
    const result = runHook(
      { model: 'qwen-plus-20250929' },
      { DASHSCOPE_MODEL: 'qwen-plus[1m]' },
    );
    expect(result.denied).toBe(false);
  });

  it('denies no-model call when session model has [1m] suffix and guides to tier alias', () => {
    const result = runHook(
      {},
      { DASHSCOPE_MODEL: 'qwen-plus[1m]' },
    );
    expect(result.denied).toBe(true);
    // Guidance must recommend a tier alias (high/medium/low), not a raw model ID.
    // Agent tool schema only accepts tier aliases for the model param.
    expect(result.reason).toMatch(/model="medium"/);
    expect(result.reason).toMatch(/qwen-plus\[1m\]/);
  });

  it('derives tier alias from session model when DASHSCOPE_DEFAULT_MEDIUM_MODEL is set', () => {
    const result = runHook(
      {},
      {
        DASHSCOPE_MODEL: 'qwen-plus[1m]',
        DASHSCOPE_DEFAULT_MEDIUM_MODEL: 'qwen-plus-20250929',
      },
    );
    expect(result.denied).toBe(true);
    // normalizeToCcAlias(sessionModel) → 'medium'; resolvedSafe is truthy
    expect(result.reason).toMatch(/model="medium"/);
  });

  it('derives tier alias from OMQ_SUBAGENT_MODEL when set (backward compat)', () => {
    const result = runHook(
      {},
      {
        DASHSCOPE_MODEL: 'qwen-plus[1m]',
        OMQ_SUBAGENT_MODEL: 'qwen-plus-20250929',
      },
    );
    expect(result.denied).toBe(true);
    expect(result.reason).toMatch(/model="medium"/);
  });

  it('denies no-model call when only DASHSCOPE_MODEL has [1m] suffix (any [1m] triggers deny)', () => {
    // Our policy: any [1m] suffix in session model vars triggers deny and tier-alias guidance.
    // Even if stripped ID would be provider-specific, we always guide to tier alias for safety.
    const result = runHook(
      {},
      {
        QODER_MODEL: 'qwen-plus-v1',
        DASHSCOPE_MODEL: 'qwen-plus[1m]',
      },
    );
    expect(result.denied).toBe(true);
    expect(result.reason).toMatch(/model="medium"/);
  });

  it('denies no-model call when session model is a bare Anthropic ID with [1m] suffix', () => {
    // qwen-plus[1m] → session has [1m] → deny with tier alias guidance
    const result = runHook(
      {},
      { DASHSCOPE_MODEL: 'qwen-plus[1m]' },
    );
    expect(result.denied).toBe(true);
    expect(result.reason).toMatch(/model="medium"/);
    expect(result.reason).toMatch(/qwen-plus\[1m\]/);
  });

  it('derives tier alias from DASHSCOPE_DEFAULT_MEDIUM_MODEL for guidance in [1m] deny', () => {
    const result = runHook(
      {},
      {
        DASHSCOPE_MODEL: 'qwen-plus[1m]',
        DASHSCOPE_DEFAULT_MEDIUM_MODEL: 'qwen-plus-20250929',
      },
    );
    expect(result.denied).toBe(true);
    // normalizeToCcAlias('qwen-plus[1m]') → 'medium'; resolvedSafe is truthy
    expect(result.reason).toMatch(/model="medium"/);
  });

  it('denies no-model call when QODER_MODEL has [1m] and DASHSCOPE_MODEL has [1m]', () => {
    // Mixed case: both carry [1m] suffix.
    // The runtime may pick either, so both must be safe.
    const result = runHook(
      {},
      {
        QODER_MODEL: 'qwen-plus[1m]',
        DASHSCOPE_MODEL: 'qwen-plus[1m]',
      },
    );
    expect(result.denied).toBe(true);
    expect(result.reason).toMatch(/model="medium"/);
  });
});
