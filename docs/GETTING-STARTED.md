# Getting Started

Quick-start guide for oh-my-qoder (OMQ) — a multi-agent orchestration plugin for Qoder CLI.

---

## Prerequisites

- [Qoder CLI](https://docs.qoder.com) installed and working (`qodercli` command available)
- Node.js 18+
- `DASHSCOPE_API_KEY` configured (or equivalent model provider credentials)

---

## Installation

OMQ is installed as a local Qoder CLI plugin.

### 1. Clone and build

```bash
git clone https://github.com/anthropics/oh-my-qoder.git
cd oh-my-qoder
npm install
npm run build
```

### 2. Install as a plugin

```bash
qodercli plugins install /path/to/oh-my-qoder
```

After installation, restart Qoder CLI or run `/plugins reload` in TUI to load the plugin.

### 3. Run initial setup

Inside Qoder CLI:

```
/oh-my-qoder:omq-setup
```

Or type `setup omq` in natural language.

---

## Verification

Confirm the plugin loaded:

1. Type `/skills` — you should see entries prefixed with `oh-my-qoder:` (e.g. `oh-my-qoder:autopilot`, `oh-my-qoder:team`).
2. Run `/oh-my-qoder:omq-doctor` to check hook installation, agent availability, and MCP server status.

---

## First Use

OMQ activates via slash commands or magic keywords.

### Slash commands

```
/oh-my-qoder:autopilot build a REST API for user management
/oh-my-qoder:team refactor the auth module
/oh-my-qoder:ultrawork add input validation to all endpoints
```

### Magic keywords

Type directly — no slash prefix:

| Keyword | Effect |
|---------|--------|
| `autopilot` | Full autonomous pipeline (plan, execute, verify) |
| `ralph` | Self-referential loop until task is done |
| `ultrawork` / `ulw` | Parallel execution engine |
| `ccg` | Claude-Codex-Gemini tri-model orchestration |
| `deepsearch` | Codebase-wide search |
| `ultrathink` | Deep reasoning mode |
| `cancelomq` | Cancel active execution mode |

### What you get

- **28 agent variants** — explorer, executor, architect, planner, critic, debugger, designer, verifier, security-reviewer, test-engineer, and more
- **38 skills** — autopilot, ralph, ultrawork, team, deep-interview, wiki, release, etc.
- **MCP tools** — LSP integration, AST search/replace, Python REPL, team coordination, wiki, state management
- **HUD statusline** — live progress display in Qoder CLI's status bar

---

## Configuration

### Config files

| Scope | Path | Purpose |
|-------|------|---------|
| User (global) | `~/.config/qoder-omq/config.jsonc` | Applied to all projects |
| Project | `.omq-config.json` | Current project only |

Priority: Defaults < User config < Project config < Environment variables.

### Environment variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `OMQ_MODEL_HIGH` | Model for complex tasks (architect, planner) | `qwen-max` |
| `OMQ_MODEL_MEDIUM` | Model for standard tasks (executor, debugger) | `qwen-plus` |
| `OMQ_MODEL_LOW` | Model for quick lookups (explore, writer) | `qwen-turbo` |
| `DISABLE_OMQ` | Kill switch — disables all OMQ hooks | `1` |
| `OMQ_SKIP_HOOKS` | Comma-separated list of hooks to skip | `keyword-detector` |

---

## Development Workflow

After editing OMQ source code:

```bash
npm run build        # Rebuild TypeScript
# Restart Qoder CLI session to pick up changes
```

Changes to skill markdown files (`skills/*/SKILL.md`) take effect on next Qoder CLI session without rebuilding.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Skills don't appear in `/skills` | Run `qodercli plugins list` to verify install; restart Qoder CLI |
| Hooks not firing | Run `/oh-my-qoder:omq-doctor`; check `DISABLE_OMQ` is not set |
| MCP tools unavailable | Verify `.mcp.json` exists in project root; re-run `/oh-my-qoder:omq-setup` |
| HUD not showing | Run `/oh-my-qoder:hud setup` to configure the statusline |

For deeper issues, check logs at `.omq/logs/`.
