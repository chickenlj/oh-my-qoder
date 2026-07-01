> ## Documentation Index
> Fetch the complete documentation index at: https://docs.qoder.com/llms.txt
> Use this file to discover all available pages before exploring further.

# 子代理

子代理（Subagent）是 Qoder CLI 中专门处理某类任务的 Agent。它可以拥有自己的系统提示词、工具集合、模型配置、权限模式、运行限制和 Hook，适合把代码探索、方案设计、接口审查、测试补齐、迁移评估等工作拆给更聚焦的执行者。

## 快速开始

1. 在 TUI 中执行 `/agents` 打开配置面板。
2. 按 `Tab` 切换到 `User` 或 `Project` 标签页。
3. 选择 `Create new agent...`，输入 Subagent 描述并确认。
4. 生成后直接在会话中调用它：

```text theme={null}
使用 api-reviewer subagent 审查这个 API 设计
```

## 什么是 Subagent

当一个任务需要跨多个文件探索、需要稳定的领域判断标准，或者不希望把大量搜索过程塞进主会话上下文时，可以使用 Subagent。主会话负责理解用户目标和编排，Subagent 负责完成一个清晰的子任务，并把最终结果返回给主会话。

Subagent 的核心价值：

| 价值        | 说明                                                                   |
| --------- | -------------------------------------------------------------------- |
| 保持主会话聚焦   | 每个 Subagent 有独立的对话上下文、系统提示词、工具注册表、运行记录和压缩流程。它读取、搜索、思考的中间过程不会直接混进主会话。 |
| 提升专业任务质量  | 可以为不同任务配置专用提示词、工具白名单、禁用工具、MCP 服务、模型、权限和运行上限，让审查、探索、规划等任务有稳定标准。       |
| 复用团队工作流   | 用户级和项目级 Subagent 可以反复使用，也可以随项目共享，让团队在相同任务上使用一致流程。                    |
| 控制工具和权限边界 | 每个 Subagent 可以拥有自己的工具集合和权限模式，降低高风险任务误用工具的概率。                         |
| 支持复杂任务编排  | 对彼此独立的任务可以并发执行；启用后台 Subagent 会话能力时，也可以把独立任务放到后台执行，完成后再通知主会话。         |

Subagent 的核心特性：

| 特性    | 说明                                                                   |
| ----- | -------------------------------------------------------------------- |
| 上下文隔离 | 每个 Subagent 有独立的对话上下文、系统提示词、工具注册表、运行记录和压缩流程。它读取、搜索、思考的中间过程不会直接混进主会话。 |
| 能力定制  | 可以为不同任务配置不同的提示词、工具白名单、禁用工具、MCP 服务、模型、权限和运行上限。                        |
| 并发执行  | 对彼此独立的任务，Qoder CLI 可以一次调度多个 Subagent 并行工作。                           |
| 后台运行  | 启用后台 Subagent 会话能力时，可以把独立任务放到后台执行，完成后再通知主会话。                         |
| 隔离工作区 | 需要独立改动时，可以使用 `worktree` 隔离，让 Subagent 在单独的 git worktree 中运行。         |

如果你已经知道具体文件或具体命令，直接使用对应工具通常更高效；Subagent 更适合开放式、多步骤、需要判断和汇总的任务。

## 内置 Subagent

Qoder CLI 会注册一组内置 Subagent。不同版本、运行模式和功能开关下，`/agents` 的 `BuiltIn` 标签页可能显示不同列表，请以实际列表为准。

常用内置 Subagent：

| 名称                | 能力                                                                     |
| ----------------- | ---------------------------------------------------------------------- |
| `general-purpose` | 通用研究型 Subagent。适合复杂搜索、多文件分析、调用链追踪和多步骤任务。没有显式指定 Subagent 类型时，调度工具默认使用它。 |
| `Explore`         | 快速只读代码探索。适合查找文件、搜索符号、理解现有实现。它继承可用工具后移除写入、控制类工具，并使用更偏探索的模型配置。           |
| `Plan`            | 只读方案设计。适合在改代码前梳理实现路径、关键文件、依赖顺序和架构取舍。                                   |

在特定模式或功能开启时，还可能看到：

| 名称                 | 出现场景      | 能力                                              |
| ------------------ | --------- | ----------------------------------------------- |
| `qoder-guide`      | 非 SDK 模式  | 回答 Qoder CLI 使用、配置、Skills、Agents、MCP、Hooks 等问题。 |
| `statusline-setup` | TUI 模式    | 配置自定义 status line，可能读取 shell 配置、创建脚本并更新设置。      |
| `SaveMemory`       | 记忆管理能力启用时 | 管理跨会话记忆、偏好和事实。                                  |

内置 Subagent 由 Qoder CLI 提供和维护，不能像用户级或项目级 Subagent 那样直接编辑。需要定制行为时，创建同名或新名称的自定义 Subagent，并通过来源优先级覆盖或显式调用。

## 查看和使用 Subagent

### 查看可用列表

#### TUI 方式

在 TUI 中输入：

```text theme={null}
/agents
```

`/agents` 面板按来源分组展示 Subagent，并支持查看详情、创建、启用/禁用、编辑自定义项和重新加载。修改 `.qoder/agents/` 或 `~/.qoder/agents/` 后，可以执行：

```text theme={null}
/agents reload
```

#### Headless 方式

在非交互环境中，可以使用：

```bash theme={null}
qodercli agents list
```

列表会显示所有发现到的 Subagent。若同名 Subagent 被更高优先级来源覆盖，列表会标记 shadowed 项。

### 来源和优先级

Qoder CLI 会从多个来源发现 Subagent。同名定义按优先级覆盖，优先级**从低到高**如下：

| 优先级 | 来源           | 入口                        | 说明                                                      |
| --- | ------------ | ------------------------- | ------------------------------------------------------- |
| 1   | Built-in（内置） | `/agents` 的 `BuiltIn` 标签页 | Qoder CLI 自带能力。由 Qoder CLI 提供和维护，通常不直接编辑。               |
| 2   | User         | `~/.qoder/agents/*.md`    | 用户级 Subagent。对当前用户的多个项目生效。                              |
| 3   | Project      | `.qoder/agents/*.md`      | 项目级 Subagent。对当前项目生效，适合随项目共享；受文件夹信任状态影响。                |
| 4   | Plugin       | 已安装插件提供                   | 插件提供的 Subagent。插件 Subagent 存在时才显示 `Plugin` 标签页，通常由插件维护。 |
| 5   | Flag         | `--agents` JSON           | 当前进程临时注入的 Subagent。优先级最高，只对本次命令或会话生效。                   |

实际生效的是最高优先级的同名定义；被覆盖的定义会在 `qodercli agents list` 中标记为 `shadowed`。

### 显式调用

#### TUI 模式

在 TUI 会话中，最稳定的方式是在输入中直接写出 Subagent 名称：

```text theme={null}
使用 api-reviewer subagent 审查这个接口设计
```

也可以在 TUI 输入中使用 `@` 提及已经加载的 Subagent：

```text theme={null}
@api-reviewer 审查这个接口设计，只返回需要修改的点
```

#### Headless 模式

在 Headless 模式中，通过 `qodercli -p` 传入同样的自然语言请求：

```bash theme={null}
qodercli -p "使用 api-reviewer subagent 审查这个接口设计"
```

### 隐式调用

使用自然语言直接输入任务内容，让 Qoder CLI 帮助你选择合适的 Subagent 处理任务

#### TUI 模式

在 TUI 会话中，Qoder CLI 会根据可用 Subagent 的 `description` 判断是否有匹配的可用 Subagent：

```text theme={null}
帮我做一次接口设计审查
```

#### Headless 模式

在 Headless 模式中，把任务描述传给 `qodercli -p` 后 Qoder CLI 同样会根据 Subagent 的 `description` 判断使用哪个 Subagent：

```bash theme={null}
qodercli -p "帮我做一次接口设计审查"
```

> **提示**：如果某个 Subagent 必须被使用，建议使用显式的调用方式。

### 作为本次会话主 Agent

`--agent` 会把某个已加载 Subagent 作为当前会话的主 Agent。此时该定义的 `initialPrompt` 会作为本次会话的初始提示使用。

#### TUI 模式

启动 TUI 时指定 `--agent`：

```bash theme={null}
qodercli --agent api-reviewer
```

进入 TUI 后，本次会话会使用 `api-reviewer` 作为主 Agent。`/agents` 面板中的运行入口不会切换主会话 Agent，它会通过 `@agent-name` 触发一次 Subagent 调用。

#### Headless 模式

在 Headless 模式中，和 `-p` 一起使用：

```bash theme={null}
qodercli --agent api-reviewer -p "审查这个接口设计"
```

### 编排多个 Subagent

使用自然语言描述 Subagent 的先后执行顺序，Qoder CLI 会按照编排的流程处理任务。

#### TUI 模式

在 TUI 会话中直接输入：

```text theme={null}
先使用 general-purpose subagent 检查实现方案，再使用 api-reviewer subagent 审查 API 设计
```

#### Headless 模式

在 Headless 模式中，通过 `qodercli -p` 传入同样的编排请求：

```bash theme={null}
qodercli -p "先使用 general-purpose subagent 检查实现方案，再使用 api-reviewer subagent 审查 API 设计" --max-turns 10
```

如果多个任务彼此独立，可以明确要求并行调度；如果有依赖关系，像上面这样说明先后顺序。`--max-turns` 是本次 Headless 查询的总轮次上限；要限制单个 Subagent，请在 Subagent 配置中设置 `maxTurns`。

## 自定义 Subagent

### 创建本地持久化 Subagent 定义

#### 方式一：AI 辅助生成（推荐）

这是创建 Subagent 最简单的方式。你只需要用自然语言描述需求，Qoder CLI 会自动生成完整的配置文件。

操作步骤：

1. 在 TUI 中执行 `/agents` 进入配置面板。
2. 按 `Tab` 切换到 `User` 或 `Project` 标签页。
3. 选择 `Create new agent...` 并按 `Enter`。
4. 输入 Subagent 描述，按 `Enter` 确认。

```text theme={null}
> /agents
------------------------------------------------------------------------------------------
Agents:  User  [Project]  BuiltIn

-> Create new agent...

Agent list:
No project agents found.

Press Enter to select - Esc to exit - Tab to cycle tabs - Up/Down to navigate
```

输入描述后，Qoder CLI 会自动生成配置：

```text theme={null}
> /agents
------------------------------------------------------------------------------------------
Agents:  User  [Project]  BuiltIn

Describe the agent:

> Help me review RESTful api design

Press Enter to select - Esc to exit - Tab to cycle tabs - Up/Down to navigate
```

生成完成后，可以在对应目录找到配置文件继续微调：

```bash theme={null}
# 项目级（Project 标签页）
.qoder/agents/

# 用户级（User 标签页）
~/.qoder/agents/
```

提示：建议先使用 AI 生成初始 Subagent，再迭代优化，让它符合你的具体需求。这种方式能快速得到一个可定制的基础配置。

#### 方式二：手动编写配置（进阶）

如果你需要完全控制 Subagent 配置，可以手动创建 Markdown 配置文件：

```bash theme={null}
# 项目级，仅当前项目生效，适合提交到仓库
.qoder/agents/api-reviewer.md

# 用户级，在当前用户的所有项目中生效
~/.qoder/agents/api-reviewer.md
```

Markdown 文件必须以 YAML frontmatter 开头。frontmatter 声明配置，正文就是该本地 Subagent 的系统提示词。

```markdown theme={null}
---
name: api-reviewer
description: Review API designs, endpoint naming, request methods, status codes, error responses, and versioning.
tools: [Read, Grep, Glob]
disallowedTools: [Write, Edit]
permissionMode: default
model: inherit
maxTurns: 8
timeoutMins: 10
color: cyan
---

You are an API design reviewer.

Focus on:
- Resource naming and URL structure
- Request method semantics
- Status code and error response consistency
- Pagination, filtering, and versioning

Return concise findings grouped by severity. Include concrete examples when possible.
```

文件名不决定 Subagent 名称；实际名称来自 frontmatter 的 `name` 字段。

### 用 `--agents` 临时注入

`--agents` 适合 Headless、脚本和一次性自动化。它接收一个 JSON 对象，键是 Subagent 名称，值是定义内容。通过 `--agents` 注入的 Subagent 只对当前进程生效，并且同名时优先级最高。

```bash theme={null}
qodercli \
  --agents '{"api-reviewer":{"description":"Review API designs","prompt":"You are an API reviewer.","tools":["Read","Grep","Glob"],"maxTurns":6}}' \
  -p "使用 api-reviewer subagent 审查 docs/api.yaml"
```

`--agents` 使用 `prompt` 字段作为系统提示词。当前 JSON schema 支持：`description`、`prompt`、`tools`、`disallowedTools`、`mcpServers`、`model`、`effort`、`color`、`maxTurns`、`initialPrompt`、`skills`、`permissionMode`。如果需要 `timeoutMins`、`temperature`、`hooks`、`memory`、`background` 或 `isolation`，请使用 Markdown 配置。

## 配置 Subagent

### 选择作用域

创建或注入自定义 Subagent 时，可以选择以下作用域：

| 作用域     | 配置入口                   |
| ------- | ---------------------- |
| Project | `.qoder/agents/*.md`   |
| User    | `~/.qoder/agents/*.md` |
| Flag    | `--agents`             |

### 配置工具

`tools` 和 `disallowedTools` 都可以写成逗号分隔字符串或字符串数组。字符串数组既可以使用 YAML 内联数组，也可以使用 YAML 列表：

```yaml theme={null}
tools: Read,Grep,Glob
```

```yaml theme={null}
tools: [Read, Grep, Glob]
```

```yaml theme={null}
tools:
  - Read
  - Grep
  - Glob
```

常用工具名包括 `Read`、`Grep`、`Glob`、`Bash`、`Write`、`Edit`、`WebFetch`、`WebSearch`、`Agent`。

MCP 工具使用完全限定名：

```yaml theme={null}
tools:
  - mcp__docs__search
  - mcp__docs__*
  - mcp__*
```

如果希望某个 Subagent 只能继续调用特定 Subagent，请使用 `Agent(name)` 表达式：

```yaml theme={null}
tools:
  - Read
  - Grep
  - Agent(Explore, Plan)
```

如果不希望它继续调度任何 Subagent，可以禁用 `Agent`：

```yaml theme={null}
disallowedTools: [Agent]
```

工具集合的处理顺序是：先根据 `tools` 注册可用工具，再应用 `disallowedTools` 移除工具。对于 MCP 工具，必须先通过 `mcpServers` 或全局 MCP 配置发现，再通过 `tools` 放行，Subagent 才能使用。

### 配置 MCP

可以引用已经配置好的 MCP 服务：

```yaml theme={null}
mcpServers:
  - docs
```

也可以内联定义只给这个 Subagent 使用的 MCP 服务：

```yaml theme={null}
mcpServers:
  docs:
    command: ./scripts/docs-mcp
    args: ["--stdio"]
    include_tools: ["search", "read"]
```

`mcpServers` 支持数组格式，也支持对象格式。内联服务字段如下：

| 字段                 | 含义                      |
| ------------------ | ----------------------- |
| `command`          | 启动 stdio MCP 服务的命令。     |
| `args`             | 命令参数数组。                 |
| `env`              | 传给 MCP 服务的环境变量。         |
| `cwd`              | MCP 服务工作目录。             |
| `url` / `http_url` | 远程 MCP 服务地址。            |
| `headers`          | 远程请求头。                  |
| `tcp`              | TCP 连接地址。               |
| `type`             | 传输类型，支持 `sse` 或 `http`。 |
| `timeout`          | 连接或调用超时时间。              |
| `trust`            | 是否信任该 MCP 服务。           |
| `description`      | 服务说明。                   |
| `include_tools`    | 只包含指定 MCP 工具。           |
| `exclude_tools`    | 排除指定 MCP 工具。            |

### 定义 Hook

`hooks` 写在 Subagent frontmatter 中时，只对该 Subagent 会话生效。支持的事件包括 `PreToolUse`、`PostToolUse`、`PostToolUseFailure`、`Stop`、`SubagentStart`、`SubagentStop`、`Notification`。

`hooks` 不支持字符串简写。每个事件的值必须是 matcher 数组；每个 matcher 里再通过 `hooks` 数组声明一个或多个 Hook。

Subagent 中的 `Stop` 会映射为 `SubagentStop`，即在该 Subagent 完成时触发，而不是在主会话结束时触发。

```yaml theme={null}
hooks:
  PreToolUse:
    - matcher: Bash
      hooks:
        - type: command
          command: ./scripts/check-subagent-command.sh
          timeout: 30
          statusMessage: Checking command
  Stop:
    - hooks:
        - type: command
          command: ./scripts/subagent-finished.sh
```

每个事件下是一组 matcher；每个 matcher 中的 `hooks` 支持以下类型：

| `type`    | 必需字段      | 说明                                                                             |
| --------- | --------- | ------------------------------------------------------------------------------ |
| `command` | `command` | 执行本地命令。可选 `shell`、`timeout`、`if`、`statusMessage`。                              |
| `http`    | `url`     | 调用 HTTP endpoint。可选 `headers`、`allowedEnvVars`、`timeout`、`if`、`statusMessage`。 |
| `prompt`  | `prompt`  | 用提示词运行一次模型判断。可选 `model`、`timeout`、`if`、`statusMessage`。                        |
| `agent`   | `prompt`  | 用独立 Hook Agent 执行判断。可选 `model`、`timeout`、`if`、`statusMessage`。                 |

frontmatter schema 也接受 `once`，但普通 Subagent frontmatter 中该字段不会作为一次性 Hook 语义保留；需要一次性行为时，请在 Hook 命令或外部状态中自行控制。

### 配置权限模式

`permissionMode` 控制 Subagent 工具调用的审批方式。

| 值                   | 含义                                    |
| ------------------- | ------------------------------------- |
| `default`           | 使用默认权限策略，需要确认时询问。                     |
| `acceptEdits`       | 自动接受编辑类操作。                            |
| `bypassPermissions` | 跳过权限确认。若安全策略禁用该模式，会降级为 `acceptEdits`。 |
| `dontAsk`           | 不主动询问；需要询问的操作会被拒绝。                    |
| `auto`              | 使用自动判断策略处理权限。                         |
| `plan`              | 开启该 Subagent 自己的计划状态，适合只读规划场景。        |

`permissionMode` 建议使用上表中的规范值。运行时会兼容大小写、下划线、连字符等写法；`yolo` 会被兼容解析为 `bypassPermissions`，但公开配置建议直接写 `bypassPermissions`。

需要注意：

* 未声明 `permissionMode` 时，Subagent 继承父会话当前模式。
* 父会话已经处于 `acceptEdits`、`bypassPermissions` 或 `auto` 时，Subagent 不能通过自己的配置把权限降得更严格。
* `plan` 不会污染主会话计划状态，它只在该 Subagent 的隔离上下文中生效。

### 配置远程 Subagent

远程 Subagent 通过 Agent Card 加载，不使用 Markdown 正文作为系统提示词，而是根据远程 Agent Card 暴露的能力和描述完成调用。

```markdown theme={null}
---
kind: remote
name: docs-helper
description: Answer questions using the remote documentation agent.
agentCardUrl: https://agent.example/.well-known/agent-card.json
---
```

也可以使用 `agentCardJson` 内联 Agent Card JSON。远程 Subagent 支持 `auth` 字段；常用认证类型包括 `apiKey`、`http` 和 `oauth`。需要认证时，建议把远程 Subagent 放在用户级配置中，避免把凭据提交到项目仓库。

### 使用 `settings.json` 覆盖已有 Subagent

`settings.json` 不能创建新的 Subagent，只能覆盖已经被发现的同名 Subagent。当前支持覆盖启用状态、模型配置、运行限制、工具白名单，并追加 MCP 服务。

```json theme={null}
{
  "agents": {
    "overrides": {
      "api-reviewer": {
        "enabled": true,
        "tools": ["Read", "Grep", "Glob"],
        "runConfig": {
          "maxTurns": 6,
          "maxTimeMinutes": 10
        },
        "modelConfig": {
          "model": "auto",
          "generateContentConfig": {
            "temperature": 0.2
          }
        },
        "mcpServers": {
          "docs": {
            "command": "./scripts/docs-mcp",
            "args": ["--stdio"]
          }
        }
      }
    }
  }
}
```

常见用途：

* 设置 `"enabled": false` 暂时隐藏某个 Subagent。
* 为某个 Subagent 单独调整模型和温度。
* 为自动化场景限制最大轮次或最长执行时间。
* 在不修改原始 Markdown 的情况下收紧工具集合。
* 为已有本地 Subagent 追加 MCP 服务。

插件提供的 Subagent 会应用额外安全策略：插件 Subagent 的 `hooks`、`mcpServers`、`permissionMode` 会被移除，`isolation` 只有 `worktree` 会被保留。

### 本地 Subagent 可配置全字段表

以下字段适用于 Markdown frontmatter。未识别字段会被忽略。

| 字段                |  必需 | 可取值                                                                 | 含义                                                                |
| ----------------- | :-: | ------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `name`            |  是  | 非空字符串                                                               | Subagent 名称。建议清晰、稳定、便于自然语言引用。                                     |
| `description`     |  是  | 非空字符串                                                               | 用途说明。Qoder CLI 会用它判断何时调用该 Subagent。                               |
| `background`      |  否  | 布尔值                                                                 | 是否默认后台运行。需要当前版本启用后台 Subagent 会话能力。                                |
| `color`           |  否  | `red`、`blue`、`green`、`yellow`、`purple`、`orange`、`pink`、`cyan`       | TUI 运行 Subagent 时展示的颜色。                                           |
| `disallowedTools` |  否  | 字符串或字符串数组                                                           | 工具黑名单，在工具注册后移除指定工具。                                               |
| `effort`          |  否  | `low`、`medium`、`high`、`xhigh`、`max` 或正整数                            | 推理强度或预算。                                                          |
| `hooks`           |  否  | Hook 配置对象                                                           | 仅作用于该 Subagent 会话的 frontmatter hooks。                             |
| `initialPrompt`   |  否  | 字符串                                                                 | 当该定义通过 `--agent` 作为会话主 Agent 使用时的初始提示；普通 Subagent 调用不会把它当作任务提示注入。 |
| `isolation`       |  否  | 推荐使用 `worktree`                                                     | 隔离方式。`worktree` 会让 Subagent 在独立 git worktree 中运行。未设置时使用默认工作区。     |
| `kind`            |  否  | `local`                                                             | 类型。省略时按本地 Subagent 处理。远程 Subagent 使用 `remote`，见下文。                |
| `maxTurns`        |  否  | 正整数                                                                 | 单次 Subagent 调用的最大对话轮次。                                            |
| `mcpServers`      |  否  | 服务名数组、内联服务对象或二者组合                                                   | 为该 Subagent 额外发现 MCP 工具。最终能否使用仍受 `tools` / `disallowedTools` 控制。  |
| `memory`          |  否  | `user`、`project`、`local`                                            | 该 Subagent 的持久记忆作用域。只有全局自动记忆能力启用时才生效。                             |
| `model`           |  否  | 任意模型名或模型别名；常见值 `inherit`、`auto`、`lite`、`efficient`、`performance`    | Subagent 使用的模型。省略时为 `inherit`，即继承当前会话模型。                          |
| `permissionMode`  |  否  | `default`、`acceptEdits`、`bypassPermissions`、`dontAsk`、`auto`、`plan` | 该 Subagent 的权限模式。未声明时继承父会话当前模式。                                   |
| `skills`          |  否  | 字符串或字符串数组                                                           | 限制该 Subagent 可使用的 Skills。                                         |
| `temperature`     |  否  | 数字                                                                  | 模型温度。省略时 loader 会写入默认温度配置。                                        |
| `timeoutMins`     |  否  | 正整数                                                                 | 单次 Subagent 调用的最长执行时间，单位为分钟。                                      |
| `tools`           |  否  | 字符串或字符串数组；支持 `*`                                                    | 工具白名单。省略时使用当前可用工具集合；`*` 表示全部工具。                                   |

## 测试效果

创建或修改 Subagent 后，建议按下面顺序验证：

1. 执行 `/agents reload` 或重新打开会话。
2. 在 `/agents` 或 `qodercli agents list` 中确认它出现在预期来源下。
3. 检查 `description` 是否具体说明了何时应该调用它。
4. 用显式名称调用一次：

```text theme={null}
使用 api-reviewer subagent 审查下面这个接口：

POST /login
GET /logout
```

5. 如果配置了只读工具，故意要求它“不要修改文件，只输出审查结果”，并确认没有出现写入操作。
6. 如果配置了 `disallowedTools`，尝试让它执行被禁用的能力，确认它会换用其他方式或返回限制说明。
7. 如果配置了 MCP，检查 Subagent 是否能发现目标 MCP 工具，并确认 `tools` 没有把该工具挡掉。
8. 如果配置了 `background` 或要求后台运行，确认任务启动后主会话不会等待完整结果，完成通知会在后续返回。

如果没有被调用，先改用显式名称或 `@name`；如果仍不可用，查看 `/agents` 面板中的加载错误。

## 最佳实践

* 一个 Subagent 只承担一种清晰职责，不要把审查、实现、测试、发布都塞进同一个提示词。
* `description` 写给调度判断使用，正文提示词写给 Subagent 自己使用；两者都要具体。
* 默认先给只读工具，需要写入时再加入 `Edit`、`Write` 或 `Bash`。
* 对高风险 Subagent 设置 `maxTurns`、`timeoutMins` 和明确的 `permissionMode`。
* 需要独立改动时使用 `isolation: worktree`，并在结果返回后检查 worktree 路径和实际 diff。
* 依赖 MCP 工具时，同时写清 `mcpServers` 和 `tools`，避免工具发现了但没有授权使用。
* 项目级 Subagent 适合提交到版本控制，用户级 Subagent 适合个人偏好和跨项目工作流。
* 修改配置后先显式调用测试，再依赖隐式调度。
* 对插件分发的 Subagent，不要依赖 `hooks`、`mcpServers`、`permissionMode` 这类会被安全策略移除的字段。

## 常见问题

### Subagent 和主会话有什么区别？

Subagent 在独立上下文中运行，使用自己的系统提示词、工具集合、运行限制和权限声明。它的结果会返回给主会话，由主会话继续整理并回复用户。

### 为什么我创建的项目级 Subagent 没有出现？

确认文件位于 `.qoder/agents/<name>.md`，frontmatter 至少包含 `name` 和 `description`，并且当前项目已被信任。修改后执行 `/agents reload`，并查看 `/agents` 面板中的加载错误。

### 为什么同名 Subagent 没有按我预期生效？

同名时高优先级来源会覆盖低优先级来源。优先级是 Built-in \< User \< Project \< Plugin \< Flag。可以用 `qodercli agents list` 查看 shadowed 项。

### `description` 和正文提示词有什么区别？

`description` 用于说明何时调用这个 Subagent，影响调度选择；正文提示词是 Subagent 被调用后看到的系统提示词，影响它怎么完成任务。

### 可以同时使用多个 Subagent 吗？

可以。对于彼此独立的任务，Qoder CLI 可以并发调度多个 Subagent；对于有依赖关系的任务，在提示中说明先后顺序。

### 可以让 Subagent 再调用其他 Subagent 吗？

可以，但需要工具集合里保留 `Agent`。如果只允许调用特定 Subagent，可以使用 `Agent(name)` 或 `Agent(name1, name2)`；如果完全不允许继续调度，使用 `disallowedTools: [Agent]`。

### 为什么 Subagent 不能使用我配置的 MCP 工具？

先确认 MCP 服务已经被 `mcpServers` 或全局配置发现，再确认 `tools` 中放行了对应工具名。只写 `mcpServers` 不等于自动授权所有 MCP 工具。

### 为什么 Subagent 的权限没有变得更严格？

如果父会话已经处于 `acceptEdits`、`bypassPermissions` 或 `auto`，Subagent 不能通过自己的 `permissionMode` 把权限降得更严格。未声明 `permissionMode` 时也会继承父会话当前模式。

### 后台 Subagent 的结果在哪里看？

后台运行时，主会话会先收到启动结果；任务完成后会通过后续通知返回。不要在完成前根据预期结果编造总结。

### 可以编辑内置或插件 Subagent 吗？

内置和插件 Subagent 不建议直接编辑。需要定制时，创建用户级或项目级 Subagent；如果使用同名覆盖，注意来源优先级和插件安全策略。
