/**
 * Wave B2: self-improve session isolation test.
 *
 * Asserts that two concurrent self-improve runs sharing the same topic slug
 * but different sessionIds resolve to distinct artifact directories and do not
 * share state.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const RESOLVER = join(process.cwd(), 'skills', 'self-improve', 'scripts', 'resolve-paths.mjs');

function readJson(command: string, args: string[], extraEnv: Record<string, string | undefined> = {}) {
  const env = { ...process.env, ...extraEnv };
  return JSON.parse(execFileSync(command, args, { encoding: 'utf-8', env }));
}

describe('self-improve session isolation (Wave B2)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'omq-si-session-isolation-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('two runs with same topic slug but different session IDs resolve to distinct dirs', () => {
    const slug = 'perf-track';
    const sidA = 'session-alpha';
    const sidB = 'session-beta';

    const pathsA = readJson('node', [RESOLVER, '--project-root', root, '--slug', slug, '--session-id', sidA]);
    const pathsB = readJson('node', [RESOLVER, '--project-root', root, '--slug', slug, '--session-id', sidB]);

    expect(pathsA.root).not.toBe(pathsB.root);
    expect(pathsA.root).toContain(sidA);
    expect(pathsB.root).toContain(sidB);
    expect(pathsA.scope_mode).toBe('session-scoped');
    expect(pathsB.scope_mode).toBe('session-scoped');
  });

  it('session-scoped root is nested under topics/<slug>/sessions/<sid>/', () => {
    const slug = 'code-quality';
    const sid = 'abc123';

    const paths = readJson('node', [RESOLVER, '--project-root', root, '--slug', slug, '--session-id', sid]);

    const expectedRoot = join(root, '.omq', 'self-improve', 'topics', slug, 'sessions', sid);
    expect(paths.root).toBe(expectedRoot);
  });

  it('without session-id, two runs with same slug share the same topic root', () => {
    const slug = 'shared-topic';

    const pathsA = readJson('node', [RESOLVER, '--project-root', root, '--slug', slug], { OMC_SESSION_ID: undefined });
    const pathsB = readJson('node', [RESOLVER, '--project-root', root, '--slug', slug], { OMC_SESSION_ID: undefined });

    expect(pathsA.root).toBe(pathsB.root);
    expect(pathsA.scope_mode).toBe('topic-scoped');
  });

  it('writes from session A do not affect session B state dirs', () => {
    const slug = 'isolation-test';
    const sidA = 'run-001';
    const sidB = 'run-002';

    const pathsA = readJson('node', [RESOLVER, '--project-root', root, '--slug', slug, '--session-id', sidA, '--ensure-dirs']);
    const pathsB = readJson('node', [RESOLVER, '--project-root', root, '--slug', slug, '--session-id', sidB, '--ensure-dirs']);

    // Write a file into session A's state dir
    writeFileSync(join(pathsA.state_dir, 'iteration_state.json'), JSON.stringify({ active: true, session: sidA }));

    // Session B's state dir should not contain that file
    const { existsSync } = require('node:fs');
    expect(existsSync(join(pathsB.state_dir, 'iteration_state.json'))).toBe(false);
  });

  it('session_id is returned in the paths object', () => {
    const slug = 'with-session';
    const sid = 'my-session-id';

    const paths = readJson('node', [RESOLVER, '--project-root', root, '--slug', slug, '--session-id', sid]);

    expect(paths.session_id).toBe(sid);
  });

  it('session_id is null when not provided', () => {
    const slug = 'no-session';

    const paths = readJson('node', [RESOLVER, '--project-root', root, '--slug', slug], { OMC_SESSION_ID: undefined });

    expect(paths.session_id).toBeNull();
  });

  it('OMC_SESSION_ID env var is used as fallback when --session-id not passed', () => {
    const slug = 'env-session';
    const sid = 'env-session-123';

    // Call without --session-id but with env var
    const result = JSON.parse(
      execFileSync('node', [RESOLVER, '--project-root', root, '--slug', slug], {
        encoding: 'utf-8',
        env: { ...process.env, OMC_SESSION_ID: sid },
      })
    );

    expect(result.scope_mode).toBe('session-scoped');
    expect(result.root).toContain(sid);
    expect(result.session_id).toBe(sid);
  });
});
