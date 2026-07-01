import { validateDashScopeBaseUrl } from '../utils/ssrf-guard.js';

export type ModelTier = 'LOW' | 'MEDIUM' | 'HIGH';
export type QwenModelFamily = 'TURBO' | 'PLUS' | 'MAX';

const DIRECT_MODEL_ENV_KEYS = ['QODER_MODEL', 'DASHSCOPE_MODEL'] as const;
const INHERIT_TIER_PRIORITY: readonly ModelTier[] = ['MEDIUM', 'HIGH', 'LOW'];
const QODER_TIER_ALIASES = new Set(['high', 'medium', 'low']);

const TIER_ENV_KEYS: Record<ModelTier, readonly string[]> = {
  LOW: [
    'OMQ_MODEL_LOW',
    'DASHSCOPE_DEFAULT_TURBO_MODEL',
  ],
  MEDIUM: [
    'OMQ_MODEL_MEDIUM',
    'DASHSCOPE_DEFAULT_PLUS_MODEL',
  ],
  HIGH: [
    'OMQ_MODEL_HIGH',
    'DASHSCOPE_DEFAULT_MAX_MODEL',
  ],
};

export const QWEN_FAMILY_DEFAULTS: Record<QwenModelFamily, string> = {
  TURBO: 'qwen-turbo',
  PLUS: 'qwen-plus',
  MAX: 'qwen-max',
};

export const BUILTIN_TIER_MODEL_DEFAULTS: Record<ModelTier, string> = {
  LOW: QWEN_FAMILY_DEFAULTS.TURBO,
  MEDIUM: QWEN_FAMILY_DEFAULTS.PLUS,
  HIGH: QWEN_FAMILY_DEFAULTS.MAX,
};

export const BUILTIN_EXTERNAL_MODEL_DEFAULTS = {
  codexModel: 'gpt-5.3-codex',
  geminiModel: 'gemini-3.1-pro-preview',
} as const;

/**
 * Centralized Model ID Constants
 *
 * All default model IDs are defined here so they can be overridden
 * via environment variables without editing source code.
 *
 * Environment variables (highest precedence):
 *   OMQ_MODEL_HIGH    - Model ID for HIGH tier (qwen-max class)
 *   OMQ_MODEL_MEDIUM  - Model ID for MEDIUM tier (qwen-plus class)
 *   OMQ_MODEL_LOW     - Model ID for LOW tier (qwen-turbo class)
 *
 * User config (~/.config/qoder-omq/config.jsonc) can also override
 * via `routing.tierModels` or per-agent `agents.<name>.model`.
 */

function readEnvValue(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value || undefined;
}

function resolveTierModelFromEnv(tier: ModelTier): string | undefined {
  for (const key of TIER_ENV_KEYS[tier]) {
    const value = readEnvValue(key);
    if (value) {
      return value;
    }
  }

  return undefined;
}

function getDirectModelEnvValue(): string | undefined {
  for (const key of DIRECT_MODEL_ENV_KEYS) {
    const value = readEnvValue(key);
    if (value) {
      return value;
    }
  }

  return undefined;
}

function getProviderDetectionModelEnvValues(): string[] {
  const directModel = getDirectModelEnvValue();
  if (directModel) {
    return [directModel];
  }

  const values = new Set<string>();
  for (const tier of INHERIT_TIER_PRIORITY) {
    const value = resolveTierModelFromEnv(tier);
    if (value) {
      values.add(value);
    }
  }

  return [...values];
}

function getDirectProviderDetectionModelEnvValues(): string[] {
  const directModel = getDirectModelEnvValue();
  return directModel ? [directModel] : [];
}

export function resolveInheritedModelFromEnv(): string | undefined {
  const directModel = getDirectModelEnvValue();
  if (directModel) {
    return directModel;
  }

  for (const tier of INHERIT_TIER_PRIORITY) {
    const value = resolveTierModelFromEnv(tier);
    if (value) {
      return value;
    }
  }

  return undefined;
}

export function hasTierModelEnvOverrides(): boolean {
  return Object.values(TIER_ENV_KEYS).some((keys) =>
    keys.some((key) => {
      return Boolean(readEnvValue(key));
    })
  );
}

export function getDefaultModelHigh(): string {
  return resolveTierModelFromEnv('HIGH') || BUILTIN_TIER_MODEL_DEFAULTS.HIGH;
}

export function getDefaultModelMedium(): string {
  return resolveTierModelFromEnv('MEDIUM') || BUILTIN_TIER_MODEL_DEFAULTS.MEDIUM;
}

export function getDefaultModelLow(): string {
  return resolveTierModelFromEnv('LOW') || BUILTIN_TIER_MODEL_DEFAULTS.LOW;
}

export function getDefaultTierModels(): Record<ModelTier, string> {
  return {
    LOW: getDefaultModelLow(),
    MEDIUM: getDefaultModelMedium(),
    HIGH: getDefaultModelHigh(),
  };
}

export function resolveQwenFamily(modelId: string): QwenModelFamily | null {
  const lower = modelId.toLowerCase();
  if (!lower.includes('qwen')) return null;

  if (lower.includes('turbo')) return 'TURBO';
  if (lower.includes('plus')) return 'PLUS';
  if (lower.includes('max')) return 'MAX';

  return null;
}

export function getBuiltinExternalDefaultModel(provider: 'codex' | 'gemini'): string {
  return provider === 'codex'
    ? BUILTIN_EXTERNAL_MODEL_DEFAULTS.codexModel
    : BUILTIN_EXTERNAL_MODEL_DEFAULTS.geminiModel;
}

/**
 * Detect whether a model ID has a Qoder CLI extended-context window suffix
 * (e.g., `[1m]`, `[200k]`) that is NOT valid for sub-agent spawning.
 */
export function hasExtendedContextSuffix(modelId: string): boolean {
  return /\[\d+[mk]\]$/i.test(modelId);
}

/**
 * Check whether a model ID is a provider-specific identifier that should NOT
 * be normalized to a tier alias (high/medium/low).
 *
 * Provider-specific IDs include DashScope-specific formats or any model ID
 * that is not a simple tier alias and should be passed through as-is.
 */
export function isProviderSpecificModelId(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  if (lower.startsWith('dashscope/')) {
    return true;
  }
  // Bedrock cross-region inference IDs (e.g. us.anthropic.qwen-max-v1:0)
  if (/^[a-z]{2}\.anthropic\./.test(lower)) {
    return true;
  }
  // Bedrock ARN-based model IDs
  if (lower.startsWith('arn:aws:bedrock:')) {
    return true;
  }
  // Vertex AI model IDs (e.g. vertex_ai/qwen-plus@20250514)
  if (lower.startsWith('vertex_ai/')) {
    return true;
  }
  return false;
}

/**
 * Check whether a model ID is safe to pass as the `model` parameter when
 * spawning sub-agents.
 */
export function isSubagentSafeModelId(modelId: string): boolean {
  return !hasExtendedContextSuffix(modelId);
}

function hasNonQwenModelId(modelIds: readonly string[]): boolean {
  for (const modelId of modelIds) {
    const lower = modelId.toLowerCase();
    // Provider-specific model IDs (Bedrock, Vertex, ARN) are always non-default,
    // even if they happen to contain "qwen" in the model name.
    if (isProviderSpecificModelId(modelId)) {
      return true;
    }
    if (!lower.includes('qwen') && !QODER_TIER_ALIASES.has(lower)) {
      return true;
    }
  }

  return false;
}

/**
 * Detect whether OMQ should avoid passing Qwen-specific model tier
 * names (high/medium/low) to the Agent tool.
 *
 * Returns true when:
 * - User explicitly set OMQ_ROUTING_FORCE_INHERIT=true
 * - A non-Qwen model ID is detected (e.g. DeepSeek, GLM, etc.)
 * - A custom DASHSCOPE_BASE_URL points to a non-DashScope endpoint
 */
export function isNonDefaultProvider(): boolean {
  if (process.env.OMQ_ROUTING_FORCE_INHERIT === 'true') {
    return true;
  }

  if (hasNonQwenModelId(getProviderDetectionModelEnvValues())) {
    return true;
  }

  const baseUrl = process.env.DASHSCOPE_BASE_URL || '';
  if (baseUrl) {
    const validation = validateDashScopeBaseUrl(baseUrl);
    if (!validation.allowed) {
      console.error(`[SSRF Guard] Rejecting DASHSCOPE_BASE_URL: ${validation.reason}`);
      return true;
    }
    if (!baseUrl.includes('dashscope.aliyuncs.com')) {
      return true;
    }
  }

  return false;
}

/**
 * Detect whether provider state should globally force Agent/Task calls to
 * inherit the parent session model.
 */
export function shouldAutoForceInherit(): boolean {
  if (process.env.OMQ_ROUTING_FORCE_INHERIT === 'true') {
    return true;
  }

  const directModelValues = getDirectProviderDetectionModelEnvValues();
  if (hasNonQwenModelId(directModelValues)) {
    return true;
  }

  const baseUrl = process.env.DASHSCOPE_BASE_URL || '';
  if (baseUrl) {
    const validation = validateDashScopeBaseUrl(baseUrl);
    if (!validation.allowed) {
      console.error(`[SSRF Guard] Rejecting DASHSCOPE_BASE_URL: ${validation.reason}`);
      return true;
    }
    if (!baseUrl.includes('dashscope.aliyuncs.com')) {
      return true;
    }
  }

  return false;
}
