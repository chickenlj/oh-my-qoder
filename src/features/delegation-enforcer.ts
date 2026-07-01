/**
 * Delegation Enforcer
 *
 * Middleware that ensures model parameter is always present in Task/Agent calls.
 * Automatically injects the default model from agent definitions when not specified.
 *
 * This solves the problem where Qoder CLI doesn't automatically apply models
 * from agent definitions - every Task call must explicitly pass the model parameter.
 *
 * For non-default providers, forceInherit is auto-enabled by the config loader,
 * which causes this enforcer to strip model parameters so agents inherit the
 * user's configured model instead of receiving tier names (high/medium/low)
 * that the provider won't recognize.
 */

import { getAgentDefinitions } from '../agents/definitions.js';
import { normalizeDelegationRole } from './delegation-routing/types.js';
import { loadConfig } from '../config/loader.js';
import { isProviderSpecificModelId, resolveQwenFamily } from '../config/models.js';
import type { PluginConfig } from '../shared/types.js';

// ---------------------------------------------------------------------------
// Config cache — avoids repeated disk reads on every enforceModel() call (F10)
// ---------------------------------------------------------------------------

/** All env var names that affect the output of loadConfig(). */
const CONFIG_ENV_KEYS = [
  // forceInherit auto-detection (isNonDefaultProvider)
  'DASHSCOPE_BASE_URL',
  'QODER_MODEL',
  'DASHSCOPE_MODEL',
  // explicit routing overrides
  'OMQ_ROUTING_FORCE_INHERIT',
  'OMQ_ROUTING_ENABLED',
  'OMQ_ROUTING_DEFAULT_TIER',
  'OMQ_ESCALATION_ENABLED',
  // model alias overrides
  'OMQ_MODEL_ALIAS_LOW',
  'OMQ_MODEL_ALIAS_MEDIUM',
  'OMQ_MODEL_ALIAS_HIGH',
  // tier model resolution (feeds buildDefaultConfig)
  'OMQ_MODEL_HIGH',
  'OMQ_MODEL_MEDIUM',
  'OMQ_MODEL_LOW',
  'DASHSCOPE_DEFAULT_TURBO_MODEL',
  'DASHSCOPE_DEFAULT_PLUS_MODEL',
  'DASHSCOPE_DEFAULT_MAX_MODEL',
] as const;

function buildEnvCacheKey(): string {
  return CONFIG_ENV_KEYS.map((k) => `${k}=${process.env[k] ?? ''}`).join('|');
}

let _cachedConfig: PluginConfig | null = null;
let _cachedConfigKey = '';

function getCachedConfig(): PluginConfig {
  if (process.env.VITEST) {
    return loadConfig();
  }
  const key = buildEnvCacheKey();
  if (_cachedConfig === null || key !== _cachedConfigKey) {
    _cachedConfig = loadConfig();
    _cachedConfigKey = key;
  }
  return _cachedConfig;
}


/** Map Qwen model family to tier alias */
const FAMILY_TO_ALIAS: Record<string, string> = {
  MAX: 'high',
  PLUS: 'medium',
  TURBO: 'low',
};

/** Normalize a model ID to a tier alias (high/medium/low) if possible */
export function normalizeToTierAlias(model: string): string {
  if (isProviderSpecificModelId(model)) {
    return model;
  }

  const family = resolveQwenFamily(model);
  return family ? (FAMILY_TO_ALIAS[family] ?? model) : model;
}

/** @deprecated Use normalizeToTierAlias instead */
export const normalizeToCcAlias = normalizeToTierAlias;

/**
 * Agent input structure from Qoder Agent SDK
 */
export interface AgentInput {
  description: string;
  prompt: string;
  subagent_type: string;
  model?: string;
  resume?: string;
  run_in_background?: boolean;
}

/**
 * Result of model enforcement
 */
export interface EnforcementResult {
  /** Original input */
  originalInput: AgentInput;
  /** Modified input with model enforced */
  modifiedInput: AgentInput;
  /** Whether model was auto-injected */
  injected: boolean;
  /** The model that was used */
  model: string;
  /** Warning message (only if OMQ_DEBUG=true) */
  warning?: string;
}

function isDelegationToolName(toolName: string): boolean {
  const normalizedToolName = toolName.toLowerCase();
  return normalizedToolName === 'agent' || normalizedToolName === 'task';
}

function canonicalizeSubagentType(subagentType: string): string {
  const hasPrefix = subagentType.startsWith('oh-my-qoder:');
  const rawAgentType = subagentType.replace(/^oh-my-qoder:/, '');
  const canonicalAgentType = normalizeDelegationRole(rawAgentType);
  return hasPrefix ? `oh-my-qoder:${canonicalAgentType}` : canonicalAgentType;
}

/**
 * Enforce model parameter for an agent delegation call
 */
export function enforceModel(agentInput: AgentInput): EnforcementResult {
  const canonicalSubagentType = canonicalizeSubagentType(agentInput.subagent_type);

  const config = getCachedConfig();
  if (config.routing?.forceInherit) {
    const { model: _existing, ...rest } = agentInput;
    const cleanedInput: AgentInput = { ...(rest as AgentInput), subagent_type: canonicalSubagentType };
    return {
      originalInput: agentInput,
      modifiedInput: cleanedInput,
      injected: false,
      model: 'inherit',
    };
  }

  if (agentInput.model) {
    const normalizedModel = normalizeToTierAlias(agentInput.model);
    return {
      originalInput: agentInput,
      modifiedInput: { ...agentInput, subagent_type: canonicalSubagentType, model: normalizedModel },
      injected: false,
      model: normalizedModel,
    };
  }

  const agentType = canonicalSubagentType.replace(/^oh-my-qoder:/, '');
  const agentDefs = getAgentDefinitions({ config });
  const agentDef = agentDefs[agentType];

  if (!agentDef) {
    throw new Error(`Unknown agent type: ${agentType} (from ${agentInput.subagent_type})`);
  }

  if (!agentDef.model) {
    throw new Error(`No default model defined for agent: ${agentType}`);
  }

  let resolvedModel = agentDef.model;
  const aliases = config.routing?.modelAliases;
  const aliasSourceModel = agentDef.defaultModel ?? agentDef.model;
  if (aliases && aliasSourceModel && aliasSourceModel !== 'inherit') {
    const alias = aliases[aliasSourceModel as keyof typeof aliases];
    if (alias) {
      resolvedModel = alias;
    }
  }

  if (resolvedModel === 'inherit') {
    const { model: _existing, ...rest } = agentInput;
    const cleanedInput: AgentInput = { ...(rest as AgentInput), subagent_type: canonicalSubagentType };
    return {
      originalInput: agentInput,
      modifiedInput: cleanedInput,
      injected: false,
      model: 'inherit',
    };
  }

  const normalizedModel = normalizeToTierAlias(resolvedModel);

  const modifiedInput: AgentInput = {
    ...agentInput,
    subagent_type: canonicalSubagentType,
    model: normalizedModel,
  };

  let warning: string | undefined;
  if (process.env.OMQ_DEBUG === 'true') {
    const aliasNote = resolvedModel !== agentDef.model && aliasSourceModel
      ? ` (aliased from ${aliasSourceModel})`
      : '';
    const normalizedNote = normalizedModel !== resolvedModel
      ? ` (normalized from ${resolvedModel})`
      : '';
    warning = `[OMQ] Auto-injecting model: ${normalizedModel} for ${agentType}${aliasNote}${normalizedNote}`;
  }

  return {
    originalInput: agentInput,
    modifiedInput,
    injected: true,
    model: normalizedModel,
    warning,
  };
}

/**
 * Check if tool input is an agent delegation call
 */
export function isAgentCall(toolName: string, toolInput: unknown): toolInput is AgentInput {
  if (!isDelegationToolName(toolName)) {
    return false;
  }

  if (!toolInput || typeof toolInput !== 'object') {
    return false;
  }

  const input = toolInput as Record<string, unknown>;
  return (
    typeof input.subagent_type === 'string' &&
    typeof input.prompt === 'string' &&
    typeof input.description === 'string'
  );
}

/**
 * Process a pre-tool-use hook for model enforcement
 */
export function processPreToolUse(
  toolName: string,
  toolInput: unknown
): { modifiedInput: unknown; warning?: string } {
  if (!isAgentCall(toolName, toolInput)) {
    return { modifiedInput: toolInput };
  }

  const result = enforceModel(toolInput);

  if (result.warning) {
    console.warn(result.warning);
  }

  return {
    modifiedInput: result.modifiedInput,
    warning: result.warning,
  };
}

/**
 * Get model for an agent type (for testing/debugging)
 */
export function getModelForAgent(agentType: string): string {
  const normalizedType = normalizeDelegationRole(agentType.replace(/^oh-my-qoder:/, ''));
  const agentDefs = getAgentDefinitions({ config: getCachedConfig() });
  const agentDef = agentDefs[normalizedType];

  if (!agentDef) {
    throw new Error(`Unknown agent type: ${normalizedType}`);
  }

  if (!agentDef.model) {
    throw new Error(`No default model defined for agent: ${normalizedType}`);
  }

  return normalizeToTierAlias(agentDef.model);
}
