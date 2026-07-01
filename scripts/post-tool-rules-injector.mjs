#!/usr/bin/env node

/**
 * PostToolUse Hook: Rules Injector (issue #2577 bug 2)
 *
 * Injects relevant rule files (.qoder/rules, .github/instructions,
 * .cursor/rules, ~/.qoder/rules) into context when Claude accesses files.
 *
 * Uses content-hash + realpath dedup (via rules-injector storage) so the same
 * rule is never injected more than once per session regardless of how many
 * files are accessed.
 *
 * Worktree safety (bug 3): project root is derived from the ACCESSED FILE's
 * path via findProjectRoot, not from data.cwd. A .git FILE at the worktree
 * root stops the upward walk, preventing parent-repo rules from leaking in.
 */

import { isAbsolute, join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { readStdin } from './lib/stdin.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getRuntimeBaseDir() {
  return process.env.QODER_PLUGIN_ROOT || join(__dirname, '..');
}

// Dynamic import — graceful no-op when dist/ is not built (first run / dev)
let createRulesInjectorHook = null;
try {
  const runtimeBase = getRuntimeBaseDir();
  const mod = await import(
    pathToFileURL(join(runtimeBase, 'dist', 'hooks', 'rules-injector', 'index.js')).href
  );
  createRulesInjectorHook = mod.createRulesInjectorHook;
} catch {
  // dist not available — skip rules injection silently
}

/**
 * Extract the primary file path from tool input.
 * All tracked tools (read, write, edit, multiedit) expose file_path at the
 * top level of tool_input.
 */
function extractFilePath(toolInput) {
  if (!toolInput) return null;
  return toolInput.file_path || toolInput.path || null;
}

async function main() {
  try {
    const input = await readStdin();
    if (!input.trim()) {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    let data = {};
    try { data = JSON.parse(input); } catch { /* ignore parse errors */ }

    if (!createRulesInjectorHook) {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    const toolName  = data.tool_name  || data.toolName  || '';
    const toolInput = data.tool_input || data.toolInput  || {};
    const sessionId = data.session_id || data.sessionId  || 'unknown';
    const cwd       = data.cwd        || process.cwd();

    const rawPath = extractFilePath(toolInput);
    if (!rawPath) {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    // Resolve relative paths against the shell CWD
    const filePath = isAbsolute(rawPath) ? rawPath : join(cwd, rawPath);

    // createRulesInjectorHook uses cwd only for relative-path resolution.
    // Internally, processToolExecution calls findProjectRoot(filePath) to
    // determine the project boundary — so worktree isolation is maintained
    // even when cwd points to a parent repository.
    const hook = createRulesInjectorHook(cwd);
    const rulesText = hook.processToolExecution(toolName, filePath, sessionId);

    if (rulesText) {
      console.log(JSON.stringify({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: rulesText,
        },
      }));
    } else {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    }
  } catch {
    // Always continue on error — rules injection is additive only
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  }
}

main();
