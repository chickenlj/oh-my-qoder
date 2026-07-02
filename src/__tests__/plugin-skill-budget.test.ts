import { describe, expect, it } from 'vitest';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { dirname, join, win32 } from 'path';
import { fileURLToPath } from 'url';
import { isPathInsideOrEqual } from '../features/builtin-skills/skills.js';
import { compactPluginSkillPayload, copyPluginSyncPayload } from '../installer/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..', '..');
const PLUGIN_JSON = join(REPO_ROOT, '.qoder-plugin', 'plugin.json');
const SKILLS_DIR = join(REPO_ROOT, 'skills');
const COMMANDS_DIR = join(REPO_ROOT, 'commands');
const COMPACT_PLUGIN_SKILL_BUDGET_BYTES = 64 * 1024;
const COMPACT_PLUGIN_SKILL_PER_FILE_BUDGET_BYTES = 2 * 1024;

function readPluginJson(): { skills?: unknown; commands?: unknown } {
  return JSON.parse(readFileSync(PLUGIN_JSON, 'utf-8')) as { skills?: unknown; commands?: unknown };
}

function bundledSkillDirs(): string[] {
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(SKILLS_DIR, entry.name, 'SKILL.md')))
    .map((entry) => entry.name)
    .sort();
}

function pluginSkillDirs(): string[] {
  const { skills } = readPluginJson();
  expect(Array.isArray(skills)).toBe(true);
  return (skills as string[])
    .map((skillPath) => skillPath.replace(/^\.\/skills\//, '').replace(/\/$/, ''))
    .sort();
}

function skillPayloadBytes(root: string): number {
  return readdirSync(join(root, 'skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, 'skills', entry.name, 'SKILL.md')))
    .reduce((total, entry) => total + readFileSync(join(root, 'skills', entry.name, 'SKILL.md')).length, 0);
}

describe('plugin skill context budget gate (issues #2943, #2986)', () => {
  it('registers every bundled skill through plugin.json with concise native skill shims', () => {
    const defaultSkillDirs = pluginSkillDirs();
    const allSkillDirs = bundledSkillDirs();

    expect(allSkillDirs.length).toBeGreaterThan(30);
    expect(defaultSkillDirs).toEqual(allSkillDirs);
  });

  it('compacts installed plugin SKILL.md files while archiving full on-demand skill bodies', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'omq-plugin-skill-budget-'));
    try {
      cpSync(SKILLS_DIR, join(tempRoot, 'skills'), { recursive: true });
      const originalBytes = skillPayloadBytes(tempRoot);

      const result = compactPluginSkillPayload(tempRoot);
      const compactBytes = skillPayloadBytes(tempRoot);
      const allSkillDirs = bundledSkillDirs();

      expect(result.errors).toEqual([]);
      expect(result.compacted).toBe(allSkillDirs.length);
      expect(originalBytes).toBeGreaterThan(400 * 1024);
      expect(compactBytes).toBeLessThan(COMPACT_PLUGIN_SKILL_BUDGET_BYTES);
      expect(result.totalBytes).toBe(compactBytes);

      for (const skillDir of allSkillDirs) {
        const shimPath = join(tempRoot, 'skills', skillDir, 'SKILL.md');
        const archivePath = join(tempRoot, 'skill-bodies', skillDir, 'SKILL.md');
        const shim = readFileSync(shimPath, 'utf-8');
        const archived = readFileSync(archivePath, 'utf-8');
        const source = readFileSync(join(SKILLS_DIR, skillDir, 'SKILL.md'), 'utf-8');

        expect(Buffer.byteLength(shim), `${skillDir} compact shim size`).toBeLessThan(COMPACT_PLUGIN_SKILL_PER_FILE_BUDGET_BYTES);
        expect(shim, `${skillDir} shim should point to archived body`).toContain(`../../skill-bodies/${skillDir}/SKILL.md`);
        expect(shim, `${skillDir} shim should expose runtime body override`).toContain('omq-full-body:');
        expect(shim, `${skillDir} shim should prefer plugin root env vars`).toContain(
          `\${QODER_PLUGIN_ROOT:-\${OMQ_PLUGIN_ROOT}}/skill-bodies/${skillDir}/SKILL.md`,
        );
        expect(shim, `${skillDir} shim should define plugin root by containing directories`).toContain(
          'The plugin root is the directory containing both `skills/` and `skill-bodies/`.',
        );
        expect(shim, `${skillDir} shim should reject file-relative skill-bodies lookup`).toContain(
          `Do not resolve \`skill-bodies/${skillDir}/SKILL.md\` under this shim's \`skills/${skillDir}/\` directory`,
        );
        expect(shim, `${skillDir} shim should not instruct ambiguous SKILL.md-relative resolution`).not.toContain(
          'Resolve that path relative to this SKILL.md file',
        );
        expect(archived, `${skillDir} full skill body should be preserved`).toBe(source);
      }
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('uses platform-safe containment for archived full-body skill paths', () => {
    const winRoot = 'C:\\Users\\me\\.qwen\\plugins\\cache\\omq\\oh-my-qoder\\4.13.7';
    const winArchivedBody = win32.join(winRoot, 'skill-bodies', 'plan', 'SKILL.md');
    const winEscapedBody = win32.join(winRoot, '..', 'other-plugin', 'SKILL.md');

    expect(isPathInsideOrEqual(winRoot, winArchivedBody)).toBe(true);
    expect(isPathInsideOrEqual(winRoot, winEscapedBody)).toBe(false);
  });

  it('keeps bundled skills discoverable and manually callable', () => {
    expect(readPluginJson().commands).toBe('./commands/');

    const registeredSkillDirs = pluginSkillDirs();
    for (const skillDir of bundledSkillDirs()) {
      const skillContent = readFileSync(join(SKILLS_DIR, skillDir, 'SKILL.md'), 'utf-8');
      const frontmatterName = skillContent.match(/^name:\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '') ?? skillDir;
      expect(registeredSkillDirs).toContain(skillDir);

      const commandPath = join(COMMANDS_DIR, `${frontmatterName}.md`);
      if (existsSync(commandPath)) {
        const commandContent = readFileSync(commandPath, 'utf-8');
        const expectedSkillPath = skillDir === 'learner' ? 'skills/skillify/SKILL.md' : `skills/${skillDir}/SKILL.md`;
        expect(commandContent).toContain(expectedSkillPath);
        expect(commandContent).toContain('$ARGUMENTS');
      }
    }
  });

  it('materializes declared plugin command wrappers into cache sync targets', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'omq-plugin-commands-cache-'));
    try {
      const sourceRoot = join(tempRoot, 'source');
      const targetRoot = join(tempRoot, 'cache', 'omq', 'oh-my-qoder', '4.14.1');
      mkdirSync(join(sourceRoot, '.qoder-plugin'), { recursive: true });
      mkdirSync(join(sourceRoot, 'commands'), { recursive: true });
      mkdirSync(join(sourceRoot, 'dist', 'hooks'), { recursive: true });
      mkdirSync(join(sourceRoot, 'bridge'), { recursive: true });
      mkdirSync(join(sourceRoot, 'hooks'), { recursive: true });
      mkdirSync(join(sourceRoot, 'skills', 'plan'), { recursive: true });
      writeFileSync(join(sourceRoot, '.qoder-plugin', 'plugin.json'), JSON.stringify({
        name: 'oh-my-qoder',
        commands: './commands/',
        skills: ['./skills/plan/'],
      }, null, 2));
      writeFileSync(join(sourceRoot, 'commands', 'omq-setup.md'), 'Read skills/omq-setup/SKILL.md and pass $ARGUMENTS.\n');
      writeFileSync(join(sourceRoot, 'dist', 'hooks', 'skill-bridge.cjs'), 'console.log("skill bridge");\n');
      writeFileSync(join(sourceRoot, 'bridge', 'cli.cjs'), 'console.log("bridge");\n');
      writeFileSync(join(sourceRoot, 'hooks', 'hooks.json'), '{}\n');
      writeFileSync(join(sourceRoot, 'skills', 'plan', 'SKILL.md'), 'name: plan\n');
      writeFileSync(join(sourceRoot, 'package.json'), JSON.stringify({ name: 'oh-my-qoder', version: '4.14.1' }));

      const result = copyPluginSyncPayload(sourceRoot, [targetRoot]);

      expect(result.errors).toEqual([]);
      expect(result.synced).toBe(true);

      const manifest = JSON.parse(
        readFileSync(join(targetRoot, '.qoder-plugin', 'plugin.json'), 'utf-8')
      ) as { commands?: string; skills?: string[] };
      expect(manifest.commands).toBe('./commands/');
      expect(manifest.skills).toEqual(['./skills/plan/']);
      expect(existsSync(join(targetRoot, 'commands'))).toBe(true);
      expect(readFileSync(join(targetRoot, 'commands', 'omq-setup.md'), 'utf-8')).toContain('$ARGUMENTS');
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('preserves deprecated slash aliases as command wrappers', () => {
    expect(readFileSync(join(COMMANDS_DIR, 'learner.md'), 'utf-8')).toContain('skills/skillify/SKILL.md');
    expect(readFileSync(join(COMMANDS_DIR, 'psm.md'), 'utf-8')).toContain('skills/project-session-manager/SKILL.md');
  });
});
