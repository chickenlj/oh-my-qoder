# Local Plugin Installation

How to install and develop oh-my-qoder from a local checkout as a Qoder CLI plugin.

## Setup

```bash
# 1. Clone the repository
git clone https://github.com/anthropics/oh-my-qoder.git
cd oh-my-qoder

# 2. Install dependencies and build
npm install
npm run build

# 3. Install the plugin into Qoder CLI
qodercli plugins install /path/to/oh-my-qoder

# 4. Restart Qoder CLI (or run /plugins reload in TUI)
```

## Plugin Management Commands

```bash
# List installed plugins
qodercli plugins list

# Validate plugin structure
qodercli plugins validate /path/to/oh-my-qoder

# Disable the plugin (without uninstalling)
qodercli plugins disable oh-my-qoder

# Re-enable the plugin
qodercli plugins enable oh-my-qoder

# Uninstall
qodercli plugins uninstall oh-my-qoder
```

## Plugin Structure

The plugin is defined by `.qoder-plugin/plugin.json`:

```json
{
  "name": "oh-my-qoder",
  "version": "0.1.0",
  "description": "Multi-agent orchestration plugin for Qoder CLI"
}
```

Key directories loaded by Qoder CLI's plugin system:

| Directory / File | Contents |
|------------------|----------|
| `.qoder-plugin/plugin.json` | Plugin manifest (name, version, metadata) |
| `skills/` | Skill definitions (registered as `/oh-my-qoder:<name>`) |
| `agents/` | Agent definitions |
| `commands/` | Custom slash commands |
| `hooks/hooks.json` | Hook configurations for lifecycle events |
| `.mcp.json` | MCP server declarations |
| `src/` → `dist/` | TypeScript source → compiled output |
| `bridge/` | CJS bridge bundles for hook/HUD runtime |
| `scripts/` | Runtime scripts (session-start, setup, HUD wrapper) |

## Development Workflow

After making changes to the plugin source:

```bash
# 1. Rebuild (required for TypeScript changes)
npm run build

# 2. Restart Qoder CLI session to pick up changes
```

Skill files (`skills/*/SKILL.md`) and agent definitions (`agents/*.md`) take effect on next session without rebuilding.

## Install Scopes

Qoder CLI supports three install scopes:

```bash
# User scope (default) — available in all projects
qodercli plugins install /path/to/oh-my-qoder

# Project scope — only available in the current project
qodercli plugins install /path/to/oh-my-qoder --scope project

# Local scope — ephemeral, not persisted across sessions
qodercli plugins install /path/to/oh-my-qoder --scope local
```

## Troubleshooting

**Plugin not loading:**
- Run `qodercli plugins list` to check it appears and is enabled
- Verify `.qoder-plugin/plugin.json` exists and is valid JSON
- Run `qodercli plugins validate /path/to/oh-my-qoder` to check structure
- Restart Qoder CLI after installation

**Old code running after changes:**
- Did you run `npm run build`? TypeScript changes require rebuild.
- Restart Qoder CLI — plugins are loaded at session start.

**Diagnosing issues:**
- Use `/oh-my-qoder:omq-doctor` inside Qoder CLI for automated diagnostics
- Check `.omq/logs/` for runtime errors
