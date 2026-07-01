/**
 * Tests for delegation enforcer middleware
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  enforceModel,
  isAgentCall,
  processPreToolUse,
  getModelForAgent,
  type AgentInput
} from '../features/delegation-enforcer.js';
import { resolveDelegation } from '../features/delegation-routing/resolver.js';

describe('delegation-enforcer', () => {
  let originalDebugEnv: string | undefined;
  // Save/restore env vars that trigger non-Claude provider detection (issue #1201)
  // so existing tests run in a standard Claude environment
  const providerEnvKeys = ['DASHSCOPE_BASE_URL', 'QODER_MODEL', 'DASHSCOPE_MODEL', 'OMQ_ROUTING_FORCE_INHERIT', 'OMQ_ROUTING_FORCE_INHERIT', 'OMQ_ROUTING_FORCE_INHERIT', 'DASHSCOPE_DEFAULT_MAX_MODEL', 'DASHSCOPE_DEFAULT_PLUS_MODEL', 'DASHSCOPE_DEFAULT_TURBO_MODEL', 'DASHSCOPE_DEFAULT_MAX_MODEL', 'DASHSCOPE_DEFAULT_PLUS_MODEL', 'DASHSCOPE_DEFAULT_TURBO_MODEL', 'OMQ_MODEL_HIGH', 'OMQ_MODEL_MEDIUM', 'OMQ_MODEL_LOW'];
  const savedProviderEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    originalDebugEnv = process.env.OMQ_DEBUG;
    for (const key of providerEnvKeys) {
      savedProviderEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    if (originalDebugEnv === undefined) {
      delete process.env.OMQ_DEBUG;
    } else {
      process.env.OMQ_DEBUG = originalDebugEnv;
    }
    for (const key of providerEnvKeys) {
      if (savedProviderEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedProviderEnv[key];
      }
    }
  });

  describe('enforceModel', () => {
    it('preserves explicitly specified model (already an alias)', () => {
      const input: AgentInput = {
        description: 'Test task',
        prompt: 'Do something',
        subagent_type: 'oh-my-qoder:executor',
        model: 'low'
      };

      const result = enforceModel(input);

      expect(result.injected).toBe(false);
      expect(result.modifiedInput.model).toBe('low');
    });

    it('normalizes explicit full model ID to CC alias (issue #1415)', () => {
      const input: AgentInput = {
        description: 'Test task',
        prompt: 'Do something',
        subagent_type: 'oh-my-qoder:executor',
        model: 'qwen-plus'
      };

      const result = enforceModel(input);

      expect(result.injected).toBe(false);
      expect(result.modifiedInput.model).toBe('medium');
    });

    it('normalizes qwen-max to the fable tier alias (issue #3246)', () => {
      const input: AgentInput = {
        description: 'Test task',
        prompt: 'Do something',
        subagent_type: 'oh-my-qoder:executor',
        model: 'qwen-max'
      };

      const result = enforceModel(input);

      expect(result.injected).toBe(false);
      expect(result.modifiedInput.model).toBe('high');
    });

    it('preserves explicit provider-specific DashScope model ID', () => {
      const input: AgentInput = {
        description: 'Test task',
        prompt: 'Do something',
        subagent_type: 'oh-my-qoder:executor',
        model: 'dashscope/qwen-plus'
      };

      const result = enforceModel(input);

      expect(result.injected).toBe(false);
      expect(result.modifiedInput.model).toBe('dashscope/qwen-plus');
    });

    it('injects model from agent definition when not specified', () => {
      const input: AgentInput = {
        description: 'Test task',
        prompt: 'Do something',
        subagent_type: 'oh-my-qoder:executor'
      };

      const result = enforceModel(input);

      expect(result.injected).toBe(true);
      expect(result.modifiedInput.model).toBe('medium'); // executor defaults to qwen-plus
      expect(result.originalInput.model).toBeUndefined();
    });

    it('handles agent type without prefix', () => {
      const input: AgentInput = {
        description: 'Test task',
        prompt: 'Do something',
        subagent_type: 'debugger'
      };

      const result = enforceModel(input);

      expect(result.injected).toBe(true);
      expect(result.modifiedInput.model).toBe('medium'); // debugger defaults to qwen-plus
    });

    it('rewrites deprecated aliases to canonical agent names before injecting model', () => {
      const input: AgentInput = {
        description: 'Test task',
        prompt: 'Do something',
        subagent_type: 'oh-my-qoder:build-fixer'
      };

      const result = enforceModel(input);

      expect(result.injected).toBe(true);
      expect(result.modifiedInput.subagent_type).toBe('oh-my-qoder:debugger');
      expect(result.modifiedInput.model).toBe('medium');
    });

    it('throws error for unknown agent type', () => {
      const input: AgentInput = {
        description: 'Test task',
        prompt: 'Do something',
        subagent_type: 'unknown-agent'
      };

      expect(() => enforceModel(input)).toThrow('Unknown agent type');
    });

    it('logs warning only when OMQ_DEBUG=true', () => {
      const input: AgentInput = {
        description: 'Test task',
        prompt: 'Do something',
        subagent_type: 'executor'
      };

      // Without debug flag
      delete process.env.OMQ_DEBUG;
      const resultWithoutDebug = enforceModel(input);
      expect(resultWithoutDebug.warning).toBeUndefined();

      // With debug flag
      process.env.OMQ_DEBUG = 'true';
      const resultWithDebug = enforceModel(input);
      expect(resultWithDebug.warning).toBeDefined();
      expect(resultWithDebug.warning).toContain('Auto-injecting model');
      expect(resultWithDebug.warning).toContain('qwen-plus');
      expect(resultWithDebug.warning).toContain('executor');
    });

    it('does not log warning when OMQ_DEBUG is false', () => {
      const input: AgentInput = {
        description: 'Test task',
        prompt: 'Do something',
        subagent_type: 'executor'
      };

      process.env.OMQ_DEBUG = 'false';
      const result = enforceModel(input);
      expect(result.warning).toBeUndefined();
    });

    it('works with all agents', () => {
      const testCases = [
        { agent: 'architect', expectedModel: 'high' },
        { agent: 'executor', expectedModel: 'medium' },
        { agent: 'explore', expectedModel: 'low' },
        { agent: 'designer', expectedModel: 'medium' },
        { agent: 'debugger', expectedModel: 'medium' },
        { agent: 'verifier', expectedModel: 'medium' },
        { agent: 'code-reviewer', expectedModel: 'high' },
        { agent: 'test-engineer', expectedModel: 'medium' }
      ];

      for (const testCase of testCases) {
        const input: AgentInput = {
          description: 'Test',
          prompt: 'Test',
          subagent_type: testCase.agent
        };

        const result = enforceModel(input);
        expect(result.modifiedInput.model).toBe(testCase.expectedModel);
        expect(result.injected).toBe(true);
      }
    });
  });

  describe('isAgentCall', () => {
    it('returns true for Agent tool with valid input', () => {
      const toolInput = {
        description: 'Test',
        prompt: 'Test',
        subagent_type: 'executor'
      };

      expect(isAgentCall('Agent', toolInput)).toBe(true);
    });

    it('returns true for Task tool with valid input', () => {
      const toolInput = {
        description: 'Test',
        prompt: 'Test',
        subagent_type: 'executor'
      };

      expect(isAgentCall('Task', toolInput)).toBe(true);
    });

    it('returns false for non-agent tools', () => {
      const toolInput = {
        description: 'Test',
        prompt: 'Test',
        subagent_type: 'executor'
      };

      expect(isAgentCall('Bash', toolInput)).toBe(false);
      expect(isAgentCall('Read', toolInput)).toBe(false);
    });

    it('returns false for invalid input structure', () => {
      expect(isAgentCall('Agent', null)).toBe(false);
      expect(isAgentCall('Agent', undefined)).toBe(false);
      expect(isAgentCall('Agent', 'string')).toBe(false);
      expect(isAgentCall('Agent', { description: 'test' })).toBe(false); // missing prompt
      expect(isAgentCall('Agent', { prompt: 'test' })).toBe(false); // missing description
    });
  });

  describe('processPreToolUse', () => {
    it('returns original input for non-agent tools', () => {
      const toolInput = { command: 'ls -la' };
      const result = processPreToolUse('Bash', toolInput);

      expect(result.modifiedInput).toEqual(toolInput);
      expect(result.warning).toBeUndefined();
    });

    it('rewrites deprecated aliases in pre-tool-use enforcement even when model is explicit', () => {
      const toolInput: AgentInput = {
        description: 'Test',
        prompt: 'Test',
        subagent_type: 'quality-reviewer',
        model: 'high'
      };

      const result = processPreToolUse('Task', toolInput);

      expect(result.modifiedInput).toEqual({
        ...toolInput,
        subagent_type: 'code-reviewer',
      });
    });


    it('enforces model for agent calls', () => {
      const toolInput: AgentInput = {
        description: 'Test',
        prompt: 'Test',
        subagent_type: 'executor'
      };

      const result = processPreToolUse('Agent', toolInput);

      expect(result.modifiedInput).toHaveProperty('model', 'medium');
    });

    it('does not modify input when model already specified', () => {
      const toolInput: AgentInput = {
        description: 'Test',
        prompt: 'Test',
        subagent_type: 'executor',
        model: 'low'
      };

      const result = processPreToolUse('Agent', toolInput);

      expect(result.modifiedInput).toEqual(toolInput);
      expect(result.warning).toBeUndefined();
    });

    it('logs warning only when OMQ_DEBUG=true and model injected', () => {
      const toolInput: AgentInput = {
        description: 'Test',
        prompt: 'Test',
        subagent_type: 'executor'
      };

      // Without debug
      delete process.env.OMQ_DEBUG;
      const resultWithoutDebug = processPreToolUse('Agent', toolInput);
      expect(resultWithoutDebug.warning).toBeUndefined();

      // With debug
      process.env.OMQ_DEBUG = 'true';
      const resultWithDebug = processPreToolUse('Agent', toolInput);
      expect(resultWithDebug.warning).toBeDefined();
    });
  });

  describe('getModelForAgent', () => {
    it('returns correct model for agent with prefix', () => {
      expect(getModelForAgent('oh-my-qoder:executor')).toBe('medium');
      expect(getModelForAgent('oh-my-qoder:debugger')).toBe('medium');
      expect(getModelForAgent('oh-my-qoder:architect')).toBe('high');
    });

    it('returns correct model for agent without prefix', () => {
      expect(getModelForAgent('executor')).toBe('medium');
      expect(getModelForAgent('debugger')).toBe('medium');
      expect(getModelForAgent('architect')).toBe('high');
      expect(getModelForAgent('build-fixer')).toBe('medium');
    });

    it('throws error for unknown agent', () => {
      expect(() => getModelForAgent('unknown')).toThrow('Unknown agent type');
    });
  });

  describe('deprecated alias routing', () => {
    it('routes api-reviewer to code-reviewer', () => {
      const result = resolveDelegation({ agentRole: 'api-reviewer' });
      expect(result.provider).toBe('qwen');
      expect(result.tool).toBe('Task');
      expect(result.agentOrModel).toBe('code-reviewer');
    });

    it('routes performance-reviewer to code-reviewer', () => {
      const result = resolveDelegation({ agentRole: 'performance-reviewer' });
      expect(result.provider).toBe('qwen');
      expect(result.tool).toBe('Task');
      expect(result.agentOrModel).toBe('code-reviewer');
    });

    it('routes dependency-expert to document-specialist', () => {
      const result = resolveDelegation({ agentRole: 'dependency-expert' });
      expect(result.provider).toBe('qwen');
      expect(result.tool).toBe('Task');
      expect(result.agentOrModel).toBe('document-specialist');
    });

    it('routes quality-strategist to code-reviewer', () => {
      const result = resolveDelegation({ agentRole: 'quality-strategist' });
      expect(result.provider).toBe('qwen');
      expect(result.tool).toBe('Task');
      expect(result.agentOrModel).toBe('code-reviewer');
    });

    it('routes vision to document-specialist', () => {
      const result = resolveDelegation({ agentRole: 'vision' });
      expect(result.provider).toBe('qwen');
      expect(result.tool).toBe('Task');
      expect(result.agentOrModel).toBe('document-specialist');
    });
  });

  describe('env-resolved agent defaults (issue #1415)', () => {
    it('preserves DashScope provider-specific env IDs without auto-enabling forceInherit from tier env alone', () => {
      process.env.DASHSCOPE_DEFAULT_PLUS_MODEL = 'dashscope/qwen-plus';
      const input: AgentInput = {
        description: 'Test task',
        prompt: 'Do something',
        subagent_type: 'executor'
      };

      const result = enforceModel(input);

      expect(result.injected).toBe(true);
      expect(result.model).toBe('dashscope/qwen-plus');
      expect(result.modifiedInput.model).toBe('dashscope/qwen-plus');
    });

    it('preserves DashScope provider-specific env model IDs when forceInherit is explicitly disabled', () => {
      process.env.OMQ_ROUTING_FORCE_INHERIT = 'false';
      process.env.DASHSCOPE_DEFAULT_PLUS_MODEL = 'dashscope/qwen-plus';
      const input: AgentInput = {
        description: 'Test task',
        prompt: 'Do something',
        subagent_type: 'executor'
      };

      const result = enforceModel(input);

      expect(result.injected).toBe(true);
      expect(result.model).toBe('dashscope/qwen-plus');
      expect(result.modifiedInput.model).toBe('dashscope/qwen-plus');
    });

    it('getModelForAgent preserves provider-specific IDs from DashScope env vars', () => {
      process.env.DASHSCOPE_DEFAULT_MAX_MODEL = 'dashscope/qwen-max';
      expect(getModelForAgent('architect')).toBe('dashscope/qwen-max');
    });
  });

  describe('modelAliases config override (issue #1211)', () => {
    const savedEnv: Record<string, string | undefined> = {};
    const aliasEnvKeys = ['OMQ_MODEL_ALIAS_LOW', 'OMQ_MODEL_ALIAS_MEDIUM', 'OMQ_MODEL_ALIAS_HIGH'];

    beforeEach(() => {
      for (const key of aliasEnvKeys) {
        savedEnv[key] = process.env[key];
        delete process.env[key];
      }
    });

    afterEach(() => {
      for (const key of aliasEnvKeys) {
        if (savedEnv[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = savedEnv[key];
        }
      }
    });

    it('remaps low-tier agents to inherit via env var', () => {
      process.env.OMQ_MODEL_ALIAS_LOW = 'inherit';
      const input: AgentInput = {
        description: 'Test task',
        prompt: 'Do something',
        subagent_type: 'explore' // explore defaults to low
      };
      const result = enforceModel(input);
      expect(result.model).toBe('inherit');
      expect(result.modifiedInput.model).toBeUndefined();
    });

    it('remaps low-tier agents to medium via env var', () => {
      process.env.OMQ_MODEL_ALIAS_LOW = 'medium';
      const input: AgentInput = {
        description: 'Test task',
        prompt: 'Do something',
        subagent_type: 'explore' // explore defaults to low
      };
      const result = enforceModel(input);
      expect(result.model).toBe('medium');
      expect(result.modifiedInput.model).toBe('medium');
    });

    it('does not remap when no alias configured for the tier', () => {
      process.env.OMQ_MODEL_ALIAS_LOW = 'medium';
      // executor defaults to medium — no alias for medium
      const input: AgentInput = {
        description: 'Test task',
        prompt: 'Do something',
        subagent_type: 'executor'
      };
      const result = enforceModel(input);
      expect(result.model).toBe('medium');
      expect(result.modifiedInput.model).toBe('medium');
    });

    it('explicit model param takes priority over alias', () => {
      process.env.OMQ_MODEL_ALIAS_LOW = 'medium';
      const input: AgentInput = {
        description: 'Test task',
        prompt: 'Do something',
        subagent_type: 'explore',
        model: 'high' // explicit param wins
      };
      const result = enforceModel(input);
      expect(result.model).toBe('high');
      expect(result.modifiedInput.model).toBe('high');
    });

    it('forceInherit takes priority over alias', () => {
      process.env.OMQ_ROUTING_FORCE_INHERIT = 'true';
      process.env.OMQ_MODEL_ALIAS_LOW = 'medium';
      const input: AgentInput = {
        description: 'Test task',
        prompt: 'Do something',
        subagent_type: 'explore'
      };
      const result = enforceModel(input);
      expect(result.model).toBe('inherit');
      expect(result.modifiedInput.model).toBeUndefined();
    });

    it('remaps high-tier agents to inherit via env var', () => {
      process.env.OMQ_MODEL_ALIAS_HIGH = 'inherit';
      const input: AgentInput = {
        description: 'Test task',
        prompt: 'Do something',
        subagent_type: 'architect' // architect defaults to high
      };
      const result = enforceModel(input);
      expect(result.model).toBe('inherit');
      expect(result.modifiedInput.model).toBeUndefined();
    });

    it('includes alias note in debug warning', () => {
      process.env.OMQ_MODEL_ALIAS_LOW = 'medium';
      process.env.OMQ_DEBUG = 'true';
      const input: AgentInput = {
        description: 'Test task',
        prompt: 'Do something',
        subagent_type: 'explore'
      };
      const result = enforceModel(input);
      expect(result.warning).toContain('aliased from low');
    });
  });

  describe('non-Claude provider support (issue #1201)', () => {
    const savedEnv: Record<string, string | undefined> = {};
    const envKeys = ['QODER_MODEL', 'DASHSCOPE_BASE_URL', 'OMQ_ROUTING_FORCE_INHERIT'];

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

    it('strips model when non-Qwen DASHSCOPE_MODEL auto-enables forceInherit', () => {
      process.env.DASHSCOPE_MODEL = 'deepseek-v3';
      const input: AgentInput = {
        description: 'Test task',
        prompt: 'Do something',
        subagent_type: 'oh-my-qoder:executor',
        model: 'medium'
      };
      const result = enforceModel(input);
      expect(result.model).toBe('inherit');
      expect(result.modifiedInput.model).toBeUndefined();
    });

    it('strips model when non-Claude provider auto-enables forceInherit', () => {
      process.env.QODER_MODEL = 'glm-5';
      // forceInherit is auto-enabled by loadConfig for non-Claude providers
      const input: AgentInput = {
        description: 'Test task',
        prompt: 'Do something',
        subagent_type: 'oh-my-qoder:executor',
        model: 'medium'
      };
      const result = enforceModel(input);
      expect(result.model).toBe('inherit');
      expect(result.modifiedInput.model).toBeUndefined();
    });

    it('strips model when custom DASHSCOPE_BASE_URL auto-enables forceInherit', () => {
      process.env.DASHSCOPE_BASE_URL = 'https://my-proxy.example.com/v1';
      const input: AgentInput = {
        description: 'Test task',
        prompt: 'Do something',
        subagent_type: 'oh-my-qoder:architect',
        model: 'high'
      };
      const result = enforceModel(input);
      expect(result.model).toBe('inherit');
      expect(result.modifiedInput.model).toBeUndefined();
    });

    it('does not strip model for standard Claude setup', () => {
      const input: AgentInput = {
        description: 'Test task',
        prompt: 'Do something',
        subagent_type: 'oh-my-qoder:executor',
        model: 'low'
      };
      const result = enforceModel(input);
      expect(result.model).toBe('low');
      expect(result.modifiedInput.model).toBe('low');
    });
  });
});
