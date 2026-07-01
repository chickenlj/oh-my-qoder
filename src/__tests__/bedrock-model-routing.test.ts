/**
 * Repro test for Bedrock model routing bug
 *
 * Bug: On Bedrock, workers get model ID "qwen-plus" (bare builtin default)
 * instead of inheriting the parent model. On Bedrock, this bare ID is invalid
 * — Bedrock requires full IDs like "dashscope/qwen-plus-v1:0".
 *
 * Root cause chain:
 * 1. buildDefaultConfig() → config.agents.executor.model = 'qwen-plus'
 *    (from QWEN_FAMILY_DEFAULTS.PLUS, because no Bedrock env vars found)
 * 2. getAgentDefinitions() resolves executor.model = 'qwen-plus'
 *    (configuredModel from config takes precedence over agent's defaultModel)
 * 3. enforceModel() injects 'qwen-plus' into Task calls
 * 4. Qoder CLI passes it to Bedrock API → 400 invalid model
 *
 * The defense (forceInherit) works IF OMQ_ROUTING_FORCE_INHERIT=1 is in the env.
 * But if that env var doesn't propagate to the MCP server / hook process,
 * forceInherit is never auto-enabled, and bare model IDs leak through.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// ── Env helpers ──────────────────────────────────────────────────────────────

const BEDROCK_ENV_KEYS = [
  'OMQ_ROUTING_FORCE_INHERIT',
  'OMQ_ROUTING_FORCE_INHERIT',
  'QODER_MODEL',
  'DASHSCOPE_MODEL',
  'DASHSCOPE_BASE_URL',
  'DASHSCOPE_DEFAULT_PLUS_MODEL',
  'DASHSCOPE_DEFAULT_MAX_MODEL',
  'DASHSCOPE_DEFAULT_TURBO_MODEL',
  'DASHSCOPE_DEFAULT_PLUS_MODEL',
  'DASHSCOPE_DEFAULT_MAX_MODEL',
  'DASHSCOPE_DEFAULT_TURBO_MODEL',
  'OMQ_MODEL_HIGH',
  'OMQ_MODEL_MEDIUM',
  'OMQ_MODEL_LOW',
  'OMQ_ROUTING_FORCE_INHERIT',
  'OMQ_ROUTING_ENABLED',
] as const;

function saveAndClear(): Record<string, string | undefined> {
  const saved: Record<string, string | undefined> = {};
  for (const key of BEDROCK_ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  return saved;
}

function restore(saved: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Bedrock model routing repro', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = saveAndClear();
  });
  afterEach(() => {
    restore(saved);
  });

  // ── Unit tests: building blocks ────────────────────────────────────────────

  describe('detection: isNonDefaultProvider()', () => {
    it('detects OMQ_ROUTING_FORCE_INHERIT=true', async () => {
      process.env.OMQ_ROUTING_FORCE_INHERIT = 'true';
      const { isNonDefaultProvider } = await import('../config/models.js');
      expect(isNonDefaultProvider()).toBe(true);
    });

    it('detects Bedrock model ID in QODER_MODEL', async () => {
      process.env.QODER_MODEL = 'dashscope/qwen-plus-v1:0';
      const { isNonDefaultProvider } = await import('../config/models.js');
      expect(isNonDefaultProvider()).toBe(true);
    });

    it('detects Bedrock model ID in DASHSCOPE_MODEL', async () => {
      process.env.DASHSCOPE_MODEL = 'dashscope/qwen-plus-v1:0';
      const { isNonDefaultProvider } = await import('../config/models.js');
      expect(isNonDefaultProvider()).toBe(true);
    });

    it('returns false when no Bedrock signals present', async () => {
      const { isNonDefaultProvider } = await import('../config/models.js');
      expect(isNonDefaultProvider()).toBe(false);
    });
  });

  describe('tier resolution: getDefaultModelMedium()', () => {
    it('reads DASHSCOPE_DEFAULT_PLUS_MODEL', async () => {
      process.env.DASHSCOPE_DEFAULT_PLUS_MODEL = 'dashscope/qwen-plus-v1:0';
      const { getDefaultModelMedium } = await import('../config/models.js');
      expect(getDefaultModelMedium()).toBe('dashscope/qwen-plus-v1:0');
    });

    it('falls back to bare "qwen-plus" without env vars', async () => {
      const { getDefaultModelMedium } = await import('../config/models.js');
      // getDefaultModelMedium returns the raw config value (not normalized)
      expect(getDefaultModelMedium()).toBe('qwen-plus');
    });
  });

  // ── E2E Repro Scenario A ──────────────────────────────────────────────────
  // OMQ_ROUTING_FORCE_INHERIT=1 not propagated to MCP/hook process

  describe('SCENARIO A: OMQ_ROUTING_FORCE_INHERIT not propagated to hook process', () => {
    it('full chain: Task call injects invalid model for Bedrock', async () => {
      // ── Setup: simulate MCP server process that did NOT inherit
      //    OMQ_ROUTING_FORCE_INHERIT from parent Qoder CLI process ──
      // (all Bedrock env vars already cleared by beforeEach)

      // 1. Bedrock detection fails
      const { isNonDefaultProvider } = await import('../config/models.js');
      expect(isNonDefaultProvider()).toBe(false);
      expect(isNonDefaultProvider()).toBe(false);

      // 2. loadConfig does NOT auto-enable forceInherit
      const { loadConfig } = await import('../config/loader.js');
      const config = loadConfig();
      expect(config.routing?.forceInherit).toBe(false);

      // 3. Agent definitions use full builtin model IDs from config
      const { getAgentDefinitions } = await import('../agents/definitions.js');
      const defs = getAgentDefinitions({ config });
      expect(defs['executor'].model).toBe('qwen-plus');
      expect(defs['explore'].model).toBe('qwen-turbo');
      expect(defs['architect'].model).toBe('qwen-max');

      // 4. enforceModel normalizes to bare CC-supported aliases (FIX)
      const { enforceModel } = await import('../features/delegation-enforcer.js');

      // 4a. executor → 'medium' (normalized from config's full model ID)
      const executorResult = enforceModel({
        description: 'Implement feature',
        prompt: 'Write the code',
        subagent_type: 'oh-my-qoder:executor',
      });
      expect(executorResult.injected).toBe(true);
      expect(executorResult.modifiedInput.model).toBe('medium');

      // 4b. explore → 'low'
      const exploreResult = enforceModel({
        description: 'Find files',
        prompt: 'Search codebase',
        subagent_type: 'oh-my-qoder:explore',
      });
      expect(exploreResult.injected).toBe(true);
      expect(exploreResult.modifiedInput.model).toBe('low');

      // 4c. architect → 'high'
      const architectResult = enforceModel({
        description: 'Design system',
        prompt: 'Analyze architecture',
        subagent_type: 'oh-my-qoder:architect',
      });
      expect(architectResult.injected).toBe(true);
      expect(architectResult.modifiedInput.model).toBe('high');

      // 5. After fix: these are valid CC aliases that CC resolves on any provider
      expect(['medium', 'high', 'low'].includes(executorResult.modifiedInput.model!)).toBe(true);
      expect(['medium', 'high', 'low'].includes(exploreResult.modifiedInput.model!)).toBe(true);
      expect(['medium', 'high', 'low'].includes(architectResult.modifiedInput.model!)).toBe(true);
    });

    it('the defense works when OMQ_ROUTING_FORCE_INHERIT IS propagated', async () => {
      // Same scenario but with the env var properly set
      process.env.OMQ_ROUTING_FORCE_INHERIT = 'true';

      const { isNonDefaultProvider } = await import('../config/models.js');
      expect(isNonDefaultProvider()).toBe(true);

      const { loadConfig } = await import('../config/loader.js');
      const config = loadConfig();
      expect(config.routing?.forceInherit).toBe(true);

      const { enforceModel } = await import('../features/delegation-enforcer.js');

      // All agents get model stripped → inherit parent
      for (const agent of ['executor', 'explore', 'architect', 'debugger', 'verifier']) {
        const result = enforceModel({
          description: 'test',
          prompt: 'test',
          subagent_type: `oh-my-qoder:${agent}`,
        });
        expect(result.model).toBe('inherit');
        expect(result.modifiedInput.model).toBeUndefined();
      }
    });
  });

  // ── E2E Repro Scenario B ──────────────────────────────────────────────────
  // User has DASHSCOPE_DEFAULT_PLUS_MODEL in Bedrock format,
  // but OMQ_ROUTING_FORCE_INHERIT and QODER_MODEL/DASHSCOPE_MODEL are missing

  describe('SCENARIO B: Bedrock tier env vars set without session model env vars', () => {
    it('full chain: tier env Bedrock models do not globally force inherit', async () => {
      // ── Setup: user has Bedrock-format models in DASHSCOPE_DEFAULT_*_MODEL
      //    (as shown in their settings) but OMQ_ROUTING_FORCE_INHERIT is not set ──
      process.env.DASHSCOPE_DEFAULT_PLUS_MODEL = 'dashscope/qwen-plus-v1:0';
      process.env.DASHSCOPE_DEFAULT_MAX_MODEL = 'dashscope/qwen-max-v1:0';
      process.env.DASHSCOPE_DEFAULT_TURBO_MODEL = 'dashscope/qwen-turbo-v1:0';

      // 1. isNonDefaultProvider now checks tier model env vars too.
      const { isNonDefaultProvider } = await import('../config/models.js');
      expect(isNonDefaultProvider()).toBe(true);
      expect(isNonDefaultProvider()).toBe(true);

      // 2. tier-only provider IDs do not globally force all spawned agents to inherit.
      const { loadConfig } = await import('../config/loader.js');
      const config = loadConfig();
      expect(config.routing?.forceInherit).toBe(false);

      // 3. BUT tier model resolution DOES read the Bedrock IDs
      const { getDefaultModelMedium, getDefaultModelHigh, getDefaultModelLow } =
        await import('../config/models.js');
      expect(getDefaultModelMedium()).toBe('dashscope/qwen-plus-v1:0');
      expect(getDefaultModelHigh()).toBe('dashscope/qwen-max-v1:0');
      expect(getDefaultModelLow()).toBe('dashscope/qwen-turbo-v1:0');

      // 4. config.agents get the Bedrock-format model IDs
      expect(config.agents?.executor?.model).toBe('dashscope/qwen-plus-v1:0');
      expect(config.agents?.architect?.model).toBe('dashscope/qwen-max-v1:0');
      expect(config.agents?.explore?.model).toBe('dashscope/qwen-turbo-v1:0');

      // 5. enforceModel injects the configured tier provider ID for that agent,
      // instead of collapsing every agent call into inheritance mode.
      const { enforceModel } = await import('../features/delegation-enforcer.js');
      const result = enforceModel({
        description: 'Implement feature',
        prompt: 'Write the code',
        subagent_type: 'oh-my-qoder:executor',
      });
      expect(result.injected).toBe(true);
      expect(result.model).toBe('dashscope/qwen-plus-v1:0');
      expect(result.modifiedInput.model).toBe('dashscope/qwen-plus-v1:0');
    });

    it('isNonDefaultProvider detects Bedrock patterns in tier env vars', async () => {
      // ANTHROPIC_DEFAULT_*_MODEL values can be the only Bedrock signal
      // when QODER_MODEL/DASHSCOPE_MODEL are unset.
      process.env.DASHSCOPE_DEFAULT_PLUS_MODEL = 'dashscope/qwen-plus-v1:0';

      const { isNonDefaultProvider, hasTierModelEnvOverrides } = await import('../config/models.js');

      // The env var IS detected by hasTierModelEnvOverrides
      expect(hasTierModelEnvOverrides()).toBe(true);

      // isNonDefaultProvider now scans tier env vars for Bedrock patterns.
      expect(isNonDefaultProvider()).toBe(true);
    });
  });

  // ── E2E Repro: LLM bypasses hook by passing model directly ────────────────

  describe('SCENARIO C: LLM passes explicit model in Task call', () => {
    it('bridge hook strips model when forceInherit is enabled', async () => {
      // When forceInherit IS enabled, the bridge pre-tool-use hook at
      // bridge.ts:1082-1093 strips the model param from Task calls.
      // This works correctly.
      process.env.OMQ_ROUTING_FORCE_INHERIT = 'true';

      const { loadConfig } = await import('../config/loader.js');
      const config = loadConfig();
      expect(config.routing?.forceInherit).toBe(true);

      // Simulate what the bridge does:
      const taskInput: Record<string, unknown> = {
        description: 'Implement feature',
        prompt: 'Write the code',
        subagent_type: 'oh-my-qoder:executor',
        model: 'medium', // LLM passes this based on CLAUDE.md instructions
      };

      // Bridge logic (bridge.ts:1082-1093):
      const nextTaskInput = { ...taskInput };
      if (nextTaskInput.model && config.routing?.forceInherit) {
        delete nextTaskInput.model;
      }

      expect(nextTaskInput.model).toBeUndefined();
      // Worker inherits parent → works on Bedrock
    });

    it('bridge hook does NOT strip model when forceInherit is disabled', async () => {
      // Without forceInherit, the explicit model from LLM passes through
      // (no Bedrock env vars → forceInherit=false)

      const { loadConfig } = await import('../config/loader.js');
      const config = loadConfig();
      expect(config.routing?.forceInherit).toBe(false);

      // Simulate what the bridge does:
      const taskInput: Record<string, unknown> = {
        description: 'Implement feature',
        prompt: 'Write the code',
        subagent_type: 'oh-my-qoder:executor',
        model: 'medium', // LLM passes this based on CLAUDE.md instructions
      };

      const nextTaskInput = { ...taskInput };
      if (nextTaskInput.model && config.routing?.forceInherit) {
        delete nextTaskInput.model;
      }

      // Model NOT stripped → 'medium' passes through to Qoder CLI
      expect(nextTaskInput.model).toBe('medium');
      // Qoder CLI resolves 'medium' → 'qwen-plus' → Bedrock 400
    });

    it('even when enforceModel strips, LLM can still pass model directly', async () => {
      // The LLM can pass model: "medium" in the Task call because the
      // CLAUDE.md instructions say: "Pass model on Task calls: haiku, sonnet, opus"
      //
      // enforceModel only runs when model is NOT specified (it injects default).
      // If the LLM explicitly passes model, enforceModel preserves it (line 83-90).
      // Only the bridge hook strip (lines 1082-1093) catches explicit models.

      // Without forceInherit, explicit model from LLM passes straight through
      const { enforceModel } = await import('../features/delegation-enforcer.js');
      const result = enforceModel({
        description: 'Implement feature',
        prompt: 'Write the code',
        subagent_type: 'oh-my-qoder:executor',
        model: 'medium', // LLM passes this explicitly
      });

      // enforceModel preserves explicit model (doesn't override it)
      expect(result.injected).toBe(false);
      expect(result.modifiedInput.model).toBe('medium');
      // → Qoder CLI resolves 'medium' → Bedrock can't handle it → 400
    });
  });

  // ── Summary: which scenario matches the reported error? ────────────────────

  describe('DIAGNOSIS: matching error to scenario', () => {
    it('reported error uses "qwen-plus" → matches enforceModel injection path', async () => {
      const { enforceModel } = await import('../features/delegation-enforcer.js');
      const result = enforceModel({
        description: 'test',
        prompt: 'test',
        subagent_type: 'oh-my-qoder:executor',
      });

      // This is exactly the model ID from the error report
      expect(result.modifiedInput.model).toBe('medium');
    });
  });

  // ── FIX VERIFICATION ──────────────────────────────────────────────────────

  describe('FIX: PreToolUse hook denies Task calls with model on Bedrock', () => {
    it('returns permissionDecision:deny when Task has model and forceInherit is enabled', async () => {
      process.env.OMQ_ROUTING_FORCE_INHERIT = 'true';

      // Import the bridge processPreToolUse indirectly by calling processHookBridge
      const bridge = await import('../hooks/bridge.js');

      // Simulate a PreToolUse hook input for a Task call with model
      const hookInput = {
        sessionId: 'test-session',
        toolName: 'Task',
        toolInput: {
          description: 'Implement feature',
          prompt: 'Write the code',
          subagent_type: 'oh-my-qoder:executor',
          model: 'qwen-plus',
        },
        directory: process.cwd(),
      };

      const result = await bridge.processHook('pre-tool-use', hookInput);
      const parsed = typeof result === 'string' ? JSON.parse(result) : result;

      // Should deny with permissionDecision
      expect(parsed.hookSpecificOutput?.permissionDecision).toBe('deny');
      expect(parsed.hookSpecificOutput?.permissionDecisionReason).toContain('qwen-plus');
      expect(parsed.hookSpecificOutput?.permissionDecisionReason).toContain('model');
    });

    it('allows Task calls without model even on Bedrock', async () => {
      process.env.OMQ_ROUTING_FORCE_INHERIT = 'true';

      const bridge = await import('../hooks/bridge.js');

      const hookInput = {
        sessionId: 'test-session',
        toolName: 'Task',
        toolInput: {
          description: 'Implement feature',
          prompt: 'Write the code',
          subagent_type: 'oh-my-qoder:executor',
          // No model param — this is the correct behavior
        },
        directory: process.cwd(),
      };

      const result = await bridge.processHook('pre-tool-use', hookInput);
      const parsed = typeof result === 'string' ? JSON.parse(result) : result;

      // Should allow (no deny)
      expect(parsed.hookSpecificOutput?.permissionDecision).not.toBe('deny');
    });

    it('allows Task calls with model when NOT on Bedrock', async () => {
      // No Bedrock env → forceInherit=false → model allowed
      const bridge = await import('../hooks/bridge.js');

      const hookInput = {
        sessionId: 'test-session',
        toolName: 'Task',
        toolInput: {
          description: 'Implement feature',
          prompt: 'Write the code',
          subagent_type: 'oh-my-qoder:executor',
          model: 'medium',
        },
        directory: process.cwd(),
      };

      const result = await bridge.processHook('pre-tool-use', hookInput);
      const parsed = typeof result === 'string' ? JSON.parse(result) : result;

      // Should allow (no deny)
      expect(parsed.hookSpecificOutput?.permissionDecision).not.toBe('deny');
    });
  });

  describe('FIX: SessionStart injects Bedrock model routing override', () => {
    it('injects override message when forceInherit is enabled', async () => {
      process.env.OMQ_ROUTING_FORCE_INHERIT = 'true';

      const bridge = await import('../hooks/bridge.js');

      const hookInput = {
        sessionId: 'test-session',
        directory: process.cwd(),
      };

      const result = await bridge.processHook('session-start', hookInput);
      const parsed = typeof result === 'string' ? JSON.parse(result) : result;

      // Should contain Bedrock override instruction
      expect(parsed.message).toContain('MODEL ROUTING OVERRIDE');
      expect(parsed.message).toContain('tier alias');
      expect(parsed.message).toMatch(/\b(medium|high|low)\b/);
      expect(parsed.message).not.toContain('Do NOT pass the `model` parameter');
      expect(parsed.message).not.toContain('Omit it entirely');
    });

    it('does NOT inject override when not on Bedrock', async () => {
      const bridge = await import('../hooks/bridge.js');

      const hookInput = {
        sessionId: 'test-session',
        directory: process.cwd(),
      };

      const result = await bridge.processHook('session-start', hookInput);
      const parsed = typeof result === 'string' ? JSON.parse(result) : result;

      const message = parsed.message ?? '';
      expect(message).not.toContain('MODEL ROUTING OVERRIDE');
    });
  });
});
