/**
 * Regression test: skill markdown files must use a config-dir env fallback
 *
 * Ensures that bash code blocks in skill files never hardcode $HOME/.qoder
 * without a ${QODER_CONFIG_DIR:-...} or legacy ${QODER_CONFIG_DIR:-...}
 * fallback. This prevents skills from ignoring the user's custom config
 * directory.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Extract content from fenced bash code blocks in a markdown file.
 * Returns an array of { startLine, content } for each ```bash ... ``` block.
 */
function extractBashBlocks(filePath: string): { startLine: number; content: string }[] {
  const text = readFileSync(filePath, 'utf-8');
  const lines = text.split('\n');
  const blocks: { startLine: number; content: string }[] = [];

  let inBlock = false;
  let blockStart = 0;
  let blockLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!inBlock && /^```bash\b/.test(line.trim())) {
      inBlock = true;
      blockStart = i + 2; // 1-indexed, next line
      blockLines = [];
    } else if (inBlock && line.trim() === '```') {
      inBlock = false;
      blocks.push({ startLine: blockStart, content: blockLines.join('\n') });
    } else if (inBlock) {
      blockLines.push(line);
    }
  }

  return blocks;
}

/**
 * Find lines in bash blocks that use $HOME/.qoder without the
 * ${QODER_CONFIG_DIR:-$HOME/.qoder} or legacy
 * ${QODER_CONFIG_DIR:-$HOME/.qoder} pattern.
 */
function findHardcodedHomeQoder(filePath: string): { line: number; text: string }[] {
  const blocks = extractBashBlocks(filePath);
  const violations: { line: number; text: string }[] = [];

  for (const block of blocks) {
    const lines = block.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Match $HOME/.qoder that is NOT inside a config-dir fallback.
      if (
        /\$HOME\/\.qoder/.test(line)
        && !/\$\{(?:QODER_CONFIG_DIR|QODER_CONFIG_DIR):-\$HOME\/\.qoder\}/.test(line)
      ) {
        violations.push({
          line: block.startLine + i,
          text: line.trim(),
        });
      }
    }
  }

  return violations;
}

const SKILLS_ROOT = join(__dirname, '..', '..', '..', 'skills');

function findMarkdownFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...findMarkdownFiles(full));
    } else if (entry.endsWith('.md')) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Find lines in full skill content (not just bash blocks) that use ~/.qoder
 * without portable notation like [$QODER_CONFIG_DIR|~/.qoder].
 * Issue #2155 §16 — LLMs read prose and use literal paths in tool calls.
 */
function findHardcodedTildeQoder(filePath: string): { line: number; text: string }[] {
  const text = readFileSync(filePath, 'utf-8');
  const lines = text.split('\n');
  const violations: { line: number; text: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match ~/.qoder (tilde form) used in prose/tool directives
    if (!/~\/\.qoder/.test(line)) continue;
    // Allow: portable notation [$QODER_CONFIG_DIR|~/.qoder] and legacy notation.
    if (/\[\$(?:QODER_CONFIG_DIR|QODER_CONFIG_DIR)\|~\/\.qoder\]/.test(line)) continue;
    // Allow: env-var fallback ${QODER_CONFIG_DIR:-...} and legacy fallback.
    if (/\$\{(?:QODER_CONFIG_DIR|QODER_CONFIG_DIR):-/.test(line)) continue;
    // Allow: lines inside bash code blocks (covered by the other test)
    // Allow: comment lines and frontmatter
    const trimmed = line.trim();
    if (trimmed.startsWith('#') && !trimmed.startsWith('##')) continue; // frontmatter/comments
    if (trimmed.startsWith('<!--') && trimmed.endsWith('-->')) continue;
    // Allow: lines that mention config-dir env vars (explaining the config dir system)
    if (/(QODER_CONFIG_DIR|QODER_CONFIG_DIR)/i.test(line)) continue;
    // Allow: glob patterns like ~/.qoder/** (permission patterns, not path resolution)
    if (/~\/\.qoder\/\*/.test(line)) continue;

    violations.push({ line: i + 1, text: trimmed });
  }

  return violations;
}

const ALL_FILES = findMarkdownFiles(SKILLS_ROOT);

describe('skill markdown bash blocks must respect config-dir env fallbacks', () => {
  it.each(ALL_FILES.map((f) => [f.replace(/.*skills\//, 'skills/'), f]))(
    '%s has no hardcoded $HOME/.qoder in bash blocks',
    (_label, filePath) => {
      const violations = findHardcodedHomeQoder(filePath);
      if (violations.length > 0) {
        const details = violations
          .map((v) => `  line ${v.line}: ${v.text}`)
          .join('\n');
        expect.fail(
          `Found $HOME/.qoder without config-dir env fallback:\n${details}\n` +
          `Replace with: \${QODER_CONFIG_DIR:-$HOME/.qoder}`
        );
      }
    },
  );
});

describe('skill markdown prose must not use raw ~/.qoder (Contract 6, issue #2155 §16)', () => {
  // Known existing violations per skill directory (baseline snapshot).
  // These are real issues documented in #2155 §16 but predate this regression test.
  // This test prevents NEW violations from being introduced.
  // To reduce the baseline: fix the skill prose to use [$QODER_CONFIG_DIR|~/.qoder] notation,
  // then lower the count here.
  const KNOWN_VIOLATION_BASELINE: Record<string, number> = {
    'skills/cancel/SKILL.md': 4,
    'skills/configure-notifications/SKILL.md': 5,
    'skills/hud/SKILL.md': 8,
    'skills/omq-doctor/SKILL.md': 7,
    'skills/omq-setup/SKILL.md': 5,
    'skills/omq-setup/phases/01-install-agents-md.md': 4,
    'skills/omq-setup/phases/02-configure.md': 3,
    'skills/omq-setup/phases/03-integrations.md': 3,
    'skills/skill/SKILL.md': 8,
    'skills/team/SKILL.md': 6,
  };

  it.each(ALL_FILES.map((f) => [f.replace(/.*skills\//, 'skills/'), f]))(
    '%s has no new unguarded ~/.qoder in prose',
    (label, filePath) => {
      const violations = findHardcodedTildeQoder(filePath);
      const baseline = KNOWN_VIOLATION_BASELINE[label] ?? 0;

      if (violations.length > baseline) {
        const details = violations
          .map((v) => `  line ${v.line}: ${v.text}`)
          .join('\n');
        expect.fail(
          `Found ${violations.length} ~/.qoder violations (baseline: ${baseline}, new: ${violations.length - baseline}):\n${details}\n` +
          `Replace with: [$QODER_CONFIG_DIR|~/.qoder] or use \${QODER_CONFIG_DIR:-$HOME/.qoder} in code`
        );
      }
    },
  );

  it('total baseline should not increase (tracks overall progress)', () => {
    let totalViolations = 0;
    for (const filePath of ALL_FILES) {
      totalViolations += findHardcodedTildeQoder(filePath).length;
    }
    const totalBaseline = Object.values(KNOWN_VIOLATION_BASELINE).reduce((a, b) => a + b, 0);

    // This assertion catches violations in files not yet in the baseline
    expect(totalViolations).toBeLessThanOrEqual(totalBaseline);
  });
});
