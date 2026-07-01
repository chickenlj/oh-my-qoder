import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..');
const SETUP_SCRIPT = join(REPO_ROOT, 'scripts', 'setup-claude-md.sh');
const CONFIG_DIR_HELPER = join(REPO_ROOT, 'scripts', 'lib', 'config-dir.sh');

const tempRoots: string[] = [];

function createPluginFixture(claudeMdContent: string) {
  const root = mkdtempSync(join(tmpdir(), 'omq-setup-claude-md-'));
  tempRoots.push(root);

  const pluginRoot = join(root, 'plugin');
  const projectRoot = join(root, 'project');
  const homeRoot = join(root, 'home');

  mkdirSync(join(pluginRoot, 'scripts', 'lib'), { recursive: true });
  mkdirSync(join(pluginRoot, 'docs'), { recursive: true });
  mkdirSync(join(pluginRoot, 'skills', 'omq-reference'), { recursive: true });
  mkdirSync(projectRoot, { recursive: true });
  mkdirSync(homeRoot, { recursive: true });

  copyFileSync(SETUP_SCRIPT, join(pluginRoot, 'scripts', 'setup-claude-md.sh'));
  copyFileSync(CONFIG_DIR_HELPER, join(pluginRoot, 'scripts', 'lib', 'config-dir.sh'));
  writeFileSync(join(pluginRoot, 'docs', 'CLAUDE.md'), claudeMdContent);
  writeFileSync(join(pluginRoot, 'skills', 'omq-reference', 'SKILL.md'), `---
name: omq-reference
description: Test fixture reference skill
user-invocable: false
---

# Test OMQ Reference
`);

  return {
    pluginRoot,
    projectRoot,
    homeRoot,
    scriptPath: join(pluginRoot, 'scripts', 'setup-claude-md.sh'),
  };
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe('setup-claude-md.sh (issue #1572)', () => {
  it('installs the canonical docs/CLAUDE.md content with OMQ markers', () => {
    const fixture = createPluginFixture(`<!-- OMQ:START -->
<!-- OMQ:VERSION:9.9.9 -->

# Canonical CLAUDE
Use the real docs file.
<!-- OMQ:END -->
`);

    const result = spawnSync('bash', [fixture.scriptPath, 'local'], {
      cwd: fixture.projectRoot,
      env: {
        ...process.env,
        HOME: fixture.homeRoot,
      },
      encoding: 'utf-8',
    });

    expect(result.status).toBe(0);

    const installedPath = join(fixture.projectRoot, '.qoder', 'AGENTS.md');
    expect(existsSync(installedPath)).toBe(true);

    const installed = readFileSync(installedPath, 'utf-8');
    expect(installed).toContain('<!-- OMQ:START -->');
    expect(installed).toContain('<!-- OMQ:END -->');
    expect(installed).toContain('<!-- OMQ:VERSION:9.9.9 -->');
    expect(installed).toContain('# Canonical CLAUDE');

    const installedSkillPath = join(fixture.projectRoot, '.qoder', 'skills', 'omq-reference', 'SKILL.md');
    expect(existsSync(installedSkillPath)).toBe(true);
    expect(readFileSync(installedSkillPath, 'utf-8')).toContain('# Test OMQ Reference');
  });

  it('refuses to install a canonical source that lacks OMQ markers', () => {
    const fixture = createPluginFixture(`# oh-my-qoder (OMQ) v9.9.9 Summary

This is a summarized CLAUDE.md without markers.
`);

    const result = spawnSync('bash', [fixture.scriptPath, 'local'], {
      cwd: fixture.projectRoot,
      env: {
        ...process.env,
        HOME: fixture.homeRoot,
      },
      encoding: 'utf-8',
    });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain('missing required OMQ markers');
    expect(existsSync(join(fixture.projectRoot, '.qoder', 'AGENTS.md'))).toBe(false);
  });

  it('adds a local git exclude block for .omq artifacts while preserving .omq/skills', () => {
    const fixture = createPluginFixture(`<!-- OMQ:START -->
<!-- OMQ:VERSION:9.9.9 -->

# Canonical CLAUDE
Use the real docs file.
<!-- OMQ:END -->
`);

    const gitInit = spawnSync('git', ['init'], {
      cwd: fixture.projectRoot,
      env: {
        ...process.env,
        HOME: fixture.homeRoot,
      },
      encoding: 'utf-8',
    });
    expect(gitInit.status).toBe(0);

    const result = spawnSync('bash', [fixture.scriptPath, 'local'], {
      cwd: fixture.projectRoot,
      env: {
        ...process.env,
        HOME: fixture.homeRoot,
      },
      encoding: 'utf-8',
    });

    expect(result.status).toBe(0);

    const excludePath = join(fixture.projectRoot, '.git', 'info', 'exclude');
    expect(existsSync(excludePath)).toBe(true);

    const excludeContents = readFileSync(excludePath, 'utf-8');
    expect(excludeContents).toContain('# BEGIN OMQ local artifacts');
    expect(excludeContents).toContain('!.omq/');
    expect(excludeContents).toContain('.omq/*');
    expect(excludeContents).toContain('!.omq/skills/');
    expect(excludeContents).toContain('!.omq/skills/**');
    expect(excludeContents).toContain('.omx/');
    expect(excludeContents).toContain('# END OMQ local artifacts');
  });

  it('keeps the local git exclude block aligned with the tracked root .gitignore skill exceptions', () => {
    const fixture = createPluginFixture(`<!-- OMQ:START -->
<!-- OMQ:VERSION:9.9.9 -->

# Canonical CLAUDE
Use the real docs file.
<!-- OMQ:END -->
`);

    const repoGitignore = readFileSync(join(process.cwd(), '.gitignore'), 'utf-8');
    expect(repoGitignore).toContain('!.omq/');
    expect(repoGitignore).toContain('.omq/*');
    expect(repoGitignore).toContain('!.omq/skills/');
    expect(repoGitignore).toContain('!.omq/skills/**');
    expect(repoGitignore).toContain('.qoder/');

    const gitInit = spawnSync('git', ['init'], {
      cwd: fixture.projectRoot,
      env: {
        ...process.env,
        HOME: fixture.homeRoot,
      },
      encoding: 'utf-8',
    });
    expect(gitInit.status).toBe(0);

    const result = spawnSync('bash', [fixture.scriptPath, 'local'], {
      cwd: fixture.projectRoot,
      env: {
        ...process.env,
        HOME: fixture.homeRoot,
      },
      encoding: 'utf-8',
    });
    expect(result.status).toBe(0);

    const excludePath = join(fixture.projectRoot, '.git', 'info', 'exclude');
    const excludeContents = readFileSync(excludePath, 'utf-8');
    expect(excludeContents).toContain('!.omq/');
    expect(excludeContents).toContain('.omq/*');
    expect(excludeContents).toContain('!.omq/skills/');
    expect(excludeContents).toContain('!.omq/skills/**');
    expect(excludeContents).toContain('.omx/');
  });

  it('local git exclude block keeps .omq/skills trackable while ignoring sibling .omq artifacts and .omx runtime cache', () => {
    const fixture = createPluginFixture(`<!-- OMQ:START -->
<!-- OMQ:VERSION:9.9.9 -->

# Canonical CLAUDE
Use the real docs file.
<!-- OMQ:END -->
`);

    const gitInit = spawnSync('git', ['init'], {
      cwd: fixture.projectRoot,
      env: {
        ...process.env,
        HOME: fixture.homeRoot,
      },
      encoding: 'utf-8',
    });
    expect(gitInit.status).toBe(0);

    const seedExclude = join(fixture.projectRoot, '.git', 'info', 'exclude');
    writeFileSync(seedExclude, '.omq/\n');

    const result = spawnSync('bash', [fixture.scriptPath, 'local'], {
      cwd: fixture.projectRoot,
      env: {
        ...process.env,
        HOME: fixture.homeRoot,
      },
      encoding: 'utf-8',
    });
    expect(result.status).toBe(0);

    const skillDir = join(fixture.projectRoot, '.omq', 'skills');
    const stateDir = join(fixture.projectRoot, '.omq', 'state');
    const omxStateDir = join(fixture.projectRoot, '.omx', 'state');
    mkdirSync(skillDir, { recursive: true });
    mkdirSync(stateDir, { recursive: true });
    mkdirSync(omxStateDir, { recursive: true });
    writeFileSync(join(skillDir, 'example.md'), 'skill');
    writeFileSync(join(stateDir, 'example.json'), '{}');
    writeFileSync(join(omxStateDir, 'runtime.json'), '{}');

    const skillIgnore = spawnSync('git', ['check-ignore', '-v', '.omq/skills/example.md'], {
      cwd: fixture.projectRoot,
      env: {
        ...process.env,
        HOME: fixture.homeRoot,
      },
      encoding: 'utf-8',
    });
    expect(skillIgnore.status).toBe(0);
    expect(skillIgnore.stdout).toContain('!.omq/skills/**');

    const stateIgnore = spawnSync('git', ['check-ignore', '-v', '.omq/state/example.json'], {
      cwd: fixture.projectRoot,
      env: {
        ...process.env,
        HOME: fixture.homeRoot,
      },
      encoding: 'utf-8',
    });
    expect(stateIgnore.status).toBe(0);
    expect(stateIgnore.stdout).toContain('.omq/*');

    const omxStateIgnore = spawnSync('git', ['check-ignore', '-v', '.omx/state/runtime.json'], {
      cwd: fixture.projectRoot,
      env: {
        ...process.env,
        HOME: fixture.homeRoot,
      },
      encoding: 'utf-8',
    });
    expect(omxStateIgnore.status).toBe(0);
    expect(omxStateIgnore.stdout).toContain('.omx/');

    const status = spawnSync('git', ['status', '--porcelain=v1', '-uall'], {
      cwd: fixture.projectRoot,
      env: {
        ...process.env,
        HOME: fixture.homeRoot,
      },
      encoding: 'utf-8',
    });
    expect(status.status).toBe(0);
    expect(status.stdout).not.toContain('.omx/');
    expect(status.stdout).not.toContain('.omq/state/');
    expect(status.stdout).toContain('.omq/skills/example.md');
  });

  it('updates an existing local git exclude block to ignore .omx runtime cache', () => {
    const fixture = createPluginFixture(`<!-- OMQ:START -->
<!-- OMQ:VERSION:9.9.9 -->

# Canonical CLAUDE
Use the real docs file.
<!-- OMQ:END -->
`);

    const gitInit = spawnSync('git', ['init'], {
      cwd: fixture.projectRoot,
      env: {
        ...process.env,
        HOME: fixture.homeRoot,
      },
      encoding: 'utf-8',
    });
    expect(gitInit.status).toBe(0);

    const excludePath = join(fixture.projectRoot, '.git', 'info', 'exclude');
    writeFileSync(excludePath, `# BEGIN OMQ local artifacts
!.omq/
.omq/*
!.omq/skills/
!.omq/skills/**
# END OMQ local artifacts
`);

    const result = spawnSync('bash', [fixture.scriptPath, 'local'], {
      cwd: fixture.projectRoot,
      env: {
        ...process.env,
        HOME: fixture.homeRoot,
      },
      encoding: 'utf-8',
    });
    expect(result.status).toBe(0);

    const excludeContents = readFileSync(excludePath, 'utf-8');
    expect(excludeContents.match(/# BEGIN OMQ local artifacts/g)).toHaveLength(1);
    expect(excludeContents.match(/^\.omx\/$/gm)).toHaveLength(1);
    expect(`${result.stdout}
${result.stderr}`).toContain('Updated OMQ git exclude for local OMX artifacts');
  });

  it('does not duplicate the local git exclude block on repeated local setup runs', () => {
    const fixture = createPluginFixture(`<!-- OMQ:START -->
<!-- OMQ:VERSION:9.9.9 -->

# Canonical CLAUDE
Use the real docs file.
<!-- OMQ:END -->
`);

    const gitInit = spawnSync('git', ['init'], {
      cwd: fixture.projectRoot,
      env: {
        ...process.env,
        HOME: fixture.homeRoot,
      },
      encoding: 'utf-8',
    });
    expect(gitInit.status).toBe(0);

    const firstRun = spawnSync('bash', [fixture.scriptPath, 'local'], {
      cwd: fixture.projectRoot,
      env: {
        ...process.env,
        HOME: fixture.homeRoot,
      },
      encoding: 'utf-8',
    });
    expect(firstRun.status).toBe(0);

    const secondRun = spawnSync('bash', [fixture.scriptPath, 'local'], {
      cwd: fixture.projectRoot,
      env: {
        ...process.env,
        HOME: fixture.homeRoot,
      },
      encoding: 'utf-8',
    });
    expect(secondRun.status).toBe(0);

    const excludeContents = readFileSync(join(fixture.projectRoot, '.git', 'info', 'exclude'), 'utf-8');
    expect(excludeContents.match(/# BEGIN OMQ local artifacts/g)).toHaveLength(1);
  });

  it('uses QODER_CONFIG_DIR for global setup targets and plugin verification', () => {
    const fixture = createPluginFixture(`<!-- OMQ:START -->
<!-- OMQ:VERSION:9.9.9 -->

# Canonical CLAUDE
Use the real docs file.
<!-- OMQ:END -->
`);

    const configDir = join(fixture.homeRoot, 'custom-profile');
    mkdirSync(join(configDir, 'hooks'), { recursive: true });
    writeFileSync(join(configDir, 'hooks', 'keyword-detector.sh'), 'legacy');
    writeFileSync(join(configDir, 'settings.json'), JSON.stringify({ plugins: ['oh-my-qoder'] }));

    const result = spawnSync('bash', [fixture.scriptPath, 'global'], {
      cwd: fixture.projectRoot,
      env: {
        ...process.env,
        HOME: fixture.homeRoot,
        QODER_CONFIG_DIR: configDir,
      },
      encoding: 'utf-8',
    });

    expect(result.status).toBe(0);
    expect(existsSync(join(configDir, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(configDir, 'skills', 'omq-reference', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(configDir, 'hooks', 'keyword-detector.sh'))).toBe(false);
    expect(`${result.stdout}\n${result.stderr}`).toContain('Plugin verified');
  });

  it('overwrites an existing global CLAUDE.md by default when preserve mode is not requested', () => {
    const fixture = createPluginFixture(`<!-- OMQ:START -->
<!-- OMQ:VERSION:9.9.9 -->

# Canonical CLAUDE
Use the real docs file.
<!-- OMQ:END -->
`);

    const configDir = join(fixture.homeRoot, 'custom-profile');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'AGENTS.md'), '# User CLAUDE\nKeep my base config.\n');
    writeFileSync(join(configDir, 'settings.json'), JSON.stringify({ plugins: ['oh-my-qoder'] }));

    const result = spawnSync('bash', [fixture.scriptPath, 'global'], {
      cwd: fixture.projectRoot,
      env: {
        ...process.env,
        HOME: fixture.homeRoot,
        QODER_CONFIG_DIR: configDir,
      },
      encoding: 'utf-8',
    });

    expect(result.status).toBe(0);

    const baseClaude = readFileSync(join(configDir, 'AGENTS.md'), 'utf-8');
    expect(baseClaude).toContain('<!-- OMQ:START -->');
    expect(baseClaude).toContain('<!-- OMQ:END -->');
    expect(baseClaude).toContain('<!-- User customizations (migrated from previous AGENTS.md) -->');
    expect(baseClaude).toContain('# User CLAUDE');
    expect(existsSync(join(configDir, 'AGENTS-omq.md'))).toBe(false);
  });

  it('preserves an existing global CLAUDE.md when preserve mode is explicitly requested', () => {
    const fixture = createPluginFixture(`<!-- OMQ:START -->
<!-- OMQ:VERSION:9.9.9 -->

# Canonical CLAUDE
Use the real docs file.
<!-- OMQ:END -->
`);

    const configDir = join(fixture.homeRoot, 'custom-profile');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'AGENTS.md'), '# User CLAUDE\nKeep my base config.\n');
    writeFileSync(join(configDir, 'settings.json'), JSON.stringify({ plugins: ['oh-my-qoder'] }));

    const result = spawnSync('bash', [fixture.scriptPath, 'global', 'preserve'], {
      cwd: fixture.projectRoot,
      env: {
        ...process.env,
        HOME: fixture.homeRoot,
        QODER_CONFIG_DIR: configDir,
      },
      encoding: 'utf-8',
    });

    expect(result.status).toBe(0);

    const baseClaude = readFileSync(join(configDir, 'AGENTS.md'), 'utf-8');
    const companionClaude = readFileSync(join(configDir, 'AGENTS-omq.md'), 'utf-8');

    expect(baseClaude).toContain('# User CLAUDE');
    expect(baseClaude).toContain('Keep my base config.');
    expect(baseClaude).toContain('<!-- OMQ:IMPORT:START -->');
    expect(baseClaude).toContain('@AGENTS-omq.md');
    expect(baseClaude).toContain('<!-- OMQ:IMPORT:END -->');
    expect(baseClaude).not.toContain('<!-- OMQ:START -->');

    expect(companionClaude).toContain('<!-- OMQ:START -->');
    expect(companionClaude).toContain('<!-- OMQ:END -->');
    expect(companionClaude).toContain('<!-- OMQ:VERSION:9.9.9 -->');
    expect(companionClaude).toContain('# Canonical CLAUDE');
  });

  it('updates the preserved companion file idempotently without duplicating the managed import block', () => {
    const fixture = createPluginFixture(`<!-- OMQ:START -->
<!-- OMQ:VERSION:9.9.9 -->

# Canonical CLAUDE
Use the real docs file.
<!-- OMQ:END -->
`);

    const configDir = join(fixture.homeRoot, 'custom-profile');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'AGENTS.md'), '# User CLAUDE\nKeep my base config.\n');
    writeFileSync(join(configDir, 'settings.json'), JSON.stringify({ plugins: ['oh-my-qoder'] }));

    const env = {
      ...process.env,
      HOME: fixture.homeRoot,
      QODER_CONFIG_DIR: configDir,
    };

    const first = spawnSync('bash', [fixture.scriptPath, 'global', 'preserve'], {
      cwd: fixture.projectRoot,
      env,
      encoding: 'utf-8',
    });
    expect(first.status).toBe(0);

    const second = spawnSync('bash', [fixture.scriptPath, 'global', 'preserve'], {
      cwd: fixture.projectRoot,
      env,
      encoding: 'utf-8',
    });
    expect(second.status).toBe(0);

    const baseClaude = readFileSync(join(configDir, 'AGENTS.md'), 'utf-8');
    expect(baseClaude.match(/<!-- OMQ:IMPORT:START -->/g)).toHaveLength(1);
    expect(baseClaude.match(/@AGENTS-omq\.md/g)).toHaveLength(1);
    expect(readFileSync(join(configDir, 'AGENTS-omq.md'), 'utf-8')).toContain('<!-- OMQ:VERSION:9.9.9 -->');
  });

  it('cleans up orphaned companion file when switching from preserve to overwrite mode', () => {
    const fixture = createPluginFixture(`<!-- OMQ:START -->
<!-- OMQ:VERSION:9.9.9 -->

# Canonical CLAUDE
Use the real docs file.
<!-- OMQ:END -->
`);

    const configDir = join(fixture.homeRoot, 'custom-profile');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'AGENTS.md'), '# User CLAUDE\nKeep my base config.\n');
    writeFileSync(join(configDir, 'settings.json'), JSON.stringify({ plugins: ['oh-my-qoder'] }));

    const env = {
      ...process.env,
      HOME: fixture.homeRoot,
      QODER_CONFIG_DIR: configDir,
    };

    // Run 1: preserve mode — creates companion + import block
    const first = spawnSync('bash', [fixture.scriptPath, 'global', 'preserve'], {
      cwd: fixture.projectRoot,
      env,
      encoding: 'utf-8',
    });
    expect(first.status).toBe(0);
    expect(existsSync(join(configDir, 'AGENTS-omq.md'))).toBe(true);
    expect(readFileSync(join(configDir, 'AGENTS.md'), 'utf-8')).toContain('<!-- OMQ:IMPORT:START -->');

    // Run 2: overwrite mode (default) — must clean up companion and import block
    const second = spawnSync('bash', [fixture.scriptPath, 'global', 'overwrite'], {
      cwd: fixture.projectRoot,
      env,
      encoding: 'utf-8',
    });
    expect(second.status).toBe(0);

    // Companion file must be removed
    expect(existsSync(join(configDir, 'AGENTS-omq.md'))).toBe(false);

    // CLAUDE.md must have OMQ markers inline, not an import block
    const baseClaude = readFileSync(join(configDir, 'AGENTS.md'), 'utf-8');
    expect(baseClaude).toContain('<!-- OMQ:START -->');
    expect(baseClaude).toContain('<!-- OMQ:END -->');
    expect(baseClaude).not.toContain('<!-- OMQ:IMPORT:START -->');
    expect(baseClaude).not.toContain('@AGENTS-omq.md');

    // User content should be preserved
    expect(baseClaude).toContain('# User CLAUDE');
  });

  it('refuses preserve mode when the companion path is a symlink', () => {
    const fixture = createPluginFixture(`<!-- OMQ:START -->
<!-- OMQ:VERSION:9.9.9 -->

# Canonical CLAUDE
Use the real docs file.
<!-- OMQ:END -->
`);

    const configDir = join(fixture.homeRoot, 'custom-profile');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'AGENTS.md'), '# User CLAUDE\nKeep my base config.\n');
    writeFileSync(join(configDir, 'settings.json'), JSON.stringify({ plugins: ['oh-my-qoder'] }));

    const realTarget = join(fixture.homeRoot, 'outside-target.md');
    writeFileSync(realTarget, 'outside target');
    symlinkSync(realTarget, join(configDir, 'AGENTS-omq.md'));

    const result = spawnSync('bash', [fixture.scriptPath, 'global', 'preserve'], {
      cwd: fixture.projectRoot,
      env: {
        ...process.env,
        HOME: fixture.homeRoot,
        QODER_CONFIG_DIR: configDir,
      },
      encoding: 'utf-8',
    });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain('Refusing to write OMQ companion AGENTS.md');
    expect(readFileSync(realTarget, 'utf-8')).toBe('outside target');
  });
});

describe('setup-claude-md.sh stale QODER_PLUGIN_ROOT resolution', () => {
  it('does not prefer a newer cache directory when it is missing required plugin assets', () => {
    const root = mkdtempSync(join(tmpdir(), 'omq-stale-invalid-newer-cache-'));
    tempRoots.push(root);

    const cacheBase = join(root, '.qwen', 'plugins', 'cache', 'omq', 'oh-my-qoder');
    const oldVersion = join(cacheBase, '4.8.2');
    const newerInvalid = join(cacheBase, '4.9.0');
    const projectRoot = join(root, 'project');
    const homeRoot = join(root, 'home');

    mkdirSync(join(oldVersion, 'scripts'), { recursive: true });
    mkdirSync(join(oldVersion, 'docs'), { recursive: true });
    copyFileSync(SETUP_SCRIPT, join(oldVersion, 'scripts', 'setup-claude-md.sh'));
    mkdirSync(join(oldVersion, 'scripts', 'lib'), { recursive: true });
    copyFileSync(CONFIG_DIR_HELPER, join(oldVersion, 'scripts', 'lib', 'config-dir.sh'));
    writeFileSync(
      join(oldVersion, 'docs', 'CLAUDE.md'),
      `<!-- OMQ:START -->\n<!-- OMQ:VERSION:4.8.2 -->\n\n# Old Version\n<!-- OMQ:END -->\n`,
    );

    // Newer directory exists but is missing docs/CLAUDE.md
    mkdirSync(newerInvalid, { recursive: true });

    mkdirSync(join(homeRoot, '.qwen', 'plugins'), { recursive: true });
    writeFileSync(
      join(homeRoot, '.qwen', 'plugins', 'installed_plugins.json'),
      JSON.stringify({
        'oh-my-qoder@omq': [
          {
            installPath: oldVersion,
            version: '4.8.2',
          },
        ],
      }),
    );

    mkdirSync(projectRoot, { recursive: true });
    mkdirSync(join(homeRoot, '.qwen'), { recursive: true });
    writeFileSync(join(homeRoot, '.qwen', 'settings.json'), JSON.stringify({ plugins: ['oh-my-qoder'] }));

    const result = spawnSync('bash', [join(oldVersion, 'scripts', 'setup-claude-md.sh'), 'local'], {
      cwd: projectRoot,
      env: {
        ...process.env,
        HOME: homeRoot,
        QODER_CONFIG_DIR: join(homeRoot, '.qwen'),
      },
      encoding: 'utf-8',
    });

    expect(result.status).toBe(0);

    const installed = readFileSync(join(projectRoot, '.qoder', 'AGENTS.md'), 'utf-8');
    expect(installed).toContain('<!-- OMQ:VERSION:4.8.2 -->');
    expect(installed).toContain('# Old Version');
  });

  it('ignores non-semver cache directories when selecting latest fallback version', () => {
    const root = mkdtempSync(join(tmpdir(), 'omq-stale-ignore-non-semver-'));
    tempRoots.push(root);

    const cacheBase = join(root, '.qwen', 'plugins', 'cache', 'omq', 'oh-my-qoder');
    const oldVersion = join(cacheBase, '4.8.2');
    const newVersion = join(cacheBase, '4.9.0');
    const suffixedInvalid = join(cacheBase, '4.10.0.tmp');
    const projectRoot = join(root, 'project');
    const homeRoot = join(root, 'home');

    mkdirSync(join(oldVersion, 'scripts'), { recursive: true });
    mkdirSync(join(oldVersion, 'docs'), { recursive: true });
    copyFileSync(SETUP_SCRIPT, join(oldVersion, 'scripts', 'setup-claude-md.sh'));
    mkdirSync(join(oldVersion, 'scripts', 'lib'), { recursive: true });
    copyFileSync(CONFIG_DIR_HELPER, join(oldVersion, 'scripts', 'lib', 'config-dir.sh'));
    writeFileSync(join(oldVersion, 'docs', 'CLAUDE.md'), `<!-- OMQ:START -->\n<!-- OMQ:VERSION:4.8.2 -->\n# Old\n<!-- OMQ:END -->\n`);

    mkdirSync(join(newVersion, 'docs'), { recursive: true });
    writeFileSync(join(newVersion, 'docs', 'CLAUDE.md'), `<!-- OMQ:START -->\n<!-- OMQ:VERSION:4.9.0 -->\n# New\n<!-- OMQ:END -->\n`);

    // Should be ignored by strict semver selection.
    mkdirSync(suffixedInvalid, { recursive: true });
    writeFileSync(join(suffixedInvalid, 'junk.txt'), 'not a plugin root');

    mkdirSync(join(homeRoot, '.qwen'), { recursive: true });
    mkdirSync(projectRoot, { recursive: true });
    writeFileSync(join(homeRoot, '.qwen', 'settings.json'), JSON.stringify({ plugins: ['oh-my-qoder'] }));

    // No installed_plugins.json => fallback scan path
    const result = spawnSync('bash', [join(oldVersion, 'scripts', 'setup-claude-md.sh'), 'local'], {
      cwd: projectRoot,
      env: {
        ...process.env,
        HOME: homeRoot,
        QODER_CONFIG_DIR: join(homeRoot, '.qwen'),
      },
      encoding: 'utf-8',
    });

    expect(result.status).toBe(0);

    const installed = readFileSync(join(projectRoot, '.qoder', 'AGENTS.md'), 'utf-8');
    expect(installed).toContain('<!-- OMQ:VERSION:4.9.0 -->');
    expect(installed).not.toContain('4.10.0.tmp');
  });

  it('prefers newer cache version when installed_plugins.json points to an existing but stale older version', () => {
    const root = mkdtempSync(join(tmpdir(), 'omq-stale-json-old-version-'));
    tempRoots.push(root);

    const cacheBase = join(root, '.qwen', 'plugins', 'cache', 'omq', 'oh-my-qoder');
    const oldVersion = join(cacheBase, '4.8.2');
    const newVersion = join(cacheBase, '4.9.0');
    const projectRoot = join(root, 'project');
    const homeRoot = join(root, 'home');

    // Script runs from old version path
    mkdirSync(join(oldVersion, 'scripts'), { recursive: true });
    mkdirSync(join(oldVersion, 'docs'), { recursive: true });
    copyFileSync(SETUP_SCRIPT, join(oldVersion, 'scripts', 'setup-claude-md.sh'));
    mkdirSync(join(oldVersion, 'scripts', 'lib'), { recursive: true });
    copyFileSync(CONFIG_DIR_HELPER, join(oldVersion, 'scripts', 'lib', 'config-dir.sh'));
    writeFileSync(
      join(oldVersion, 'docs', 'CLAUDE.md'),
      `<!-- OMQ:START -->\n<!-- OMQ:VERSION:4.8.2 -->\n\n# Old Version\n<!-- OMQ:END -->\n`,
    );

    // Newer cache version exists
    mkdirSync(join(newVersion, 'docs'), { recursive: true });
    writeFileSync(
      join(newVersion, 'docs', 'CLAUDE.md'),
      `<!-- OMQ:START -->\n<!-- OMQ:VERSION:4.9.0 -->\n\n# New Version\n<!-- OMQ:END -->\n`,
    );

    // installed_plugins.json still points at the old but existing path
    mkdirSync(join(homeRoot, '.qwen', 'plugins'), { recursive: true });
    writeFileSync(
      join(homeRoot, '.qwen', 'plugins', 'installed_plugins.json'),
      JSON.stringify({
        'oh-my-qoder@omq': [
          {
            installPath: oldVersion,
            version: '4.8.2',
          },
        ],
      }),
    );

    mkdirSync(projectRoot, { recursive: true });
    mkdirSync(join(homeRoot, '.qwen'), { recursive: true });
    writeFileSync(
      join(homeRoot, '.qwen', 'settings.json'),
      JSON.stringify({ plugins: ['oh-my-qoder'] }),
    );

    const result = spawnSync(
      'bash',
      [join(oldVersion, 'scripts', 'setup-claude-md.sh'), 'local'],
      {
        cwd: projectRoot,
        env: {
          ...process.env,
          HOME: homeRoot,
          QODER_CONFIG_DIR: join(homeRoot, '.qwen'),
        },
        encoding: 'utf-8',
      },
    );

    expect(result.status).toBe(0);

    const installed = readFileSync(join(projectRoot, '.qoder', 'AGENTS.md'), 'utf-8');
    expect(installed).toContain('<!-- OMQ:VERSION:4.9.0 -->');
    expect(installed).toContain('# New Version');
    expect(installed).not.toContain('<!-- OMQ:VERSION:4.8.2 -->');
  });

  it('uses docs/CLAUDE.md from the active version in installed_plugins.json, not the stale script location', () => {
    // Simulate: script lives at old version (4.8.2), but installed_plugins.json points to new version (4.9.0)
    const root = mkdtempSync(join(tmpdir(), 'omq-stale-root-'));
    tempRoots.push(root);

    const cacheBase = join(root, '.qwen', 'plugins', 'cache', 'omq', 'oh-my-qoder');
    const oldVersion = join(cacheBase, '4.8.2');
    const newVersion = join(cacheBase, '4.9.0');
    const projectRoot = join(root, 'project');
    const homeRoot = join(root, 'home');

    // Create old version (where the script will be copied)
    mkdirSync(join(oldVersion, 'scripts'), { recursive: true });
    mkdirSync(join(oldVersion, 'docs'), { recursive: true });
    copyFileSync(SETUP_SCRIPT, join(oldVersion, 'scripts', 'setup-claude-md.sh'));
    mkdirSync(join(oldVersion, 'scripts', 'lib'), { recursive: true });
    copyFileSync(CONFIG_DIR_HELPER, join(oldVersion, 'scripts', 'lib', 'config-dir.sh'));
    writeFileSync(
      join(oldVersion, 'docs', 'CLAUDE.md'),
      `<!-- OMQ:START -->\n<!-- OMQ:VERSION:4.8.2 -->\n\n# Old Version\n<!-- OMQ:END -->\n`,
    );

    // Create new version (the active one)
    mkdirSync(join(newVersion, 'docs'), { recursive: true });
    writeFileSync(
      join(newVersion, 'docs', 'CLAUDE.md'),
      `<!-- OMQ:START -->\n<!-- OMQ:VERSION:4.9.0 -->\n\n# New Version\n<!-- OMQ:END -->\n`,
    );

    // Create installed_plugins.json pointing to the new version
    mkdirSync(join(homeRoot, '.qwen', 'plugins'), { recursive: true });
    writeFileSync(
      join(homeRoot, '.qwen', 'plugins', 'installed_plugins.json'),
      JSON.stringify({
        'oh-my-qoder@omq': [
          {
            installPath: newVersion,
            version: '4.9.0',
          },
        ],
      }),
    );

    // Create project dir and settings.json (needed for plugin verification)
    mkdirSync(projectRoot, { recursive: true });
    mkdirSync(join(homeRoot, '.qwen'), { recursive: true });
    writeFileSync(
      join(homeRoot, '.qwen', 'settings.json'),
      JSON.stringify({ plugins: ['oh-my-qoder'] }),
    );

    // Run the OLD version's script — it should resolve to the NEW version's docs/CLAUDE.md
    const result = spawnSync(
      'bash',
      [join(oldVersion, 'scripts', 'setup-claude-md.sh'), 'local'],
      {
        cwd: projectRoot,
        env: {
          ...process.env,
          HOME: homeRoot,
          QODER_CONFIG_DIR: join(homeRoot, '.qwen'),
        },
        encoding: 'utf-8',
      },
    );

    expect(result.status).toBe(0);

    const installed = readFileSync(join(projectRoot, '.qoder', 'AGENTS.md'), 'utf-8');
    // Should contain the NEW version, not the old one
    expect(installed).toContain('<!-- OMQ:VERSION:4.9.0 -->');
    expect(installed).toContain('# New Version');
    expect(installed).not.toContain('<!-- OMQ:VERSION:4.8.2 -->');
  });

  it('uses docs/CLAUDE.md from the active version when installed_plugins.json wraps plugins under a plugins key', () => {
    const root = mkdtempSync(join(tmpdir(), 'omq-stale-wrapped-root-'));
    tempRoots.push(root);

    const cacheBase = join(root, '.qwen', 'plugins', 'cache', 'omq', 'oh-my-qoder');
    const oldVersion = join(cacheBase, '4.8.2');
    const newVersion = join(cacheBase, '4.9.0');
    const projectRoot = join(root, 'project');
    const homeRoot = join(root, 'home');

    mkdirSync(join(oldVersion, 'scripts'), { recursive: true });
    mkdirSync(join(oldVersion, 'docs'), { recursive: true });
    copyFileSync(SETUP_SCRIPT, join(oldVersion, 'scripts', 'setup-claude-md.sh'));
    mkdirSync(join(oldVersion, 'scripts', 'lib'), { recursive: true });
    copyFileSync(CONFIG_DIR_HELPER, join(oldVersion, 'scripts', 'lib', 'config-dir.sh'));
    writeFileSync(
      join(oldVersion, 'docs', 'CLAUDE.md'),
      `<!-- OMQ:START -->\n<!-- OMQ:VERSION:4.8.2 -->\n\n# Old Version\n<!-- OMQ:END -->\n`,
    );

    mkdirSync(join(newVersion, 'docs'), { recursive: true });
    writeFileSync(
      join(newVersion, 'docs', 'CLAUDE.md'),
      `<!-- OMQ:START -->\n<!-- OMQ:VERSION:4.9.0 -->\n\n# New Version\n<!-- OMQ:END -->\n`,
    );

    mkdirSync(join(homeRoot, '.qwen', 'plugins'), { recursive: true });
    writeFileSync(
      join(homeRoot, '.qwen', 'plugins', 'installed_plugins.json'),
      JSON.stringify({
        plugins: {
          'oh-my-qoder@omq': [
            {
              installPath: newVersion,
              version: '4.9.0',
            },
          ],
        },
      }),
    );

    mkdirSync(projectRoot, { recursive: true });
    mkdirSync(join(homeRoot, '.qwen'), { recursive: true });
    writeFileSync(
      join(homeRoot, '.qwen', 'settings.json'),
      JSON.stringify({ plugins: ['oh-my-qoder'] }),
    );

    const result = spawnSync(
      'bash',
      [join(oldVersion, 'scripts', 'setup-claude-md.sh'), 'local'],
      {
        cwd: projectRoot,
        env: {
          ...process.env,
          HOME: homeRoot,
          QODER_CONFIG_DIR: join(homeRoot, '.qwen'),
        },
        encoding: 'utf-8',
      },
    );

    expect(result.status).toBe(0);

    const installed = readFileSync(join(projectRoot, '.qoder', 'AGENTS.md'), 'utf-8');
    expect(installed).toContain('<!-- OMQ:VERSION:4.9.0 -->');
    expect(installed).toContain('# New Version');
    expect(installed).not.toContain('<!-- OMQ:VERSION:4.8.2 -->');
  });

  it('falls back to scanning cache for latest version when installed_plugins.json is unavailable', () => {
    const root = mkdtempSync(join(tmpdir(), 'omq-stale-fallback-'));
    tempRoots.push(root);

    const cacheBase = join(root, '.qwen', 'plugins', 'cache', 'omq', 'oh-my-qoder');
    const oldVersion = join(cacheBase, '4.8.2');
    const newVersion = join(cacheBase, '4.9.0');
    const projectRoot = join(root, 'project');
    const homeRoot = join(root, 'home');

    // Create old version (where the script lives)
    mkdirSync(join(oldVersion, 'scripts'), { recursive: true });
    mkdirSync(join(oldVersion, 'docs'), { recursive: true });
    copyFileSync(SETUP_SCRIPT, join(oldVersion, 'scripts', 'setup-claude-md.sh'));
    mkdirSync(join(oldVersion, 'scripts', 'lib'), { recursive: true });
    copyFileSync(CONFIG_DIR_HELPER, join(oldVersion, 'scripts', 'lib', 'config-dir.sh'));
    writeFileSync(
      join(oldVersion, 'docs', 'CLAUDE.md'),
      `<!-- OMQ:START -->\n<!-- OMQ:VERSION:4.8.2 -->\n\n# Old\n<!-- OMQ:END -->\n`,
    );

    // Create new version (no installed_plugins.json, relies on cache scan)
    mkdirSync(join(newVersion, 'docs'), { recursive: true });
    writeFileSync(
      join(newVersion, 'docs', 'CLAUDE.md'),
      `<!-- OMQ:START -->\n<!-- OMQ:VERSION:4.9.0 -->\n\n# New\n<!-- OMQ:END -->\n`,
    );

    // No installed_plugins.json — fallback to cache scan
    mkdirSync(join(homeRoot, '.qwen'), { recursive: true });
    mkdirSync(projectRoot, { recursive: true });
    writeFileSync(
      join(homeRoot, '.qwen', 'settings.json'),
      JSON.stringify({ plugins: ['oh-my-qoder'] }),
    );

    const result = spawnSync(
      'bash',
      [join(oldVersion, 'scripts', 'setup-claude-md.sh'), 'local'],
      {
        cwd: projectRoot,
        env: {
          ...process.env,
          HOME: homeRoot,
          QODER_CONFIG_DIR: join(homeRoot, '.qwen'),
        },
        encoding: 'utf-8',
      },
    );

    expect(result.status).toBe(0);

    const installed = readFileSync(join(projectRoot, '.qoder', 'AGENTS.md'), 'utf-8');
    expect(installed).toContain('<!-- OMQ:VERSION:4.9.0 -->');
    expect(installed).not.toContain('<!-- OMQ:VERSION:4.8.2 -->');
  });
});
