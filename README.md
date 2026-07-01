# oh-my-qoder

Multi-agent orchestration plugin for Qoder CLI, inspired by oh-my-opencode, oh-my-claudecode.

## Installation

```bash
qodercli plugins install <path-to-oh-my-qoder>
```

## Features Added to QOder CLI

- **Specialized Agents** -- 19+ role-based agents (explore, architect, executor, debugger, code-reviewer, test-engineer, designer, and more) with automatic model routing by task complexity
- **Workflow Skills** -- Autopilot, Ralph (persistence loop), UltraWork (parallel execution), Team (coordinated multi-agent), RalPlan (consensus planning), Deep Interview, and more
- **Hooks System** -- Pre/post lifecycle hooks for session start, compaction, tool use, and keyword detection with `<system-reminder>` injection
- **MCP Tools** -- State management, notepad, project memory, code intelligence (LSP diagnostics, AST search/replace), and trace timeline via Model Context Protocol
- **Team Pipeline** -- Staged multi-agent orchestration: plan -> PRD -> exec -> verify -> fix (loop)
- **Commit Protocol** -- Structured git trailers (Constraint, Rejected, Directive, Confidence, Scope-risk, Not-tested)

## Quick Start

1. Install the plugin:
   ```bash
   qodercli plugins install /path/to/oh-my-qoder
   ```

2. Run setup:
   ```
   /oh-my-qoder:omq-setup
   ```

3. Verify installation:
   ```
   /oh-my-qoder:omq-doctor
   ```

4. Start using skills:
   ```
   /oh-my-qoder:autopilot "build a REST API"
   /oh-my-qoder:ralph "fix all failing tests"
   /oh-my-qoder:team 3:executor "implement feature X"
   ```

## Plugin Structure

```
oh-my-qoder/
  agents/          # Agent role prompts (architect, executor, debugger, etc.)
  bin/             # CLI entry points
  commands/        # Slash command definitions (/oh-my-qoder:<name>)
  docs/            # Reference documentation
  hooks/           # Lifecycle hooks (session-start, pre-compact, etc.)
  scripts/         # Build and utility scripts
  skills/          # Workflow skill definitions (autopilot, ralph, team, etc.)
  src/             # TypeScript source
  templates/       # Templates for QODER.md, AGENTS.md generation
  QODER.md         # Main orchestration instructions (injected into sessions)
  AGENTS.md        # Agent catalog and detailed orchestration guide
  package.json     # Plugin manifest
```

## Key Concepts

### Agents
Specialized AI roles invoked via `/prompts:name`. Each agent has a focused prompt optimized for its task (e.g., `architect` for system design, `executor` for implementation, `debugger` for root-cause analysis).

### Skills
Workflow automation invoked via `/oh-my-qoder:<name>`. Skills orchestrate multi-step processes like autonomous coding (`autopilot`), persistent iteration (`ralph`), or parallel execution (`ultrawork`).

### State Management
Persistent state stored in `.omq/` directory:
- `.omq/state/` -- Mode state files (JSON)
- `.omq/notepad.md` -- Session-persistent notes
- `.omq/project-memory.json` -- Cross-session project knowledge
- `.omq/plans/` -- Planning documents

### Model Routing
Automatic model selection by task complexity:
- **lite** -- Quick lookups, narrow checks
- **auto/efficient** -- Standard implementation, debugging, reviews
- **performance/ultimate** -- Architecture, deep analysis, complex refactors

