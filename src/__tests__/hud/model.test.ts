import { describe, it, expect } from 'vitest';
import { formatModelName, renderModel } from '../../hud/elements/model.js';

describe('model element', () => {
  describe('formatModelName', () => {
    it('returns Max for max model IDs', () => {
      expect(formatModelName('qwen-max-20260528')).toBe('Max');
      expect(formatModelName('qwen_max')).toBe('Max');
    });

    it('returns Plus for plus model IDs', () => {
      expect(formatModelName('qwen-plus0250514')).toBe('Plus');
      expect(formatModelName('qwen-plus-20241022')).toBe('Plus');
    });

    it('returns Turbo for turbo model IDs', () => {
      expect(formatModelName('qwen-turbo-20240307')).toBe('Turbo');
    });

    it('returns null for null/undefined', () => {
      expect(formatModelName(null)).toBeNull();
      expect(formatModelName(undefined)).toBeNull();
    });

    it('returns versioned name from model IDs', () => {
      expect(formatModelName('qwen-max-20260528', 'versioned')).toBe('Max');
      expect(formatModelName('qwen-plus-20260217', 'versioned')).toBe('Plus');
      expect(formatModelName('qwen-turbo-20251001', 'versioned')).toBe('Turbo');
    });

    it('returns versioned name from display names', () => {
      expect(formatModelName('Plus', 'versioned')).toBe('Plus');
      expect(formatModelName('Max', 'versioned')).toBe('Max');
      expect(formatModelName('Turbo', 'versioned')).toBe('Turbo');
    });

    it('returns versioned name from raw model IDs', () => {
      expect(formatModelName('qwen-plus-20241022', 'versioned')).toBe('Plus');
      expect(formatModelName('qwen-max-20260528', 'versioned')).toBe('Max');
      expect(formatModelName('qwen-turbo-20240307', 'versioned')).toBe('Turbo');
    });

    it('falls back to short name when no version found', () => {
      expect(formatModelName('qwen-max', 'versioned')).toBe('Max');
    });

    it('returns full model ID in full format', () => {
      expect(formatModelName('qwen-max-20260528', 'full')).toBe('qwen-max-20260528');
    });

    it('truncates long unrecognized model names', () => {
      const longName = 'some-very-long-model-name-that-exceeds-limit';
      expect(formatModelName(longName)?.length).toBeLessThanOrEqual(20);
    });
  });

  describe('renderModel', () => {
    it('renders formatted model name', () => {
      const result = renderModel('qwen-max-20260528');
      expect(result).not.toBeNull();
      expect(result).toContain('Model: Max');
    });

    it('renders versioned format', () => {
      const result = renderModel('qwen-max-20260528', 'versioned');
      expect(result).not.toBeNull();
      expect(result).toContain('Model: Max');
    });

    it('renders full format', () => {
      const result = renderModel('qwen-max-20260528', 'full');
      expect(result).not.toBeNull();
      expect(result).toContain('Model: qwen-max');
    });

    it('renders configured model label', () => {
      const result = renderModel('qwen-plus', 'versioned', { model: '模型' });
      expect(result).not.toBeNull();
      expect(result).toContain('模型: Plus');
    });

    it('returns null for null input', () => {
      expect(renderModel(null)).toBeNull();
    });
  });
});
