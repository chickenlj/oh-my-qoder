import { describe, it, expect, afterEach } from 'vitest';
import { resolveSessionId } from '../session-id.js';

const ORIGINAL_ENV = process.env.OMQ_SESSION_ID;

afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.OMQ_SESSION_ID;
  else process.env.OMQ_SESSION_ID = ORIGINAL_ENV;
});

describe('resolveSessionId', () => {
  describe('context = cli', () => {
    it('returns env when only env is set', () => {
      process.env.OMQ_SESSION_ID = 'env-sid';
      expect(resolveSessionId({ context: 'cli' })).toBe('env-sid');
    });

    it('returns payload when only payload is set', () => {
      delete process.env.OMQ_SESSION_ID;
      expect(resolveSessionId({ context: 'cli', hookPayload: { session_id: 'payload-sid' } })).toBe('payload-sid');
    });

    it('env WINS over payload in CLI context (intentional asymmetry)', () => {
      process.env.OMQ_SESSION_ID = 'env-sid';
      expect(resolveSessionId({ context: 'cli', hookPayload: { session_id: 'payload-sid' } })).toBe('env-sid');
    });

    it('falls back to process session id when neither source provides a value', () => {
      delete process.env.OMQ_SESSION_ID;
      const result = resolveSessionId({ context: 'cli' });
      expect(result).toMatch(/^pid-\d+-\d+$/);
    });
  });

  describe('context = hook', () => {
    it('returns payload when only payload is set', () => {
      delete process.env.OMQ_SESSION_ID;
      expect(resolveSessionId({ context: 'hook', hookPayload: { session_id: 'payload-sid' } })).toBe('payload-sid');
    });

    it('returns env when only env is set', () => {
      process.env.OMQ_SESSION_ID = 'env-sid';
      expect(resolveSessionId({ context: 'hook' })).toBe('env-sid');
    });

    it('payload WINS over env in hook context (intentional asymmetry)', () => {
      process.env.OMQ_SESSION_ID = 'env-sid';
      expect(resolveSessionId({ context: 'hook', hookPayload: { session_id: 'payload-sid' } })).toBe('payload-sid');
    });

    it('falls back to process session id when neither source provides a value', () => {
      delete process.env.OMQ_SESSION_ID;
      const result = resolveSessionId({ context: 'hook' });
      expect(result).toMatch(/^pid-\d+-\d+$/);
    });
  });

  describe('input normalization', () => {
    it('ignores empty-string env', () => {
      process.env.OMQ_SESSION_ID = '   ';
      expect(resolveSessionId({ context: 'cli', hookPayload: { session_id: 'payload-sid' } })).toBe('payload-sid');
    });

    it('falls back to process session id for empty-string payload', () => {
      delete process.env.OMQ_SESSION_ID;
      const result = resolveSessionId({ context: 'hook', hookPayload: { session_id: '' } });
      expect(result).toMatch(/^pid-\d+-\d+$/);
    });

    it('falls back to process session id for null payload', () => {
      delete process.env.OMQ_SESSION_ID;
      const result = resolveSessionId({ context: 'hook', hookPayload: null });
      expect(result).toMatch(/^pid-\d+-\d+$/);
    });

    it('trims whitespace from values', () => {
      process.env.OMQ_SESSION_ID = '  env-sid  ';
      expect(resolveSessionId({ context: 'cli' })).toBe('env-sid');
    });
  });
});
