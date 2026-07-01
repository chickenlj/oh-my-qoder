import { spawnSync } from 'child_process';

const OMQ_CLI_BINARY = 'omq';
const OMQ_PLUGIN_BRIDGE_PREFIX = 'node "$QODER_PLUGIN_ROOT"/bridge/cli.cjs';

export interface OmqCliRenderOptions {
  env?: NodeJS.ProcessEnv;
  omqAvailable?: boolean;
}

function commandExists(command: string, env: NodeJS.ProcessEnv): boolean {
  const lookupCommand = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(lookupCommand, [command], {
    stdio: 'ignore',
    env,
  });
  return result.status === 0;
}

export function resolveOmqCliPrefix(options: OmqCliRenderOptions = {}): string {
  const env = options.env ?? process.env;
  const omqAvailable = options.omqAvailable ?? commandExists(OMQ_CLI_BINARY, env);
  if (omqAvailable) {
    return OMQ_CLI_BINARY;
  }

  const pluginRoot = typeof env.QODER_PLUGIN_ROOT === 'string' ? env.QODER_PLUGIN_ROOT.trim() : '';
  if (pluginRoot) {
    return OMQ_PLUGIN_BRIDGE_PREFIX;
  }

  return OMQ_CLI_BINARY;
}

function resolveInvocationPrefix(
  commandSuffix: string,
  options: OmqCliRenderOptions = {},
): string {
  void commandSuffix;
  return resolveOmqCliPrefix(options);
}

export function formatOmqCliInvocation(
  commandSuffix: string,
  options: OmqCliRenderOptions = {},
): string {
  const suffix = commandSuffix.trim().replace(/^omq\s+/, '');
  return `${resolveInvocationPrefix(suffix, options)} ${suffix}`.trim();
}

export function rewriteOmqCliInvocations(
  text: string,
  options: OmqCliRenderOptions = {},
): string {
  if (!text.includes('omq ')) {
    return text;
  }

  return text
    .replace(/`omq ([^`\r\n]+)`/g, (_match, suffix: string) => {
      const prefix = resolveInvocationPrefix(suffix, options);
      return `\`${prefix} ${suffix}\``;
    })
    .replace(/(^|\n)([ \t>*-]*)omq ([^\n]+)/g, (_match, lineStart: string, leader: string, suffix: string) => {
      const prefix = resolveInvocationPrefix(suffix, options);
      return `${lineStart}${leader}${prefix} ${suffix}`;
    });
}
