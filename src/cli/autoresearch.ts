export const AUTORESEARCH_HELP = `omq autoresearch - HARD DEPRECATED

This command is no longer the authoritative autoresearch workflow.

Use this flow instead:
  1. /deep-interview --autoresearch "<mission idea>"
     - use deep-interview to generate/setup the mission and evaluator
  2. /oh-my-qoder:autoresearch
     - run the stateful single-mission autoresearch skill

Key behavior:
  - v1 is single-mission only
  - runtime requires an explicit evaluator script/command
  - non-passing iterations do not stop the run
  - the run stops at an explicit max-runtime ceiling

Legacy CLI examples such as:
  omq autoresearch --mission "..." --eval "..."
  omq autoresearch init ...
  omq autoresearch --resume ...
are hard-deprecated shims and no longer launch the old runtime.
`;

function renderDeprecationMessage(args: readonly string[]): string {
  const suffix = args.length > 0
    ? `\nReceived legacy arguments: ${args.join(' ')}\n`
    : '\n';

  return `${AUTORESEARCH_HELP}${suffix}`;
}

export function normalizeAutoresearchClaudeArgs(claudeArgs: readonly string[]): string[] {
  return [...claudeArgs];
}

export interface ParsedAutoresearchArgs {
  args: string[];
  deprecated: true;
}

export function parseAutoresearchArgs(args: readonly string[]): ParsedAutoresearchArgs {
  return {
    args: [...args],
    deprecated: true,
  };
}

export async function autoresearchCommand(args: string[]): Promise<void> {
  console.log(renderDeprecationMessage(args));
}
