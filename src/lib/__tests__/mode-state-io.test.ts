import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { tmpdir } from 'os';

import { writeModeState, readModeState, clearModeStateFile } from '../mode-state-io.js';

let tempDir: string;

describe('mode-state-io', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'mode-state-io-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // writeModeState
  // -----------------------------------------------------------------------
  describe('writeModeState', () => {
    it('should write state with _meta containing written_at and mode', () => {
      const sid = 'pid-test-1001';
      const result = writeModeState('ralph', { active: true, iteration: 3 }, tempDir, sid);

      expect(result).toBe(true);

      const filePath = join(tempDir, '.omq', 'state', 'sessions', sid, 'ralph-state.json');
      expect(existsSync(filePath)).toBe(true);

      const written = JSON.parse(readFileSync(filePath, 'utf-8'));
      expect(written.active).toBe(true);
      expect(written.iteration).toBe(3);
      expect(written._meta).toBeDefined();
      expect(written._meta.mode).toBe('ralph');
      expect(written._meta.written_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should write session-scoped state when sessionId is provided', () => {
      const result = writeModeState('ultrawork', { active: true }, tempDir, 'pid-123-1000');

      expect(result).toBe(true);

      const filePath = join(tempDir, '.omq', 'state', 'sessions', 'pid-123-1000', 'ultrawork-state.json');
      expect(existsSync(filePath)).toBe(true);

      const written = JSON.parse(readFileSync(filePath, 'utf-8'));
      expect(written._meta.mode).toBe('ultrawork');
      expect(written.active).toBe(true);
    });

    it('should create parent directories as needed', () => {
      const result = writeModeState('autopilot', { phase: 'exec' }, tempDir, 'pid-test-1002');

      expect(result).toBe(true);
      expect(existsSync(join(tempDir, '.omq', 'state', 'sessions', 'pid-test-1002'))).toBe(true);
    });

    it('should write to session-scoped path even without explicit sessionId (auto-resolved)', () => {
      const result = writeModeState('ralph', { active: true }, tempDir);

      expect(result).toBe(true);
      const stateDir = join(tempDir, '.omq', 'state', 'sessions');
      expect(existsSync(stateDir)).toBe(true);
    });

    it('should resolve writes to the git worktree root when called from a subdirectory', () => {
      const nestedDir = join(tempDir, 'nested', 'cwd');
      mkdirSync(nestedDir, { recursive: true });
      execSync('git init', { cwd: tempDir, stdio: 'pipe' });

      const sid = 'pid-test-1003';
      const result = writeModeState('autopilot', { phase: 'exec' }, nestedDir, sid);

      expect(result).toBe(true);
      expect(existsSync(join(tempDir, '.omq', 'state', 'sessions', sid, 'autopilot-state.json'))).toBe(true);
      expect(existsSync(join(nestedDir, '.omq'))).toBe(false);
    });

    it('should write file with 0o600 permissions', () => {
      const sid = 'pid-test-1004';
      writeModeState('ralph', { active: true }, tempDir, sid);
      const filePath = join(tempDir, '.omq', 'state', 'sessions', sid, 'ralph-state.json');
      const { mode } = require('fs').statSync(filePath);
      expect(mode & 0o777).toBe(0o600);
    });

    it('should not leave shared .tmp file after successful write (uses atomic write with unique temp)', () => {
      const sid = 'pid-test-1005';
      writeModeState('ralph', { active: true }, tempDir, sid);

      const filePath = join(tempDir, '.omq', 'state', 'sessions', sid, 'ralph-state.json');
      expect(existsSync(filePath)).toBe(true);
      expect(existsSync(filePath + '.tmp')).toBe(false);
    });

    it('should include sessionId in _meta when sessionId is provided', () => {
      writeModeState('ralph', { active: true }, tempDir, 'pid-session-42');

      const filePath = join(tempDir, '.omq', 'state', 'sessions', 'pid-session-42', 'ralph-state.json');
      expect(existsSync(filePath)).toBe(true);

      const written = JSON.parse(readFileSync(filePath, 'utf-8'));
      expect(written._meta.sessionId).toBe('pid-session-42');
    });

    it('should use atomic write preventing race conditions from shared .tmp path', () => {
      const sid = 'pid-test-1006';
      const result1 = writeModeState('ralph', { active: true, iteration: 1 }, tempDir, sid);
      const result2 = writeModeState('ralph', { active: true, iteration: 2 }, tempDir, sid);

      expect(result1).toBe(true);
      expect(result2).toBe(true);

      const state = readModeState<Record<string, unknown>>('ralph', tempDir, sid);
      expect(state).not.toBeNull();
      expect(state!.iteration).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // readModeState
  // -----------------------------------------------------------------------
  describe('readModeState', () => {
    it('should read state from session-scoped path', () => {
      const sid = 'pid-test-2001';
      const sessionDir = join(tempDir, '.omq', 'state', 'sessions', sid);
      mkdirSync(sessionDir, { recursive: true });
      writeFileSync(
        join(sessionDir, 'ralph-state.json'),
        JSON.stringify({ active: true, _meta: { mode: 'ralph', written_at: '2026-01-01T00:00:00Z' } }),
      );

      const result = readModeState('ralph', tempDir, sid);
      expect(result).not.toBeNull();
      expect(result!.active).toBe(true);
    });

    it('should strip _meta from the returned state', () => {
      const sid = 'pid-test-2002';
      const sessionDir = join(tempDir, '.omq', 'state', 'sessions', sid);
      mkdirSync(sessionDir, { recursive: true });
      writeFileSync(
        join(sessionDir, 'ralph-state.json'),
        JSON.stringify({ active: true, iteration: 5, _meta: { mode: 'ralph', written_at: '2026-01-01T00:00:00Z' } }),
      );

      const result = readModeState('ralph', tempDir, sid) as Record<string, unknown>;
      expect(result).not.toBeNull();
      expect(result.active).toBe(true);
      expect(result.iteration).toBe(5);
      expect(result._meta).toBeUndefined();
    });

    it('should handle files without _meta (pre-migration)', () => {
      const sid = 'pid-test-2003';
      const sessionDir = join(tempDir, '.omq', 'state', 'sessions', sid);
      mkdirSync(sessionDir, { recursive: true });
      writeFileSync(
        join(sessionDir, 'ultrawork-state.json'),
        JSON.stringify({ active: true, phase: 'running' }),
      );

      const result = readModeState('ultrawork', tempDir, sid) as Record<string, unknown>;
      expect(result).not.toBeNull();
      expect(result.active).toBe(true);
      expect(result.phase).toBe('running');
    });

    it('should read state from the git worktree root when given a subdirectory', () => {
      const nestedDir = join(tempDir, 'nested', 'cwd');
      mkdirSync(nestedDir, { recursive: true });
      execSync('git init', { cwd: tempDir, stdio: 'pipe' });
      const sid = 'pid-test-2004';
      const sessionDir = join(tempDir, '.omq', 'state', 'sessions', sid);
      mkdirSync(sessionDir, { recursive: true });
      writeFileSync(
        join(sessionDir, 'ralph-state.json'),
        JSON.stringify({ active: true, _meta: { mode: 'ralph', written_at: '2026-01-01T00:00:00Z' } }),
      );

      const result = readModeState('ralph', nestedDir, sid);

      expect(result).not.toBeNull();
      expect(result!.active).toBe(true);
    });

    it('should read from session path when sessionId is provided', () => {
      const sessionDir = join(tempDir, '.omq', 'state', 'sessions', 'pid-999-2000');
      mkdirSync(sessionDir, { recursive: true });
      writeFileSync(
        join(sessionDir, 'autopilot-state.json'),
        JSON.stringify({ active: true, phase: 'exec' }),
      );

      const result = readModeState('autopilot', tempDir, 'pid-999-2000') as Record<string, unknown>;
      expect(result).not.toBeNull();
      expect(result.active).toBe(true);
      expect(result.phase).toBe('exec');
    });

    it('should NOT read another sessions state', () => {
      const sessionDir = join(tempDir, '.omq', 'state', 'sessions', 'pid-other-111');
      mkdirSync(sessionDir, { recursive: true });
      writeFileSync(
        join(sessionDir, 'ralph-state.json'),
        JSON.stringify({ active: true }),
      );

      const result = readModeState('ralph', tempDir, 'pid-555-3000');
      expect(result).toBeNull();
    });

    it('should return null when file does not exist', () => {
      const result = readModeState('ralph', tempDir, 'pid-nonexistent-1');
      expect(result).toBeNull();
    });

    it('should return null on invalid JSON', () => {
      const sid = 'pid-test-2005';
      const sessionDir = join(tempDir, '.omq', 'state', 'sessions', sid);
      mkdirSync(sessionDir, { recursive: true });
      writeFileSync(join(sessionDir, 'ralph-state.json'), 'not-json{{{');

      const result = readModeState('ralph', tempDir, sid);
      expect(result).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // clearModeStateFile
  // -----------------------------------------------------------------------
  describe('clearModeStateFile', () => {
    it('should clear state from the git worktree root when given a subdirectory', () => {
      const nestedDir = join(tempDir, 'nested', 'cwd');
      mkdirSync(nestedDir, { recursive: true });
      execSync('git init', { cwd: tempDir, stdio: 'pipe' });
      const sid = 'pid-test-3001';
      const sessionDir = join(tempDir, '.omq', 'state', 'sessions', sid);
      mkdirSync(sessionDir, { recursive: true });
      const filePath = join(sessionDir, 'ralph-state.json');
      writeFileSync(filePath, JSON.stringify({ active: true }));

      const result = clearModeStateFile('ralph', nestedDir, sid);

      expect(result).toBe(true);
      expect(existsSync(filePath)).toBe(false);
    });

    it('should delete session-scoped state file', () => {
      const sessionDir = join(tempDir, '.omq', 'state', 'sessions', 'pid-100-500');
      mkdirSync(sessionDir, { recursive: true });
      const filePath = join(sessionDir, 'ultrawork-state.json');
      writeFileSync(filePath, JSON.stringify({ active: true }));

      const result = clearModeStateFile('ultrawork', tempDir, 'pid-100-500');
      expect(result).toBe(true);
      expect(existsSync(filePath)).toBe(false);
    });

    it('should remove mode runtime artifacts during session-scoped clear', () => {
      const stateDir = join(tempDir, '.omq', 'state');
      const sessionDir = join(stateDir, 'sessions', 'session-runtime-cleanup');
      mkdirSync(sessionDir, { recursive: true });
      writeFileSync(join(sessionDir, 'ralph-state.json'), JSON.stringify({ active: true }));
      writeFileSync(join(sessionDir, 'ralph-stop-breaker.json'), JSON.stringify({ count: 2 }));
      writeFileSync(join(stateDir, 'ralph-stop-breaker.json'), JSON.stringify({ count: 2 }));
      writeFileSync(join(stateDir, 'ralph-last-steer-at'), new Date().toISOString());
      writeFileSync(join(stateDir, 'ralph-continue-steer.lock'), `${process.pid}`);

      const result = clearModeStateFile('ralph', tempDir, 'session-runtime-cleanup');

      expect(result).toBe(true);
      expect(existsSync(join(sessionDir, 'ralph-state.json'))).toBe(false);
      expect(existsSync(join(sessionDir, 'ralph-stop-breaker.json'))).toBe(false);
      expect(existsSync(join(stateDir, 'ralph-stop-breaker.json'))).toBe(false);
      expect(existsSync(join(stateDir, 'ralph-last-steer-at'))).toBe(false);
      expect(existsSync(join(stateDir, 'ralph-continue-steer.lock'))).toBe(false);
    });

    it('should return true when file does not exist (already absent)', () => {
      const result = clearModeStateFile('ralph', tempDir, 'pid-nonexistent-1');
      expect(result).toBe(true);
    });
  });
});
