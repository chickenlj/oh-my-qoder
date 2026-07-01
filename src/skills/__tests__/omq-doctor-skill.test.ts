import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('omq-doctor skill (issue #2254)', () => {
  it('documents CLAUDE.md OMQ version drift check against cached plugin version', () => {
    const skillPath = join(process.cwd(), 'skills', 'omq-doctor', 'SKILL.md');
    const content = readFileSync(skillPath, 'utf8');

    expect(content).toContain('AGENTS.md OMQ version:');
    expect(content).toContain('OMQ version source:');
    expect(content).toContain('Latest cached plugin version:');
    expect(content).toContain('VERSION DRIFT: AGENTS.md and plugin versions differ');
    expect(content).toContain('VERSION CHECK SKIPPED: missing AGENTS marker or plugin cache');
    expect(content).toContain('VERSION MATCH: AGENTS and plugin cache are aligned');
    expect(content).toContain('AGENTS-*.md');
    expect(content).toContain('deterministic companion');
    expect(content).toContain('scanned deterministic AGENTS sources');
    expect(content).not.toContain('!==');
    expect(content).toContain('If `AGENTS.md OMQ version` != `Latest cached plugin version`: WARN - version drift detected');
  });
});


describe('omq-doctor skill Ralph Ruby dependency check (issue #2969)', () => {
  it('documents a narrow Ruby check with actionable Ralph guidance', () => {
    const skillPath = join(process.cwd(), 'skills', 'omq-doctor', 'SKILL.md');
    const content = readFileSync(skillPath, 'utf8');

    expect(content).toContain('Check Ralph Ruby Dependency');
    expect(content).toContain('Ruby for Ralph: MISSING');
    expect(content).toContain('Ralph workflows require Ruby');
    expect(content).toContain('sudo apt update && sudo apt install ruby-full');
    expect(content).toContain('Ralph Ruby Dependency');
  });
});

describe('omq-doctor skill package version diagnostic (issue #2981)', () => {
  it('checks the canonical published npm package for latest version', () => {
    const skillPath = join(process.cwd(), 'skills', 'omq-doctor', 'SKILL.md');
    const content = readFileSync(skillPath, 'utf8');

    expect(content).toContain('npm view oh-my-claude-sisyphus version');
    expect(content).not.toContain('npm view oh-my-qoder version');
  });
});
