import { describe, it, expect } from 'vitest';
import type { ModelType, AgentConfig, PluginConfig } from '../shared/types.js';

describe('Type Tests', () => {
  describe('ModelType', () => {
    it('should accept valid model types', () => {
      const validTypes: ModelType[] = ['medium', 'high', 'low', 'inherit'];
      expect(validTypes).toHaveLength(4);
    });
  });

  describe('AgentConfig', () => {
    it('should create valid agent config', () => {
      const config: AgentConfig = {
        name: 'test-agent',
        description: 'A test agent',
        prompt: 'Test prompt',
        tools: ['tool1', 'tool2'],
        model: 'medium',
      };

      expect(config.name).toBe('test-agent');
      expect(config.tools).toHaveLength(2);
      expect(config.model).toBe('medium');
    });

    it('should allow optional model field', () => {
      const config: AgentConfig = {
        name: 'test-agent',
        description: 'A test agent',
        prompt: 'Test prompt',
        tools: [],
      };

      expect(config.model).toBeUndefined();
    });
  });

  describe('PluginConfig', () => {
    it('should create valid plugin config with features', () => {
      const config: PluginConfig = {
        features: {
          parallelExecution: true,
          lspTools: true,
          astTools: false,
          continuationEnforcement: true,
          autoContextInjection: false,
        },
      };

      expect(config.features?.parallelExecution).toBe(true);
      expect(config.features?.astTools).toBe(false);
    });

    it('should support agent configuration', () => {
      const config: PluginConfig = {
        agents: {
          omq: { model: 'qwen-plus' },
          architect: { model: 'qwen-max' },
          explore: { model: 'qwen-turbo' },
          documentSpecialist: { model: 'qwen-turbo' },
        },
      };

      expect(config.agents?.omq?.model).toBe('qwen-plus');
      expect(config.agents?.architect?.model).toBe('qwen-max');
    });

    it('should support routing configuration', () => {
      const config: PluginConfig = {
        routing: {
          enabled: true,
          defaultTier: 'MEDIUM',
          escalationEnabled: true,
          maxEscalations: 2,
          tierModels: {
            LOW: 'claude-haiku-4',
            MEDIUM: 'qwen-plus',
            HIGH: 'qwen-max',
          },
        },
      };

      expect(config.routing?.enabled).toBe(true);
      expect(config.routing?.defaultTier).toBe('MEDIUM');
      expect(config.routing?.tierModels?.HIGH).toBe('qwen-max');
    });
  });
});
