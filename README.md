# oh-my-qoder

> Intelligent multi-agent orchestration for Qoder CLI — specialized agents, workflow skills, lifecycle hooks, and MCP tools that turn a single prompt into a coordinated, verified engineering pipeline.

Inspired by oh-my-opencode and oh-my-claudecode, **oh-my-qoder (OMQ)** wraps the Qoder CLI (`qodercli`) with an orchestration layer: it routes work to the right specialist agent, runs parallel/looping workflows, persists state across sessions, and enforces verification before claiming completion.

## Table of contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Usage](#usage)
- [Features](#features)
- [Agents](#agents)
- [Skills](#skills)
- [Model routing](#model-routing)
- [State &amp; memory](#state--memory)
- [Configuration](#configuration)


## Requirements

| Requirement | Notes |
|---|---|
| **Qoder CLI** (`qodercli`) | The host CLI OMQ orchestrates. Install and log in first. |
| **Node.js ≥ 20** | Required to build and run the CLI/hooks. |
| **git** | Used to clone and build from source. |
| **tmux** *(optional)* | Needed for Team / parallel worker features. macOS/Linux native; on Windows use WSL2. |
| **Auth** | A Qoder/Qwen login (`qodercli login`) or a `DASHSCOPE_API_KEY` environment variable. |

## Installation

OMQ runs as a **Qoder CLI plugin**: its skills, agents, and lifecycle hooks are embedded directly into your `qodercli` sessions.

> Qoder CLI installs plugins from a **local directory** (`qodercli plugins install <path>`) — there is no marketplace/remote install, and the install step does not run `npm`. So you clone and build the plugin first, then point Qoder CLI at your local checkout.

**1. Clone and build** (produces `dist/`, which the plugin hooks load at runtime):

```bash
git clone https://github.com/spring-ai-alibaba/oh-my-qoder.git
cd oh-my-qoder
npm install
npm run build
```

**2. Install the local checkout as a plugin, then reload:**

```bash
qodercli plugins install "$(pwd)"
```

Restart Qoder CLI, or run `/plugins reload` inside a session, to activate it.

**3. Configure and verify** from inside a Qoder CLI session:

```text
/oh-my-qoder:omq-setup     # generate ~/.qoder/AGENTS.md and configure hooks/HUD/MCP
/oh-my-qoder:omq-doctor    # verify the installation
```

> **Updating:** `git pull`, then re-run `npm run build`, `/plugins reload`, and `/oh-my-qoder:omq-setup` to apply the latest hooks and configuration.

## Quick start

1. Install and build, then register the plugin (see [Installation](#installation)).
2. Configure: `/oh-my-qoder:omq-setup`.
3. Verify: `/oh-my-qoder:omq-doctor`.
4. Drive work with a natural-language keyword inside Qoder CLI:

```text
autopilot build me a REST API with health checks and tests
ralph fix all failing tests, don't stop until green
ultrawork add pagination to the users and orders endpoints
team 3:executor implement the billing module
```

## Usage

Once the plugin is registered, OMQ works entirely inside your Qoder CLI sessions — its hooks detect intent and inject orchestration automatically. There are two ways to drive it.

### Magic keywords (natural language)

Start your message with a workflow keyword followed by a plain-language task. OMQ detects it and runs the matching workflow — no flags, no setup:

```text
autopilot build a REST API for managing tasks, with tests
ralph fix all failing tests, don't stop until green
ultrawork add pagination to the users and orders endpoints
team 3:executor implement the billing module
plan design a caching layer for the search service
```

The main keywords:

| Keyword | Workflow |
|---|---|
| `autopilot` | Full pipeline: idea → spec → plan → code → QA → validate |
| `ralph` | Persistence loop that keeps going until the task is verified done |
| `ultrawork` | Maximum-parallelism multi-agent execution |
| `team` | N coordinated agents on a shared task list |
| `plan` / `ralplan` | Strategic planning (`ralplan` adds planner + architect + critic consensus) |
| `cleanup` | Regression-safe dead-code / duplication cleanup |
| `interview` | Socratic, ambiguity-gated requirement gathering |
| `cancel` | Stop any active workflow |

> Everyday phrasing also triggers these — e.g. "build me a…" / "I want a…" start Autopilot, "keep going" / "don't stop" start Ralph. The explicit keywords above are the reliable path.

### Slash commands (in-session)

Invoke plugin commands with the `/oh-my-qoder:<name>` prefix, e.g.:

```text
/oh-my-qoder:omq-setup      /oh-my-qoder:omq-doctor
/oh-my-qoder:hud            /oh-my-qoder:trace
/oh-my-qoder:mcp-setup      /oh-my-qoder:remember
```

## Features

- **Specialized agents** — role-based agents (explore, architect, executor, debugger, code-reviewer, test-engineer, designer, and more) with automatic model routing by task complexity.
- **Workflow skills** — Autopilot, Ralph, UltraWork, Team, RalPlan, Deep Interview, UltraQA, and many more.
- **Hooks system** — pre/post lifecycle hooks for session start, compaction, tool use, and keyword detection with `<system-reminder>` injection.
- **MCP tools** — state management, notepad, project memory, code intelligence (LSP diagnostics, AST search/replace), and trace timeline via the Model Context Protocol.
- **Team pipeline** — staged multi-agent orchestration: `plan → PRD → exec → verify → fix` (bounded loop).
- **HUD statusline** — live mode/agent/todo/context display in the Qoder CLI status bar.
- **Persistent state** — cross-session memory, notepad, and plans under `.omq/`.
- **Commit protocol** — structured git trailers (Constraint, Rejected, Directive, Confidence, Scope-risk, Not-tested).

## Agents

Specialized roles the orchestrator delegates to. Each has a focused prompt and a default model tier.

| Lane | Agents |
|---|---|
| Build / Analysis | `explore`, `analyst`, `planner`, `architect`, `debugger`, `executor`, `verifier` |
| Review | `code-reviewer`, `security-reviewer`, `code-simplifier` |
| Specialists | `test-engineer`, `qa-tester`, `designer`, `writer`, `document-specialist`, `scientist`, `git-master`, `tracer` |
| Coordination | `critic` |

See [`docs/agents/model-compatibility.md`](docs/agents/model-compatibility.md) and [`AGENTS.md`](AGENTS.md) for the full catalog and tiered variants.

## Skills

Workflow automation invoked via magic keywords, `/oh-my-qoder:<name>`, or `$name`:

- **Execution:** `autopilot`, `ralph`, `ultrawork`, `team`, `ultraqa`, `ultragoal`
- **Planning:** `plan`, `ralplan`, `deep-interview`, `deep-dive`
- **Quality:** `ai-slop-cleaner`, `verify`, `visual-verdict`, `trace`, `debug`
- **Knowledge:** `remember`, `wiki`, `learner`, `deepinit`, `external-context`
- **Setup / ops:** `omq-setup`, `omq-doctor`, `mcp-setup`, `hud`, `configure-notifications`, `release`

Browse the full set in [`skills/`](skills/) or the [`.qoder-plugin/plugin.json`](.qoder-plugin/plugin.json) manifest.

## Model routing

OMQ automatically selects a model tier based on task complexity:

| Tier | Use case |
|---|---|
| **LOW** | Quick lookups, narrow checks (e.g. `explore`, `writer`) |
| **MEDIUM** | Standard implementation, debugging, reviews (e.g. `executor`, `debugger`) |
| **HIGH** | Architecture, deep analysis, complex refactors (e.g. `architect`, `critic`) |

Routing is configurable per-agent and per-project — see [Configuration](#configuration).

## State & memory

Persistent state lives in the `.omq/` directory at your workspace root:

- `.omq/state/` — mode state files (JSON)
- `.omq/notepad.md` — session-persistent notes
- `.omq/project-memory.json` — cross-session project knowledge
- `.omq/plans/` — planning documents
- `.omq/logs/` — audit logs

For multi-repo workspaces, drop a `.omq-workspace` marker file in the parent directory so sibling repos share one `.omq/`. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).


## Configuration

OMQ reads layered configuration (later entries win):

```text
Defaults → user config → project config (.qoder/omq.jsonc) → environment variables
```

You can override agent models, toggle features, and customize magic keywords. The setup wizard also generates the orchestration instruction file:

| Scope | File |
|---|---|
| Global | `~/.qoder/AGENTS.md` |
| Project | `.qoder/AGENTS.md` |

See [`docs/GETTING-STARTED.md`](docs/GETTING-STARTED.md#configuration) and [`docs/settings-schema.md`](docs/settings-schema.md) for the full reference.
