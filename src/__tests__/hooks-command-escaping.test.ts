import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

interface HooksConfig {
  hooks?: Record<string, Array<{ hooks?: Array<{ command?: string }> }>>;
}

interface HookCommandEntry {
  event: string;
  command: string;
}

const hooksJsonPath = join(__dirname, '..', '..', 'hooks', 'hooks.json');

function expandHookCommandArgv(command: string, pluginRoot: string): string[] {
  const shellScript =
    `eval "set -- $HOOK_COMMAND"; ` +
    `node -e 'console.log(JSON.stringify(process.argv.slice(1)))' -- "$@"`;

  return JSON.parse(
    execFileSync('bash', ['-lc', shellScript], {
      encoding: 'utf-8',
      env: {
        ...process.env,
        HOOK_COMMAND: command,
        QODER_PLUGIN_ROOT: pluginRoot,
      },
    }).trim()
  ) as string[];
}

function getHookCommands(): HookCommandEntry[] {
  const raw = JSON.parse(readFileSync(hooksJsonPath, 'utf-8')) as HooksConfig;
  return Object.entries(raw.hooks ?? {}).flatMap(([event, groups]) =>
    groups.flatMap(group =>
      (group.hooks ?? [])
        .map(hook => hook.command)
        .filter((command): command is string => typeof command === 'string')
        .map(command => ({ event, command })),
    ),
  );
}

describe('hooks.json command escaping', () => {
  it('uses portable hook commands without absolute /bin/sh or pre-expanded ${...} placeholders', () => {
    for (const { command } of getHookCommands()) {
      expect(command).toMatch(/^node "\$QODER_PLUGIN_ROOT"\/scripts\/run\.cjs "\$QODER_PLUGIN_ROOT"\/scripts\/[^\s]+/);
      expect(command).not.toContain('find-node.sh');
      expect(command).not.toMatch(/^sh /);
      expect(command).not.toContain('/bin/sh');
      expect(command).not.toContain('${QODER_PLUGIN_ROOT}/scripts/run.cjs');
      expect(command).not.toContain('${QODER_PLUGIN_ROOT}/scripts/');
    }
  });

  it('keeps Windows-style plugin roots with spaces intact when bash expands the command', () => {
    const pluginRoot = '/c/Users/First Last/.qoder/plugins/cache/omq/oh-my-qoder/4.7.10';

    for (const { command } of getHookCommands()) {
      const argv = expandHookCommandArgv(command, pluginRoot);

      expect(argv[0]).toBe('node');
      expect(argv[1]).toBe(`${pluginRoot}/scripts/run.cjs`);
      expect(argv[2]).toContain(`${pluginRoot}/scripts/`);
      expect(argv[1]).toContain('First Last');
      expect(argv[2]).toContain('First Last');
      expect(argv).not.toContain('/c/Users/First');
      expect(argv).not.toContain('Last/.qoder/plugins/cache/omq/oh-my-qoder/4.7.10/scripts/run.cjs');
    }
  });

  it('find-node bootstrap can execute when node is absent from PATH', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'omq-hook-node-path-'));
    const configDir = join(homeDir, '.qwen');

    try {
      execFileSync('/bin/mkdir', ['-p', configDir]);
      writeFileSync(
        join(configDir, '.omq-config.json'),
        JSON.stringify({ nodeBinary: process.execPath }),
        'utf-8',
      );

      const stdout = execFileSync('/bin/sh', [
        join(process.cwd(), 'scripts', 'find-node.sh'),
        '-e',
        "process.stdout.write('ok')",
      ], {
        encoding: 'utf-8',
        env: {
          HOME: homeDir,
          QODER_CONFIG_DIR: configDir,
          PATH: '/usr/bin:/bin',
        },
      });

      expect(stdout).toBe('ok');
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });
});
