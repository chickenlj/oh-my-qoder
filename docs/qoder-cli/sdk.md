> ## Documentation Index
> Fetch the complete documentation index at: https://docs.qoder.com/llms.txt
> Use this file to discover all available pages before exploring further.

# SDK References

<div id="functions" />

## Functions

<div id="query" />

### `query()`

SDK 的主入口函数。创建一个 async iterator，按消息到达顺序流式输出消息。

```python theme={null}
async def query(
    *,
    prompt: str | AsyncIterable[dict[str, Any]],
    options: QoderAgentOptions | None = None,
) -> AsyncIterator[Message]:
    ...
```

<div id="参数" />

#### 参数

| 参数        | 类型                                        | 说明                |
| :-------- | :---------------------------------------- | :---------------- |
| `prompt`  | `str \| AsyncIterable[dict[str, Any]]`    | 单轮传字符串；多轮传异步可迭代对象 |
| `options` | [`QoderAgentOptions`](#qoderagentoptions) | 可选会话配置            |

<div id="返回值" />

#### 返回值

返回 `AsyncIterator[Message]`，通过 `async for` 消费。

<div id="qodersdkclient" />

### `QoderSDKClient`

基于类的多轮会话 API。适合需要在多轮之间保持会话状态、动态切换模型或权限模式的场景。

```python theme={null}
client = QoderSDKClient(options=options)
await client.connect("Initial prompt.")
```

| 方法                                               | 说明                     |
| :----------------------------------------------- | :--------------------- |
| `client.query(prompt)`                           | 发送新一轮用户输入              |
| `client.receive_response()`                      | 消费消息直到 `ResultMessage` |
| `client.receive_messages()`                      | 后台异步迭代器，接收整个会话的消息流     |
| `client.connect(prompt)` / `client.disconnect()` | 手动管理连接                 |
| `client.interrupt()`                             | 中断当前生成或工具执行            |
| `client.set_model(model)`                        | 运行时切换模型                |
| `client.set_permission_mode(mode)`               | 运行时切换权限模式              |
| `client.stop_task(task_id)`                      | 停止后台任务                 |
| `client.apply_flag_settings(settings)`           | 注入 flag-level settings |
| `client.supported_agents()`                      | 列出当前可用 Agent           |
| `client.get_mcp_status()`                        | 获取所有 MCP server 状态     |
| `client.set_mcp_servers(servers)`                | 替换 MCP server 配置       |
| `client.reconnect_mcp_server(name)`              | 重连指定 MCP server        |
| `client.toggle_mcp_server(name, enabled)`        | 启用/禁用 MCP server       |
| `client.get_available_models()`                  | 获取可用模型列表               |

<div id="types" />

## Types

<div id="qoderagentoptions" />

### `QoderAgentOptions`

`query()` 和 `QoderSDKClient` 的配置对象。Python SDK 使用 snake\_case 字段名。

| 字段                                   | 类型                                                      | 默认值     | 说明                                                                     |
| :----------------------------------- | :------------------------------------------------------ | :------ | :--------------------------------------------------------------------- |
| `auth`                               | `InternalAuthOptions \| dict \| None`                   | `None`  | 认证配置                                                                   |
| `on_auth_expired`                    | `Callable \| None`                                      | `None`  | 认证过期回调，每个会话最多触发一次                                                      |
| `tools`                              | `list[str] \| ToolsPreset \| None`                      | `None`  | 工具集合。传字符串数组限定可用工具；内置工具名见 [内置工具列表](#内置工具列表)                             |
| `allowed_tools`                      | `list[str]`                                             | `[]`    | 工具白名单，预授权放行                                                            |
| `disallowed_tools`                   | `list[str]`                                             | `[]`    | 工具黑名单，优先级高于 `allowed_tools` 与 `permission_mode`                        |
| `can_use_tool`                       | [`CanUseTool`](#canusetool)                             | `None`  | 自定义工具权限回调                                                              |
| `permission_mode`                    | [`PermissionMode`](#permissionmode)                     | `None`  | 会话权限模式                                                                 |
| `allow_dangerously_skip_permissions` | `bool`                                                  | `False` | 允许跳过权限检查；与 `permission_mode="bypassPermissions"` 配合                    |
| `permission_prompt_tool_name`        | `str \| None`                                           | `None`  | 权限提示用的 MCP 工具名，与 `can_use_tool` 互斥                                     |
| `model`                              | `str \| None`                                           | `None`  | 使用的模型                                                                  |
| `fallback_model`                     | `str \| None`                                           | `None`  | 主模型失败时的备选模型                                                            |
| `resolve_model`                      | [`ModelPolicyProvider`](#modelpolicyprovider)           | `None`  | 动态模型选择回调，传入即进入动态回调模式，见 [Model Policy](/zh/cli/sdk/python/model-policy) |
| `resolve_model_timeout_ms`           | `int`                                                   | `500`   | 回调超时（毫秒），仅在传入 `resolve_model` 时生效                                      |
| `system_prompt`                      | `str \| SystemPromptPreset \| SystemPromptFile \| None` | `None`  | 系统提示                                                                   |
| `cwd`                                | `str \| Path \| None`                                   | `None`  | 工作目录                                                                   |
| `env`                                | `dict[str, str \| None]`                                | `{}`    | 传给 CLI 进程的环境变量                                                         |
| `cli_path`                           | `str \| Path \| None`                                   | `None`  | qodercli 可执行文件路径                                                       |
| `session_id`                         | `str \| None`                                           | `None`  | 指定会话 UUID                                                              |
| `resume`                             | `str \| None`                                           | `None`  | 要恢复的 session ID                                                        |
| `continue_conversation`              | `bool`                                                  | `False` | 继续最近一次会话                                                               |
| `fork_session`                       | `bool`                                                  | `False` | 与 `resume` 配合时分叉为新 session ID                                          |
| `max_turns`                          | `int \| None`                                           | `None`  | 最大对话轮次                                                                 |
| `include_partial_messages`           | `bool`                                                  | `False` | 包含 `StreamEvent` 流式片段，见 [流式输出](/zh/cli/sdk/python/streaming-output)    |
| `mcp_servers`                        | `dict[str, McpServerConfig] \| str \| Path`             | `{}`    | MCP 服务器配置，见 [MCP](/zh/cli/sdk/python/mcp)                              |
| `allowed_mcp_server_names`           | `list[str]`                                             | `[]`    | 限制可用的 MCP server                                                       |
| `strict_mcp_config`                  | `bool`                                                  | `False` | 严格 MCP 校验                                                              |
| `hooks`                              | `dict[HookEvent, list[HookMatcher]] \| None`            | `None`  | 生命周期钩子，见 [Hooks](/zh/cli/sdk/python/hooks)                             |
| `agents`                             | `dict[str, AgentDefinition] \| None`                    | `None`  | 编程方式定义的子 Agent，见 [Agents Reference](#qoderagentoptionsagents)          |
| `agent`                              | `str \| None`                                           | `None`  | 主线程使用的 agent 名，见 [Agents Reference](#qoderagentoptionsagent)           |
| `settings`                           | `str \| Path \| Settings \| None`                       | `None`  | 内联 settings 对象或 settings 文件路径                                          |
| `setting_sources`                    | `list[SettingSource] \| None`                           | `None`  | 加载哪些 filesystem settings                                               |
| `add_dirs`                           | `list[str \| Path]`                                     | `[]`    | AI 可访问的额外目录                                                            |
| `extra_args`                         | `dict[str, str \| None]`                                | `{}`    | 传给 CLI 的附加参数                                                           |
| `plugins`                            | `list[SdkPluginConfig]`                                 | `[]`    | 加载本地插件，见 [Plugins](/zh/cli/sdk/python/plugins)                         |
| `skills`                             | `list[str] \| Literal["all"] \| None`                   | `None`  | 启用的 Skill；传 `"all"` 启用全部                                               |
| `enable_file_checkpointing`          | `bool \| None`                                          | `None`  | 启用文件 checkpoint                                                        |
| `thinking`                           | `ThinkingConfig \| None`                                | `None`  | 思考配置                                                                   |

<div id="认证" />

### 认证

```python theme={null}
from qoder_agent_sdk import access_token, access_token_from_env, qodercli_auth
```

| 工厂函数                              | 说明                                       |
| :-------------------------------- | :--------------------------------------- |
| `access_token(token)`             | 直接传入 PAT                                 |
| `access_token_from_env()`         | 从默认环境变量 `QODER_PERSONAL_ACCESS_TOKEN` 读取 |
| `access_token_from_env("MY_PAT")` | 从指定环境变量读取                                |
| `qodercli_auth()`                 | 复用本机 `qodercli login` 状态                 |

便捷用法见 [SDK 认证](/zh/cli/sdk/python/authentication)。

<div id="agents-reference" />

<div id="agentsreference" />

## Agents Reference

本页汇总 SDK Agent 相关的稳定配置项。入门和使用场景见 [子 Agent 使用指南](/zh/cli/sdk/python/agents)。

<div id="可用-agent-来源" />

<div id="可用agent来源" />

### 可用 Agent 来源

当前会话可用的 Agent 可能来自多个来源：

| 来源        | 说明                                     |
| --------- | -------------------------------------- |
| SDK 注册    | 通过 `QoderAgentOptions.agents` 在本次会话内注册 |
| CLI 内置    | qodercli 启动时注册的内置 Agent                |
| 用户 / 项目配置 | 用户或项目配置目录里的 Agent 定义                   |
| 插件        | 已加载插件提供的 Agent                         |

交互式 CLI 中可以通过 `/agents` 查看当前发现的 Agent；命令行可以运行 `qodercli agents list`。Python SDK 中可以在 `QoderSDKClient` 连接完成后调用 `client.supported_agents()` 获取当前会话可用 Agent 的摘要。

<div id="qoderagentoptionsagents" />

<div id="qoderagentoptions-agents" />

### `QoderAgentOptions.agents`

**类型:** `dict[str, AgentDefinition] | None`

注册当前会话可用的自定义 Agent。dict key 是 Agent 名称，value 是该 Agent 的定义。

> **必须包含 `Agent` 工具**：自定义子 Agent 需要主会话通过内置 `Agent` 工具发起委派，因此 `allowed_tools` 中必须包含 `Agent` 工具。

```python theme={null}
from qoder_agent_sdk import AgentDefinition, QoderAgentOptions


options = QoderAgentOptions(
    allowed_tools=["Agent"],
    agents={
        "reviewer": AgentDefinition(
            description="Reviews code quality and reports actionable findings.",
            prompt="Review the requested code and report concrete issues.",
            tools=["Read", "Grep", "Glob"],
        ),
    },
)
```

注册后，模型可通过内置 `Agent` 工具调用这些子 Agent。主会话要能委派任务，工具集中必须存在 `Agent`；`allowed_tools=["Agent"]` 是必需的预授权写法。如果你使用 `tools` 收窄主会话可用工具，也要把 `Agent` 放进去。

<div id="qoderagentoptionsagent" />

<div id="qoderagentoptions-agent" />

### `QoderAgentOptions.agent`

**类型:** `str | None`

指定主会话以哪个 Agent 身份运行。值可以是 `agents` 中注册的名称，也可以是当前 CLI 已发现的内置 / 插件 Agent 名称。

```python theme={null}
options = QoderAgentOptions(
    agents={
        "planner": AgentDefinition(
            description="Plans work before implementation.",
            prompt="Break work into steps, risks, and validation checks.",
            tools=["Read", "Grep", "Glob"],
        ),
    },
    agent="planner",
)
```

设置后，主会话使用该 Agent 的 `prompt`、`model` 和工具限制。省略时使用默认主会话行为。

<div id="agentdefinition" />

### `AgentDefinition`

自定义 Agent 的定义。Python SDK 的 `AgentDefinition` 是 dataclass，字段名使用协议风格 camelCase。下列字段是当前版本 SDK 覆盖并经过功能测试验证的稳定能力。

```python theme={null}
from dataclasses import dataclass
from typing import Any, Literal


@dataclass
class AgentDefinition:
    description: str
    prompt: str
    tools: list[str] | None = None
    disallowedTools: list[str] | None = None
    model: str | None = None
    skills: list[str] | None = None
    mcpServers: list[str | dict[str, Any]] | None = None
    initialPrompt: str | None = None
    maxTurns: int | None = None
    effort: Literal["low", "medium", "high", "max"] | None = None
    permissionMode: PermissionMode | None = None
```

| 字段                | 类型                                             | 必填 | 说明                         |
| ----------------- | ---------------------------------------------- | -- | -------------------------- |
| `description`     | `str`                                          | 是  | Agent 用途描述，模型据此判断何时调用      |
| `prompt`          | `str`                                          | 是  | Agent 的系统提示词               |
| `tools`           | `list[str] \| None`                            | 否  | Agent 可用工具白名单              |
| `disallowedTools` | `list[str] \| None`                            | 否  | 从 Agent 工具集中排除的工具          |
| `model`           | `str \| None`                                  | 否  | 模型覆盖；`"inherit"` 表示继承主会话模型 |
| `mcpServers`      | `list[str \| dict[str, Any]] \| None`          | 否  | Agent 可用的 MCP server 规格    |
| `skills`          | `list[str] \| None`                            | 否  | 预加载到 Agent 上下文的 skill 名称   |
| `initialPrompt`   | `str \| None`                                  | 否  | 作为主会话 Agent 时自动提交的首轮用户输入   |
| `maxTurns`        | `int \| None`                                  | 否  | Agent 最大 API 轮次            |
| `effort`          | `"low" \| "medium" \| "high" \| "max" \| None` | 否  | 推理努力级别                     |
| `permissionMode`  | `PermissionMode \| None`                       | 否  | Agent 内工具执行的权限模式           |

Python SDK 会把 `AgentDefinition` 通过 `dataclasses.asdict()` 序列化进 initialize 请求；qodercli 再按当前 Agent schema 解析。

<div id="description" />

#### `description`

描述 Agent 适合处理什么任务。它会影响模型是否选择该 Agent。

```python theme={null}
description="Runs project tests, analyzes failing output, and suggests fixes."
```

建议写清楚触发场景。避免只写 `Helpful assistant` 这类宽泛描述。

<div id="prompt" />

#### `prompt`

Agent 的系统提示词，用来定义角色、约束和输出格式。

```python theme={null}
prompt="""You are a security reviewer.
Check for authentication bypass, authorization bugs, injection risks, and secret leaks.
Return findings sorted by severity."""
```

<div id="tools" />

#### `tools`

Agent 可用工具白名单。设置后，Agent 只能使用列出的工具。

```python theme={null}
tools=["Read", "Grep", "Glob"]
```

省略 `tools` 时，使用子 Agent 默认工具表。子 Agent 的工具表不继承主会话 `allowed_tools` 的裁剪。

<div id="disallowedtools" />

#### `disallowedTools`

从 Agent 工具集中排除指定工具。

```python theme={null}
disallowedTools=["Bash", "Write"]
```

省略 `disallowedTools` 时，子 Agent 不继承主会话 `disallowed_tools` 的裁剪。通常不要同时设置 `tools` 和 `disallowedTools`，除非你明确知道最终工具集合。

<div id="model" />

<div id="agentdefinition-model" />

#### `model`

为 Agent 指定模型，省略时使用会话默认模型。Python 类型层面是 `str | None`，SDK 不在本地限制具体字符串。常见模型级别包括：

| 值               | 级别   | 说明                 | 适用场景             | Credit 消耗 |
| --------------- | ---- | ------------------ | ---------------- | --------- |
| `"auto"`        | 智能路由 | 智能选择最适合的模型，平衡性能与成本 | 大部分日常开发工作，建议默认使用 | \~1.0x    |
| `"ultimate"`    | 极致   | 专家级深度推理与思考能力       | 复杂系统设计、高难度问题分析   | \~1.6x    |
| `"performance"` | 性能   | 高级推理能力，高质量输出       | 核心功能实现、架构设计、代码重构 | \~1.1x    |
| `"efficient"`   | 经济   | 标准推理能力，高性价比        | 基础代码生成、单元测试、日常问答 | \~0.3x    |
| `"lite"`        | 轻量   | 基础推理能力，免费使用        | 快速验证、基础逻辑实现、快问快答 | 0x        |

Agent 还支持两个特殊写法：

| 值           | 说明                                        |
| ----------- | ----------------------------------------- |
| `"inherit"` | 继承主会话模型；`supported_agents()` 中通常不回填 model |
| 完整模型 ID     | 直接指定当前 CLI / 后端支持的模型 ID                   |

<div id="mcpservers" />

<div id="agentdefinition-mcpservers" />

#### `mcpServers`

```python theme={null}
mcpServers: list[str | dict[str, Any]] | None
```

限制或增加该 Agent 可用的 MCP server。每个 entry 可以是会话级 server 名称，也可以是一个内联 server 配置映射。

引用会话级 MCP server：

```python theme={null}
options = QoderAgentOptions(
    mcp_servers={
        "orders": {
            "command": "python",
            "args": ["servers/orders.py"],
        },
    },
    allowed_tools=["Agent"],
    agents={
        "support": AgentDefinition(
            description="Answers support questions using order tools.",
            prompt="Use order tools when needed and return a concise answer.",
            mcpServers=["orders"],
            tools=["mcp__orders__lookup_order"],
        ),
    },
)
```

给某个 Agent 配专属 MCP server：

```python theme={null}
AgentDefinition(
    description="Searches the internal knowledge base.",
    prompt="Search the knowledge base and cite relevant entries.",
    mcpServers=[
        {
            "kb": {
                "command": "python",
                "args": ["servers/kb.py"],
            },
        },
    ],
    tools=["mcp__kb__search"],
)
```

只想暴露某个 MCP 工具时，同时配置 `tools=["mcp__server__tool"]`，避免把该 server 的全部工具都暴露给 Agent。

<div id="skills" />

#### `skills`

预加载到 Agent 上下文的 skill 名称列表。支持普通 skill 名称，也支持插件限定名。

```python theme={null}
skills=["review", "sdk-test-plugin:sdk-echo"]
```

会话级 skill 行为见 [Skills](/zh/cli/sdk/python/skills)。

<div id="initialprompt" />

#### `initialPrompt`

当该 Agent 通过 `QoderAgentOptions.agent` 成为主会话 Agent 时，自动作为首轮用户输入提交。

```python theme={null}
initialPrompt="Start by scanning authentication and session management code."
```

该字段只对主会话 Agent 生效。作为子 Agent 被 `Agent` 工具调用时会被忽略。

<div id="maxturns" />

<div id="agentdefinition-maxturns" />

#### `maxTurns`

限制 Agent 的最大 API 轮次。适合控制成本、执行时间和循环风险。

```python theme={null}
maxTurns=6
```

<div id="effort" />

<div id="agentdefinition-effort" />

#### `effort`

```python theme={null}
EffortLevel = Literal["low", "medium", "high", "max"]
```

控制 Agent 的推理努力级别。更高的 `effort` 通常适合复杂审查、架构分析和高风险变更，但会增加延迟和 token 消耗。

<div id="agentdefinition-permissionmode" />

#### `permissionMode`

控制该 Agent 内部工具执行的权限模式。它和会话级 `permission_mode` 使用同一组语义，但作用范围只限这个 Agent。会话级权限链路、`allowed_tools` / `disallowed_tools` / `can_use_tool` 的优先级和示例见 [权限控制](/zh/cli/sdk/python/permissions#控制默认策略permission_mode)。

```python theme={null}
PermissionMode = Literal[
    "default",
    "acceptEdits",
    "plan",
    "bypassPermissions",
    "yolo",
    "dontAsk",
    "auto",
]
```

| 值                     | 语义                                              | 适合场景                     |
| --------------------- | ----------------------------------------------- | ------------------------ |
| `"default"`           | 标准权限行为。工具调用仍会经过工具集合、允许 / 禁止规则、运行时审批或 CLI 默认策略处理 | 大多数交互式子 Agent            |
| `"acceptEdits"`       | 自动接受文件编辑类操作；其他敏感操作仍按权限流程处理                      | 已确认子 Agent 可以修改工作区文件     |
| `"bypassPermissions"` | 跳过权限检查。高风险模式，通常只用于受信任的自动化或测试环境                  | 受控 CI、临时验证、一次性自动化任务      |
| `"yolo"`              | `"bypassPermissions"` 的兼容别名，同样会跳过权限检查           | 兼容旧配置，不建议新代码优先使用         |
| `"plan"`              | 计划模式，适合先产出执行计划，默认不执行实际变更                        | 规划、设计、审查，不希望子 Agent 修改文件 |
| `"dontAsk"`           | 不进行交互询问；未预授权、未被规则允许的操作会被拒绝                      | 无交互运行环境，或希望失败也不要弹确认      |
| `"auto"`              | 由运行时能力自动判断 allow 或 deny                         | 希望减少确认打断，同时保留运行时判断       |

权限语义介绍见 [权限控制](/zh/cli/sdk/python/permissions)。

<div id="agentinfo" />

### `AgentInfo`

`QoderSDKClient.supported_agents()` 返回的 Agent 摘要。

```python theme={null}
class AgentInfo(TypedDict):
    name: str
    description: str
    model: NotRequired[str | None]
```

Python SDK 当前没有导出名为 `AgentInfo` 的 TypedDict；`supported_agents()` 的返回类型是 `list[dict[str, Any]]`。上面的结构是实际返回 dict 的稳定字段约定。

| 字段            | 类型            | 说明                                       |
| ------------- | ------------- | ---------------------------------------- |
| `name`        | `str`         | Agent 名称                                 |
| `description` | `str`         | Agent 用途描述                               |
| `model`       | `str \| None` | Agent 的模型覆盖；未设置或 `model="inherit"` 时通常为空 |

```python theme={null}
from qoder_agent_sdk import AgentDefinition, QoderAgentOptions, QoderSDKClient


options = QoderAgentOptions(
    agents={
        "reviewer": AgentDefinition(
            description="Reviews code quality.",
            prompt="Review code and report findings.",
        ),
    },
)

client = QoderSDKClient(options=options)
await client.connect("List agents.")
agents = client.supported_agents()
await client.disconnect()
```

返回列表可能包含通过 `agents` 注册的 Agent，也可能包含当前 CLI 发现的内置、项目、用户或插件 Agent。实际可用项取决于 qodercli 版本和当前配置。

<div id="上下文与调用边界" />

### 上下文与调用边界

* 子 Agent 使用独立上下文，不接收父会话完整历史。
* 父会话传给子 Agent 的主要信息，是调用 `Agent` 工具时传入的任务 prompt。
* 子 Agent 的中间工具结果不会直接进入父会话；父会话收到的是子 Agent 最终返回。
* 子 Agent 不能再生成自己的子 Agent，因此不要把 `Agent` 放进子 Agent 的 `tools`。
* `initialPrompt` 只对 `agent` 指定的主会话 Agent 生效。

<div id="相关文档" />

### 相关文档

* [子 Agent 使用指南](/zh/cli/sdk/python/agents)
* [Tools Reference](#tools-reference)
* [MCP 集成](/zh/cli/sdk/python/mcp)
* [权限控制](/zh/cli/sdk/python/permissions)
* [Skills](/zh/cli/sdk/python/skills)

<div id="model-policy" />

<div id="modelpolicy" />

### Model Policy

`query()` 的动态模型选择能力。两种模式：固定模型（不传 `resolve_model`，使用 `options.model` 或后端默认）与动态回调模式（传入 `resolve_model`，每次 LLM 调用前由回调决定模型）。完整概念、触发时机与错误处理见 [Model Policy](/zh/cli/sdk/python/model-policy)。

<div id="optionsresolve_model" />

<div id="options-resolve_model" />

#### `options.resolve_model`

**类型:** [`ModelPolicyProvider`](#modelpolicyprovider)

动态回调模式入口。传入即进入动态回调模式，每次 LLM 请求前 SDK 都会调用该回调拿模型；回调返回的 `model` 是该次请求的最终模型，**不会自动降级**。

<div id="optionsresolve_model_timeout_ms" />

<div id="options-resolve_model_timeout_ms" />

#### `options.resolve_model_timeout_ms`

**类型:** `int`，默认 `500`

回调超时（毫秒）。超时后抛 [`ModelPolicyTimeoutError`](#modelpolicytimeouterror)，query 失败，不降级。仅在传入 `resolve_model` 时生效。

<div id="modelpolicyprovider" />

### `ModelPolicyProvider`

回调函数签名。同步或异步均可。

```python theme={null}
from typing import Awaitable, Callable

ModelPolicyProvider = Callable[
    ["ModelPolicyContext"],
    "ModelPolicyResult | Awaitable[ModelPolicyResult]",
]
```

触发时机按 [`QoderModelPurpose`](#qodermodelpurpose) 区分：

| 触发场景        | `purpose`     | 说明                                                    |
| ----------- | ------------- | ----------------------------------------------------- |
| 主对话         | `'main'`      | 每个 turn / tool 之间都会再次调用，一个会话可触发多次                     |
| 子代理         | `'subagent'`  | 子代理使用同一个 provider                                     |
| WebFetch 工具 | `'web_fetch'` | WebFetch 抓取内容后用二次 LLM 总结                              |
| ImageGen 工具 | `'image_gen'` | 用于图像生成模型选择                                            |
| 上下文压缩       | `'compact'`   | 触发压缩前先问回调取压缩用模型                                       |
| BYOK        | 任意            | `model` 传 [`CustomModel`](#custommodel) 对象走第三方 LLM 链路 |

行为要点：

* 同一会话内会触发多次（每个 turn / tool / 子任务前都会再问一次）。
* 回调返回的 `model` 是该次请求的最终模型，SDK 不再做二次校验。
* 抛异常或返回空 `model` 让 query 直接失败，详细错误处理见 [Model Policy — 错误处理](/zh/cli/sdk/python/model-policy#错误处理)。

<div id="modelpolicycontext" />

### `ModelPolicyContext`

回调每次接收的上下文。

```python theme={null}
class ModelPolicyContext(TypedDict, total=False):
    purpose: str  # QoderModelPurpose
    sessionId: str
    agentId: str
    turnIndex: int
    availableModels: list[ModelInfo]
```

| 字段                | 类型                                        | 必填 | 说明                                              |
| ----------------- | ----------------------------------------- | -- | ----------------------------------------------- |
| `purpose`         | [`QoderModelPurpose`](#qodermodelpurpose) | 是  | 本次 LLM 调用用途                                     |
| `sessionId`       | `str`                                     | 是  | 当前会话 ID；同一会话内多次回调拿到相同值，可作缓存 / 埋点键               |
| `agentId`         | `str`                                     | 是  | 发起调用的 Agent 标识                                  |
| `turnIndex`       | `int`                                     | 是  | 当前 turn 序号                                      |
| `availableModels` | [`ModelInfo`](#modelinfo)`[]`             | 是  | 当前账号实时可用的模型列表（CLI 在每次 `get_model_policy` 请求时携带） |

<div id="qodermodelpurpose" />

### `QoderModelPurpose`

```python theme={null}
from typing import Literal

QoderModelPurpose = Literal[
    "main",
    "plan",
    "task",
    "compact",
    "title",
    "suggestion",
    "generate",
    "hook_prompt",
    "subagent",
    "web_fetch",
    "image_gen",
    "compression",
    "utility",
]
```

| 值             | 触发场景                    |
| ------------- | ----------------------- |
| `'main'`      | 主对话 LLM 调用              |
| `'subagent'`  | 子代理（subagent）调用         |
| `'web_fetch'` | WebFetch 工具触发的二次 LLM 调用 |
| `'image_gen'` | ImageGen 工具触发的图像生成调用    |
| `'compact'`   | 上下文压缩 / 摘要              |

<div id="modelpolicyresult" />

### `ModelPolicyResult`

回调返回值。

```python theme={null}
class ModelPolicyResult(TypedDict, total=False):
    model: str | CustomModel
    parameters: dict[str, Any]
```

| 字段           | 类型                                     | 必填 | 说明                                   |
| ------------ | -------------------------------------- | -- | ------------------------------------ |
| `model`      | `str \| `[`CustomModel`](#custommodel) | 是  | 字符串：模型标识；对象：BYOK 凭证 + 模型标识           |
| `parameters` | `dict[str, Any]`                       | 否  | 模型参数覆盖（如 `temperature`、`max_tokens`） |

`model` 形式：

* **字符串** — 后端支持的模型 ID（如 `auto` / `performance` / `glm51`），具体可用值由 [`client.get_available_models()`](#clientget_available_models) 实时返回。**必须非空**，否则 query 失败。
* **`CustomModel` 对象**（BYOK） — SDK 自动提取对象里的 `model` 字段作为本次调用的模型标识，其余字段作为凭证转发给 CLI 路由到第三方 LLM。

<div id="custommodel" />

### `CustomModel`

BYOK 凭证。在 `resolve_model` 回调里把 `model` 字段直接设为该对象，本次 LLM 请求会路由到第三方 provider。

```python theme={null}
class CustomModel(TypedDict, total=False):
    provider: str
    model: str
    api_key: str
    url: str
    style: str  # "openai" | "anthropic"
```

| 字段         | 类型    | 必填 | 说明                                                           |
| ---------- | ----- | -- | ------------------------------------------------------------ |
| `provider` | `str` | 是  | provider 标识，必须匹配 [`BYOKProviderInfo.key`](#byokproviderinfo) |
| `model`    | `str` | 是  | 模型标识，SDK 自动提取为本次调用的模型 ID                                     |
| `api_key`  | `str` | 是  | 用户提供的 API Key                                                |
| `url`      | `str` | 否  | 覆盖默认 base URL                                                |
| `style`    | `str` | 否  | 上游协议风格，如 `"openai"` / `"anthropic"`；默认 `"openai"`            |

注意：

* `provider` 必须命中目录里的 `key`，否则后端鉴权失败。
* `api_key` 错误时鉴权失败让 query 直接失败（动态回调模式不降级）。
* BYOK 调用平台 `total_cost_usd` 计为 0，token 用量按真实值上报，由 provider 侧扣费。

<div id="byok-目录类型" />

<div id="byok目录类型" />

### BYOK 目录类型

[`client.list_byok_providers()`](#clientlist_byok_providers) 返回的 provider/model 目录。

```python theme={null}
class SDKControlGetByokConfigResponse(TypedDict, total=False):
    providers: list[BYOKProviderInfo]


class BYOKProviderInfo(TypedDict, total=False):
    key: str
    display_name: str
    api_key_url: str
    url: str
    fields: list[BYOKFieldInfo]
    types: list[BYOKModelTypeInfo]


class BYOKFieldInfo(TypedDict, total=False):
    key: str
    display_name: str
    type: str  # e.g. "free_input"
    mandatory: bool


class BYOKModelTypeInfo(TypedDict, total=False):
    key: str
    display_name: str
    models: list[BYOKModelInfo]


class BYOKModelInfo(TypedDict, total=False):
    key: str
    display_name: str
    is_vl: bool
    is_reasoning: bool
    format: str
    max_input_tokens: int
```

<div id="byokproviderinfo" />

#### `BYOKProviderInfo`

| 字段             | 类型                        | 说明                                          |
| -------------- | ------------------------- | ------------------------------------------- |
| `key`          | `str`                     | provider 标识，BYOK 时填到 `CustomModel.provider` |
| `display_name` | `str`                     | 展示名                                         |
| `api_key_url`  | `str`                     | 引导用户去申请 API Key 的地址                         |
| `url`          | `str`                     | 推理请求的基础 URL                                 |
| `fields`       | `list[BYOKFieldInfo]`     | provider 要求用户填写的字段列表                        |
| `types`        | `list[BYOKModelTypeInfo]` | 该 provider 下的模型分组                           |

<div id="byokfieldinfo" />

#### `BYOKFieldInfo`

| 字段             | 类型     | 说明                      |
| -------------- | ------ | ----------------------- |
| `key`          | `str`  | 字段标识（如 `api_key`）       |
| `display_name` | `str`  | 用户展示名                   |
| `type`         | `str`  | 字段类型（如 `"free_input"` ） |
| `mandatory`    | `bool` | 是否必填                    |

<div id="byokmodeltypeinfo" />

#### `BYOKModelTypeInfo`

| 字段             | 类型                    | 说明                              |
| -------------- | --------------------- | ------------------------------- |
| `key`          | `str`                 | 分组标识，常见值：`cp` / `tp` / `pg`（可选） |
| `display_name` | `str`                 | 分组展示名                           |
| `models`       | `list[BYOKModelInfo]` | 分组下的模型                          |

<div id="byokmodelinfo" />

#### `BYOKModelInfo`

| 字段                 | 类型     | 说明                           |
| ------------------ | ------ | ---------------------------- |
| `key`              | `str`  | 模型 ID，填到 `CustomModel.model` |
| `display_name`     | `str`  | 展示名                          |
| `is_vl`            | `bool` | 是否支持视觉 / 多模态输入               |
| `is_reasoning`     | `bool` | 是否推理型模型                      |
| `format`           | `str`  | 上游协议格式（如 `openai`）           |
| `max_input_tokens` | `int`  | 最大输入 token                   |

<div id="modelinfo" />

### `ModelInfo`

[`client.get_available_models()`](#clientget_available_models) 返回的可用模型摘要，也作为 [`ModelPolicyContext.availableModels`](#modelpolicycontext) 的元素类型。

```python theme={null}
class ModelInfo(TypedDict, total=False):
    value: str
    displayName: str
    isEnabled: bool
```

| 字段            | 类型                  | 说明                                                                                                  |
| ------------- | ------------------- | --------------------------------------------------------------------------------------------------- |
| `value`       | `str`               | 模型标识，可用于 [`ModelPolicyResult.model`](#modelpolicyresult) 或 [`client.set_model()`](#clientset_model) |
| `displayName` | `str`               | 展示名                                                                                                 |
| `isEnabled`   | `bool \| undefined` | 是否当前可用；省略视为可用                                                                                       |

<div id="modelpolicytimeouterror" />

### `ModelPolicyTimeoutError`

```python theme={null}
class ModelPolicyTimeoutError(Exception): ...
```

`resolve_model` 回调超过 `options.resolve_model_timeout_ms` 仍未返回时由 SDK 抛出，query 直接失败，不降级。

<div id="clientset_model" />

<div id="client-set_model" />

### `client.set_model()`

```python theme={null}
async def set_model(self, model: str | None = None) -> None: ...
```

运行中切换固定模型模式下的模型，下一次 LLM 调用生效。仅在固定模型模式下生效；动态回调模式下调用不会覆盖回调结果。可用模型 ID 见 [`ModelInfo.value`](#modelinfo)。

<div id="clientget_available_models" />

<div id="client-get_available_models" />

### `client.get_available_models()`

```python theme={null}
async def get_available_models(self) -> list[ModelInfo]: ...
```

实时拉取当前账号可用的模型列表。返回最新结果，不缓存；暂时无法获取时返回空列表，不抛异常。动态回调模式下 [`ModelPolicyContext.availableModels`](#modelpolicycontext) 已实时携带相同列表，无需额外调用。

<div id="clientlist_byok_providers" />

<div id="client-list_byok_providers" />

### `client.list_byok_providers()`

```python theme={null}
async def list_byok_providers(self) -> list[BYOKProviderInfo] | None: ...
```

返回当前账号可用的 BYOK provider/model 目录数组：

* 返回 `None`：CLI 不支持该接口（兼容降级，不抛异常）。
* 返回数组（可能为空）：当前账号可用的 provider 列表（空数组表示账号未开通 BYOK）。

字段语义见 [BYOK 目录类型](#byok-目录类型)。

<div id="canusetool" />

### `CanUseTool`

宿主自定义的工具权限审批回调。

```python theme={null}
from collections.abc import Awaitable, Callable
from typing import Any


CanUseTool = Callable[
    [str, dict[str, Any], ToolPermissionContext],
    Awaitable[PermissionResult],
]
```

<div id="toolpermissioncontext" />

#### `ToolPermissionContext`

```python theme={null}
import asyncio
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ToolPermissionContext:
    signal: asyncio.Event | None = None
    suggestions: list[Any] = field(default_factory=list)
    blocked_path: str | None = None
    decision_reason: str | None = None
    decision_reason_type: str | None = None
    classifier_approvable: bool | None = None
    title: str | None = None
    display_name: str | None = None
    description: str | None = None
    tool_use_id: str | None = None
    agent_id: str | None = None
    exit_plan_mode: ExitPlanModeApprovalDetails | None = None
```

| 字段                                       | 类型                                    | 说明                 |
| :--------------------------------------- | :------------------------------------ | :----------------- |
| `signal`                                 | `asyncio.Event \| None`               | 取消时被设置             |
| `suggestions`                            | `list[Any]`                           | CLI 给出的权限更新建议      |
| `blocked_path`                           | `str \| None`                         | 触发授权的文件路径（仅文件相关场景） |
| `decision_reason`                        | `str \| None`                         | CLI 提供的人类可读授权原因    |
| `decision_reason_type`                   | `str \| None`                         | 权限原因分类             |
| `classifier_approvable`                  | `bool \| None`                        | 当前调用是否可由运行时分类器自动批准 |
| `title` / `display_name` / `description` | `str \| None`                         | 运行时生成的人类可读授权文案     |
| `tool_use_id`                            | `str \| None`                         | 本次工具调用 ID          |
| `agent_id`                               | `str \| None`                         | 发起调用的子 Agent ID    |
| `exit_plan_mode`                         | `ExitPlanModeApprovalDetails \| None` | 退出计划模式时的审批详情       |

完整使用与例子见 [权限控制](/zh/cli/sdk/python/permissions#canusetool)。

<div id="permissionmode" />

### `PermissionMode`

```python theme={null}
PermissionMode = Literal[
    "default",
    "acceptEdits",
    "bypassPermissions",
    "yolo",
    "plan",
    "dontAsk",
    "auto",
]
```

| 值                     | 语义                                                                            | 适合场景                |
| :-------------------- | :---------------------------------------------------------------------------- | :------------------ |
| `"default"`           | 标准权限行为。工具调用按 `tools`、allow / deny 规则、动态审批或运行时策略处理                             | 大多数交互式会话            |
| `"acceptEdits"`       | 自动接受文件编辑类操作；其他敏感操作仍按权限流程处理                                                    | 已确认可以修改工作区的会话       |
| `"bypassPermissions"` | 跳过权限检查；必须同时设置 `allow_dangerously_skip_permissions=True`                       | 受信任的自动化或测试环境        |
| `"yolo"`              | `"bypassPermissions"` 的兼容别名；也必须同时设置 `allow_dangerously_skip_permissions=True` | 兼容旧配置，不建议新代码优先使用    |
| `"plan"`              | 计划模式，适合先产出执行计划，默认不执行实际变更                                                      | 规划、设计、审查            |
| `"dontAsk"`           | 不进行交互询问；未预授权、未被规则允许的操作会被拒绝                                                    | 无交互运行环境，或希望失败也不要弹确认 |
| `"auto"`              | 由运行时能力自动判断 allow 或 deny；安全的工作区内文件编辑可能自动放行                                     | 希望减少确认打断，同时保留运行时判断  |

更多权限链路说明见 [权限控制](/zh/cli/sdk/python/permissions)。

<div id="permissionresult" />

### `PermissionResult`

`CanUseTool` 的返回值。

```python theme={null}
from dataclasses import dataclass
from typing import Any, Literal


@dataclass
class PermissionResultAllow:
    behavior: Literal["allow"] = "allow"
    updated_input: dict[str, Any] | None = None
    updated_permissions: list[PermissionUpdate | dict[str, Any]] | None = None
    decision_classification: PermissionDecisionClassification | None = None


@dataclass
class PermissionResultDeny:
    behavior: Literal["deny"] = "deny"
    message: str = ""
    interrupt: bool = False
    decision_classification: PermissionDecisionClassification | None = None


PermissionResult = PermissionResultAllow | PermissionResultDeny
```

`allow.updated_input` 修改后会替换工具实际收到的入参。`deny.interrupt=True` 拒绝同时中断 Agent。

`can_use_tool` 收到的 `tool_name` 是完整工具名，例如 `"Bash"`、`"Read"`、`"mcp__orders__lookup_order"`。

<div id="mcpserverconfig" />

### `McpServerConfig`

MCP 服务器配置，传给 `QoderAgentOptions.mcp_servers`。

```python theme={null}
McpServerConfig = (
    McpStdioServerConfig
    | McpSSEServerConfig
    | McpHttpServerConfig
    | McpSdkServerConfig
)
```

<div id="mcpstdioserverconfig" />

#### `McpStdioServerConfig`

```python theme={null}
class McpStdioServerConfig(TypedDict):
    type: NotRequired[Literal["stdio"]]
    command: str
    args: NotRequired[list[str]]
    env: NotRequired[dict[str, str]]
    tools: NotRequired[list[McpServerToolPolicy]]
```

<div id="mcpsseserverconfig" />

#### `McpSSEServerConfig`

```python theme={null}
class McpSSEServerConfig(TypedDict):
    type: Literal["sse"]
    url: str
    headers: NotRequired[dict[str, str]]
    tools: NotRequired[list[McpServerToolPolicy]]
```

<div id="mcphttpserverconfig" />

#### `McpHttpServerConfig`

```python theme={null}
class McpHttpServerConfig(TypedDict):
    type: Literal["http"]
    url: str
    headers: NotRequired[dict[str, str]]
    tools: NotRequired[list[McpServerToolPolicy]]
```

<div id="mcpsdkserverconfig" />

#### `McpSdkServerConfig`

```python theme={null}
class McpSdkServerConfig(TypedDict):
    type: Literal["sdk"]
    name: str
    instance: McpServer
    tools: NotRequired[list[McpServerToolPolicy]]
```

由 `create_sdk_mcp_server()` 工厂返回，见 [MCP - In-Process Server](/zh/cli/sdk/python/mcp#in-process-server推荐)。

<div id="mcpservertoolpolicy" />

#### `McpServerToolPolicy`

```python theme={null}
class McpServerToolPolicy(TypedDict):
    name: str
    permission_policy: Literal["always_allow", "always_ask", "always_deny"]
```

<div id="sdkpluginconfig" />

### `SdkPluginConfig`

加载本地插件。

```python theme={null}
class SdkPluginConfig(TypedDict):
    type: Literal["local"]
    path: str
```

| 字段     | 类型        | 说明             |
| :----- | :-------- | :------------- |
| `type` | `"local"` | 当前仅支持 local    |
| `path` | `str`     | 插件目录的绝对路径或相对路径 |

<div id="settingsource" />

### `SettingSource`

控制加载哪些 filesystem settings。

```python theme={null}
SettingSource = Literal["user", "project", "local"]
```

| 值           | 含义                       | 位置                           |
| :---------- | :----------------------- | :--------------------------- |
| `"user"`    | 用户级全局 settings           | `~/.qoder/settings.json`     |
| `"project"` | 项目共享 settings（版本控制）      | `.qoder/settings.json`       |
| `"local"`   | 项目本地 settings（gitignore） | `.qoder/settings.local.json` |

省略时按 CLI 默认加载所有源；传 `[]` 完全跳过。

<div id="tools-reference" />

<div id="toolsreference" />

## Tools Reference

本页汇总工具相关的稳定 API、内置工具列表和类型定义。使用路径和场景说明见 [工具使用指南](/zh/cli/sdk/python/tools)。

> 说明：Python SDK 当前没有导出 TypeScript SDK 里的内置工具输入 / 输出类型集合，例如 `BashInput`、`FileReadInput`、`ToolInputSchemas`。本页会在对应章节明确标注实现状态。

<div id="toolconfig" />

### `ToolConfig`

TypeScript SDK 提供 `options.toolConfig` 用于配置部分内置工具行为：

```typescript theme={null}
type ToolConfig = {
  askUserQuestion?: {
    previewFormat?: "markdown" | "html";
  };
};
```

Python SDK 当前没有导出等价的 `QoderAgentOptions.tool_config` 字段；`AskUserQuestion` 仍可作为运行时工具名用于 `tools`、`allowed_tools`、`disallowed_tools`、`can_use_tool` 和 hooks matcher。

<div id="内置工具列表" />

<div id="built-in-tool-list" />

### 内置工具列表

在 `tools`、`allowed_tools`、`disallowed_tools`、`can_use_tool`、hooks matcher 和 Agent 工具白名单里，内置工具使用下表中的运行时工具名。

| 分类            | 工具名                | 说明               | Python SDK 状态    |
| ------------- | ------------------ | ---------------- | ---------------- |
| 命令执行          | `Bash`             | 执行 shell 命令      | 可在权限 / 工具范围配置中使用 |
| 文件操作          | `Read`             | 读取文件内容           | 可在权限 / 工具范围配置中使用 |
| 文件操作          | `Edit`             | 基于字符串匹配编辑文件      | 可在权限 / 工具范围配置中使用 |
| 文件操作          | `Write`            | 创建或覆写文件          | 可在权限 / 工具范围配置中使用 |
| 搜索            | `Glob`             | 按文件名模式搜索         | 可在权限 / 工具范围配置中使用 |
| 搜索            | `Grep`             | 按内容正则搜索          | 可在权限 / 工具范围配置中使用 |
| 网络            | `WebFetch`         | 获取 URL 内容并处理     | 可在权限 / 工具范围配置中使用 |
| 网络            | `WebSearch`        | 网络搜索             | 可在权限 / 工具范围配置中使用 |
| Agent         | `Agent`            | 调用子 Agent        | 可在权限 / 工具范围配置中使用 |
| 交互            | `AskUserQuestion`  | 向用户提问            | 可在权限 / 工具范围配置中使用 |
| Notebook      | `NotebookEdit`     | 编辑 Notebook 单元格  | 可在权限 / 工具范围配置中使用 |
| 后台任务          | `TaskOutput`       | 向后台任务发送输出        | 可在权限 / 工具范围配置中使用 |
| 后台任务          | `TaskStop`         | 停止后台任务           | 可在权限 / 工具范围配置中使用 |
| 计划 / worktree | `ExitPlanMode`     | 退出计划模式           | 可在权限 / 工具范围配置中使用 |
| 计划 / worktree | `EnterWorktree`    | 进入 git worktree  | 可在权限 / 工具范围配置中使用 |
| 计划 / worktree | `ExitWorktree`     | 退出 worktree      | 可在权限 / 工具范围配置中使用 |
| 配置            | `Config`           | 读写配置             | 可在权限 / 工具范围配置中使用 |
| 待办            | `TodoWrite`        | 管理待办事项           | 可在权限 / 工具范围配置中使用 |
| MCP 资源        | `ListMcpResources` | 列出 MCP resources | 可在权限 / 工具范围配置中使用 |
| MCP 资源        | `ReadMcpResource`  | 读取 MCP resource  | 可在权限 / 工具范围配置中使用 |
| MCP 调用        | `Mcp`              | 通用 MCP 工具调用      | 可在权限 / 工具范围配置中使用 |

自定义 MCP 工具名格式：

```text theme={null}
mcp__{serverName}__{toolName}
```

<div id="tool" />

### `tool()`

创建一个 SDK MCP 工具定义。Python 版是装饰器风格，handler 通过 `@tool(...)` 包装。

```python theme={null}
from collections.abc import Awaitable, Callable
from typing import Any

from mcp.types import ToolAnnotations


def tool(
    name: str,
    description: str,
    input_schema: type | dict[str, Any],
    annotations: ToolAnnotations | None = None,
) -> Callable[[Callable[..., Awaitable[dict[str, Any]]]], SdkMcpTool[Any]]:
    ...
```

| 参数             | 类型                        | 是否必填 | 语义                          | 当前 Qoder 行为                                                        |
| -------------- | ------------------------- | ---- | --------------------------- | ------------------------------------------------------------------ |
| `name`         | `str`                     | 是    | 工具在当前 MCP server 内的唯一标识     | 会组成模型可见的完整工具名 `mcp__{serverName}__{name}`；注册时要求非空                  |
| `description`  | `str`                     | 是    | 给模型看的工具说明，描述工具何时使用、做什么、返回什么 | 会透传到工具列表，直接影响模型是否正确调用；注册时要求非空                                      |
| `input_schema` | `type \| dict[str, Any]`  | 是    | 定义工具输入参数                    | SDK 会生成 MCP input schema；支持简单 dict、`TypedDict`、完整 JSON Schema dict |
| `annotations`  | `ToolAnnotations \| None` | 否    | 工具额外元信息                     | SDK 会把 annotations 注册到 MCP server；不会替代权限配置                         |

`tool()` 本身只定义工具；被装饰的 async handler 是工具被调用时执行的函数。`name`、`description` 和重复工具名等注册约束由 `create_sdk_mcp_server()` 在注册工具时校验。

<div id="input_schema" />

#### `input_schema`

Python SDK 没有 TypeScript SDK 的 `AnyZodRawShape` / `InferShape`。Python 版 `input_schema` 支持以下形式：

```python theme={null}
# 简单 dict：所有字段 required
{"query": str, "limit": int}

# 使用 Annotated 增加字段描述
{"query": Annotated[str, "Search keywords"]}

# TypedDict：支持 NotRequired
class SearchInput(TypedDict):
    query: str
    limit: NotRequired[int]

# 完整 JSON Schema dict
{
    "type": "object",
    "properties": {
        "query": {"type": "string"},
        "source": {"type": "string", "enum": ["docs", "wiki"]},
    },
    "required": ["query"],
}
```

常见 Python 类型转换：

| Python 写法             | JSON Schema 语义                                |
| --------------------- | --------------------------------------------- |
| `str`                 | `{"type": "string"}`                          |
| `int`                 | `{"type": "integer"}`                         |
| `float`               | `{"type": "number"}`                          |
| `bool`                | `{"type": "boolean"}`                         |
| `list[T]`             | array，带 `items`                               |
| `dict`                | object                                        |
| `Annotated[T, "..."]` | 在 `T` 的 schema 上增加 `description`              |
| `TypedDict`           | object，按 required / NotRequired 生成 `required` |

<div id="typescript-only-schema-helper-types" />

<div id="typescriptonlyschemahelpertypes" />

#### TypeScript-only schema helper types

| TypeScript reference 类型 | Python SDK 状态 | Python 等价能力                                            |
| ----------------------- | ------------- | ------------------------------------------------------ |
| `AnyZodRawShape`        | 未实现 / 未导出     | 使用 `dict[str, type]`、`TypedDict` 或完整 JSON Schema dict  |
| `InferShape`            | 未实现 / 未导出     | handler 接收 `args` dict；如需静态类型，可在业务代码里声明自己的 `TypedDict` |
| `ToolExtras`            | 未实现 / 未导出     | Python 直接把 `annotations` 作为 `@tool()` 的第 4 个参数         |

<div id="sdkmcptool" />

#### `SdkMcpTool`

```python theme={null}
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Generic, TypeVar

from mcp.types import ToolAnnotations


T = TypeVar("T")


@dataclass
class SdkMcpTool(Generic[T]):
    name: str
    description: str
    input_schema: type[T] | dict[str, Any]
    handler: Callable[..., Awaitable[dict[str, Any]]]
    annotations: ToolAnnotations | None = None
```

`@tool()` 装饰器返回 `SdkMcpTool`。通常不需要手动构造它。

<div id="toolinvocationcontext" />

#### `ToolInvocationContext`

```python theme={null}
import asyncio
from dataclasses import dataclass, field


@dataclass
class ToolInvocationContext:
    signal: asyncio.Event = field(default_factory=asyncio.Event)
```

handler 可以是单参数或双参数：

```python theme={null}
@tool("watch", "Watch a counter.", {"max": int})
async def watch(args, extra: ToolInvocationContext):
    ...
```

当 handler 接收第二个位置参数时，SDK 会传入 `ToolInvocationContext`。`extra.signal` 会在 CLI 取消正在执行的工具调用时被设置。

<div id="toolannotations" />

#### `ToolAnnotations`

Python 版直接使用 `mcp.types.ToolAnnotations`。

```python theme={null}
from mcp.types import ToolAnnotations


ToolAnnotations(
    title="Search docs",
    readOnlyHint=True,
    destructiveHint=False,
    idempotentHint=True,
    openWorldHint=False,
    maxResultSizeChars=500_000,
)
```

| 字段                   | 类型     | 可选 | 语义              | 当前 Qoder 行为                                                                                |
| -------------------- | ------ | -- | --------------- | ------------------------------------------------------------------------------------------ |
| `title`              | `str`  | 是  | 工具的人类可读标题       | MCP 元信息；当前不作为已验证的 Qoder 行为能力说明                                                             |
| `readOnlyHint`       | `bool` | 是  | 标记工具不修改状态       | 当前可观察作用是让只读工具在同一批 tool calls 中具备并发执行条件；不是权限开关                                              |
| `destructiveHint`    | `bool` | 是  | 标记工具可能执行破坏性更新   | 风险元信息；当前不自动阻止已授权工具执行                                                                       |
| `openWorldHint`      | `bool` | 是  | 标记工具是否与外部开放世界交互 | 外部交互元信息；当前不自动阻止已授权工具执行                                                                     |
| `maxResultSizeChars` | `int`  | 是  | 标记工具结果大小上限      | Python SDK 会写入 `_meta["anthropic/maxResultSizeChars"]`，供 CLI 读取；这是 Python 当前使用的 MCP 类型扩展字段 |

这些字段是元信息和调度提示，不是权限开关。是否允许执行仍由 `tools`、`allowed_tools`、`disallowed_tools`、`permission_mode`、`can_use_tool` 和 hooks 决定。

<div id="create_sdk_mcp_server" />

### `create_sdk_mcp_server()`

创建一个与 SDK 同进程运行的 MCP server。

```python theme={null}
from typing import Any


def create_sdk_mcp_server(
    name: str,
    version: str = "1.0.0",
    tools: list[SdkMcpTool[Any]] | None = None,
) -> McpSdkServerConfig:
    ...
```

| 参数        | 默认值       | 说明                                               |
| --------- | --------- | ------------------------------------------------ |
| `name`    | 必填        | MCP server 名，会进入 `mcp__{serverName}__{toolName}` |
| `version` | `"1.0.0"` | server 版本信息                                      |
| `tools`   | `None`    | 注册到该 server 的工具列表                                |

<div id="createsdkmcpserveroptions" />

#### `CreateSdkMcpServerOptions`

TypeScript SDK 使用 `CreateSdkMcpServerOptions` 对象参数；Python SDK 未导出这个类型，也不使用 options 对象。Python 等价能力就是 `create_sdk_mcp_server(name, version="1.0.0", tools=None)` 的三个函数参数。

<div id="create_sdk_mcp_server-return-value" />

<div id="createsdkmcpserver-return-value" />

#### 返回值

返回 `McpSdkServerConfig`，可直接作为 `QoderAgentOptions.mcp_servers` 的值。

```python theme={null}
from typing import Literal, TypedDict

from typing_extensions import NotRequired


class McpSdkServerConfig(TypedDict):
    type: Literal["sdk"]
    name: str
    instance: McpServer
    tools: NotRequired[list[McpServerToolPolicy]]
```

#### `McpServerToolPolicy`

```python theme={null}
class McpServerToolPolicy(TypedDict):
    name: str
    permission_policy: Literal["always_allow", "always_ask", "always_deny"]
```

`tools` policy 字段存在于 Python 类型中。它主要用于 MCP server 配置层的工具权限策略；进程内 SDK server 的常见接入仍是通过 `allowed_tools`、`disallowed_tools`、`permission_mode`、`can_use_tool` 和 hooks 控制。

<div id="calltoolresult" />

### `CallToolResult`

Python SDK 不导出自己的 `CallToolResult` 类型。handler 返回 dict，SDK 将其转换为 MCP 的 `CallToolResult`。

```python theme={null}
from typing import Literal, TypedDict

from typing_extensions import NotRequired


class TextToolContent(TypedDict):
    type: Literal["text"]
    text: str


class ImageToolContent(TypedDict):
    type: Literal["image"]
    data: str
    mimeType: str


class ResourceLinkToolContent(TypedDict):
    type: Literal["resource_link"]
    uri: str
    name: NotRequired[str]
    description: NotRequired[str]
    mimeType: NotRequired[str]


class EmbeddedResourceValue(TypedDict, total=False):
    uri: str
    mimeType: str
    text: str
    blob: str


class EmbeddedResourceToolContent(TypedDict):
    type: Literal["resource"]
    resource: EmbeddedResourceValue


ToolContent = (
    TextToolContent
    | ImageToolContent
    | ResourceLinkToolContent
    | EmbeddedResourceToolContent
)


class ToolHandlerResult(TypedDict):
    content: list[ToolContent]
    is_error: NotRequired[bool]
```

<div id="mcptoolresultcontent" />

#### `McpToolResultContent`

Python SDK 当前识别以下 content block：

| 类型      | Python handler dict                                                            | 当前 Qoder 行为                                         |
| ------- | ------------------------------------------------------------------------------ | --------------------------------------------------- |
| 文本      | `{"type": "text", "text": "..."}`                                              | 转换为 `TextContent`                                   |
| 图片      | `{"type": "image", "data": "...", "mimeType": "image/png"}`                    | 转换为 `ImageContent`                                  |
| 资源链接    | `{"type": "resource_link", "uri": "...", "name": "...", "description": "..."}` | 降级为 `TextContent`，拼接 `name` / `uri` / `description` |
| 内嵌文本资源  | `{"type": "resource", "resource": {"text": "..."}}`                            | 转换为 `TextContent`                                   |
| 内嵌二进制资源 | `{"type": "resource", "resource": {"blob": "..."}}`                            | 当前 skip，并记录 warning                                 |

与 TS reference 的差异：

* Python handler 使用 `is_error`，不是 MCP/TypeScript 的 `isError` 字段名；SDK 内部会映射为 MCP `isError`。
* Python handler 顶层 `_meta` 当前不会透传到 `CallToolResult`。
* Python `call_tool` 转换逻辑当前没有处理 `audio` content block；即使 MCP 类型导入了 `AudioContent`，handler 返回 `{"type": "audio"}` 也会进入 unsupported content warning 分支。

<div id="can_use_tool" />

### `can_use_tool`

工具权限审批回调定义在通用类型中，放在这里便于查找。

```python theme={null}
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, Literal


@dataclass
class ToolPermissionContext:
    signal: asyncio.Event | None = None
    suggestions: list[Any] = field(default_factory=list)
    blocked_path: str | None = None
    decision_reason: str | None = None
    decision_reason_type: str | None = None
    classifier_approvable: bool | None = None
    title: str | None = None
    display_name: str | None = None
    description: str | None = None
    tool_use_id: str | None = None
    agent_id: str | None = None
    exit_plan_mode: ExitPlanModeApprovalDetails | None = None


CanUseTool = Callable[
    [str, dict[str, Any], ToolPermissionContext],
    Awaitable[PermissionResult],
]
```

#### `PermissionResult`

```python theme={null}
@dataclass
class PermissionResultAllow:
    behavior: Literal["allow"] = "allow"
    updated_input: dict[str, Any] | None = None
    updated_permissions: list[PermissionUpdate | dict[str, Any]] | None = None
    decision_classification: PermissionDecisionClassification | None = None


@dataclass
class PermissionResultDeny:
    behavior: Literal["deny"] = "deny"
    message: str = ""
    interrupt: bool = False
    decision_classification: PermissionDecisionClassification | None = None


PermissionResult = PermissionResultAllow | PermissionResultDeny
```

`can_use_tool` 收到的 `tool_name` 是完整工具名，例如 `Bash`、`Read`、`mcp__orders__lookup_order`。

<div id="mcp-status-工具信息" />

<div id="mcpstatus工具信息" />

### MCP status 工具信息

Python SDK 导出 `McpToolInfo` 和 `McpToolAnnotations`，用于描述 `QoderSDKClient.get_mcp_status()` 返回的 server 工具信息。

```python theme={null}
from typing import TypedDict

from typing_extensions import NotRequired


class McpToolAnnotations(TypedDict, total=False):
    readOnly: bool
    destructive: bool
    openWorld: bool


class McpToolInfo(TypedDict):
    name: str
    description: NotRequired[str]
    annotations: NotRequired[McpToolAnnotations]
```

注意：status 中的 annotation 字段名是 CLI 投影后的 `readOnly`、`destructive`、`openWorld`，不是 `ToolAnnotations` 入参中的 `readOnlyHint`、`destructiveHint`、`openWorldHint`。`idempotentHint` 当前不在 status 工具列表里回显。

<div id="内置工具输入输出类型" />

<div id="built-in-tool-input-output-types" />

<div id="built-in-tool-inputoutput-types" />

<div id="built-in-tool-input-and-output-types" />

### 内置工具输入输出类型

TypeScript SDK 在类型层提供内置工具的输入 / 输出结构。Python SDK 当前没有导出这些 TypedDict，也没有导出 `ToolInputSchemas` / `ToolOutputSchemas` 联合类型。注意：下表中的类型名是 TypeScript reference 类型名；Python 权限配置和工具白名单里仍使用 [内置工具列表](#内置工具列表) 中的运行时工具名。

| TypeScript 类型                                      | Python SDK 状态        |
| -------------------------------------------------- | -------------------- |
| `AgentInput` / `AgentOutput`                       | 未导出                  |
| `BashInput` / `BashOutput`                         | 未导出                  |
| `FileReadInput` / `FileReadOutput`                 | 未导出；运行时工具名仍是 `Read`  |
| `FileEditInput` / `FileEditOutput`                 | 未导出；运行时工具名仍是 `Edit`  |
| `FileWriteInput` / `FileWriteOutput`               | 未导出；运行时工具名仍是 `Write` |
| `GlobInput` / `GlobOutput`                         | 未导出                  |
| `GrepInput` / `GrepOutput`                         | 未导出                  |
| `WebFetchInput` / `WebFetchOutput`                 | 未导出                  |
| `WebSearchInput` / `WebSearchOutput`               | 未导出                  |
| `AskUserQuestionInput` / `AskUserQuestionOutput`   | 未导出                  |
| `NotebookEditInput` / `NotebookEditOutput`         | 未导出                  |
| `TaskOutputInput`                                  | 未导出                  |
| `TaskStopInput` / `TaskStopOutput`                 | 未导出                  |
| `ExitPlanModeInput` / `ExitPlanModeOutput`         | 未导出                  |
| `ConfigInput` / `ConfigOutput`                     | 未导出                  |
| `EnterWorktreeInput` / `EnterWorktreeOutput`       | 未导出                  |
| `ExitWorktreeInput` / `ExitWorktreeOutput`         | 未导出                  |
| `TodoWriteInput` / `TodoWriteOutput`               | 未导出                  |
| `ListMcpResourcesInput` / `ListMcpResourcesOutput` | 未导出                  |
| `ReadMcpResourceInput`                             | 未导出                  |
| `McpInput` / `McpOutput`                           | 未导出                  |
| `ToolInputSchemas`                                 | 未导出                  |
| `ToolOutputSchemas`                                | 未导出                  |

Python 侧公开、稳定可配置的是 [内置工具列表](#内置工具列表) 中的运行时工具名。如果需要在 Python 应用里强类型化内置工具参数，建议在业务侧自定义自己的 `TypedDict` 或 dataclass。

### 相关文档

* [工具使用指南](/zh/cli/sdk/python/tools)
* [MCP 集成](/zh/cli/sdk/python/mcp)
* [权限控制](/zh/cli/sdk/python/permissions)
* [Hooks](/zh/cli/sdk/python/hooks)
* [子 Agent 使用指南](/zh/cli/sdk/python/agents)

<div id="hooks-reference" />

<div id="hooksreference" />

## Hooks Reference

使用指南和示例见 [Hooks](/zh/cli/sdk/python/hooks)。

<div id="事件概览" />

### 事件概览

| 事件                   | 触发时机          | 可控行为              |
| -------------------- | ------------- | ----------------- |
| `PreToolUse`         | 工具调用前         | 拦截 / 放行 / 修改输入    |
| `PostToolUse`        | 工具执行成功后       | 审计 / 注入上下文 / 覆盖输出 |
| `PostToolUseFailure` | 工具执行失败后       | 错误处理 / 日志记录       |
| `UserPromptSubmit`   | 用户 prompt 发送前 | 注入上下文 / 拦截        |
| `SessionStart`       | 会话开始时         | 初始化 / 注入上下文       |
| `SessionEnd`         | 会话结束时         | 清理 / 日志记录         |
| `Stop`               | AI 停止生成时      | 阻止停止，强制继续         |
| `SubagentStart`      | 子 Agent 启动时   | 观察 / 日志记录         |
| `SubagentStop`       | 子 Agent 停止时   | 观察 / 日志记录         |
| `PreCompact`         | 上下文压缩前        | 观察 / 日志记录         |
| `PostCompact`        | 上下文压缩后        | 观察 / 日志记录         |
| `CwdChanged`         | 工作目录变更时       | 观察 / 日志记录         |
| `InstructionsLoaded` | 指令文件加载时       | 观察 / 日志记录         |
| `FileChanged`        | 文件创建/修改/删除时   | 观察 / 日志记录         |
| `PermissionRequest`  | 权限申请时         | 自动批准 / 拒绝权限请求     |

<div id="hookevent" />

### `HookEvent`

可注册的 hook 事件联合类型。

```python theme={null}
HookEvent = Literal[
    "PreToolUse",
    "PostToolUse",
    "PostToolUseFailure",
    "UserPromptSubmit",
    "SessionStart",
    "SessionEnd",
    "Stop",
    "SubagentStart",
    "SubagentStop",
    "PreCompact",
    "PostCompact",
    "CwdChanged",
    "InstructionsLoaded",
    "FileChanged",
    "PermissionRequest",
]
```

<div id="hookcallback" />

### `HookCallback`

```python theme={null}
HookCallback = Callable[
    [HookInput, str | None, HookCallbackOptions],
    Awaitable[HookJSONOutput],
]
```

<div id="hookmatcher" />

### `HookMatcher`

```python theme={null}
@dataclass
class HookMatcher:
    hooks: list[HookCallback]
    matcher: str | None = None
    timeout: int | None = None  # 秒，默认 60
```

| 字段        | 类型                   | 说明                    |
| :-------- | :------------------- | :-------------------- |
| `hooks`   | `list[HookCallback]` | 匹配时执行的回调列表            |
| `matcher` | `str \| None`        | 可选正则，按 `tool_name` 过滤 |
| `timeout` | `int \| None`        | 可选，超时时间（秒），默认 60      |

<div id="basehookinput" />

### `BaseHookInput`

所有 hook 事件的通用输入字段。

```python theme={null}
@dataclass
class BaseHookInput:
    hook_event_name: str
    session_id: str
    transcript_path: str
    cwd: str
```

| 字段                | 类型    | 说明                        |
| :---------------- | :---- | :------------------------ |
| `hook_event_name` | `str` | 事件类型标识符（如 `"PreToolUse"`） |
| `session_id`      | `str` | 当前会话的唯一标识符                |
| `transcript_path` | `str` | 会话记录文件路径（JSONL 格式）        |
| `cwd`             | `str` | 会话的当前工作目录                 |

<div id="hookjsonoutput" />

### `HookJSONOutput`

Hook 回调的返回类型。

```python theme={null}
@dataclass
class HookJSONOutput:
    continue_: bool | None = None       # JSON 键名为 "continue"
    stop_reason: str | None = None      # JSON 键名为 "stopReason"
    decision: str | None = None
    reason: str | None = None
    hook_specific_output: dict | None = None  # JSON 键名为 "hookSpecificOutput"
```

| 字段                     | 类型             | 默认值               | 说明                                                                                                              |
| :--------------------- | :------------- | :---------------- | :-------------------------------------------------------------------------------------------------------------- |
| `continue_`            | `bool \| None` | `None`（等效 `True`） | 设为 `False` 可终止会话。仅对 `PreToolUse`、`PostToolUse`、`PostToolUseFailure`、`UserPromptSubmit`、`Stop`、`SubagentStop` 有效 |
| `stop_reason`          | `str \| None`  | `None`            | 停止会话的可读原因（与 `continue_=False` 配合）                                                                               |
| `decision`             | `str \| None`  | `None`            | `"approve"` 或 `"block"`。`"block"` 阻止工具执行；对 `Stop` 事件，`"block"` 阻止停止并强制继续                                        |
| `reason`               | `str \| None`  | `None`            | 决策原因（展示给模型；`Stop` 事件的 `"block"` 决策时作为续接提示注入上下文）                                                                 |
| `hook_specific_output` | `dict \| None` | `None`            | 事件专属输出（见各事件类型）                                                                                                  |

> Python SDK 中 `continue_` 对应 JSON 的 `"continue"` 键（避免关键字冲突）。
> 当多个 hook 返回冲突的 `decision` 值时，`"deny"` / `"block"` 优先（最严格规则生效）。

<div id="pretoolusehookinput" />

### `PreToolUseHookInput`

```python theme={null}
@dataclass
class PreToolUseHookInput(BaseHookInput):
    hook_event_name: Literal["PreToolUse"]
    permission_mode: str | None
    tool_name: str
    tool_input: Any
```

| 字段                | 类型            | 说明       |
| :---------------- | :------------ | :------- |
| `permission_mode` | `str \| None` | 会话当前权限模式 |
| `tool_name`       | `str`         | 被调用工具名称  |
| `tool_input`      | `Any`         | 传入工具的参数  |

**`hook_specific_output`（`hookSpecificOutput`）：**

| 字段                         | 类型             | 说明                                         |
| :------------------------- | :------------- | :----------------------------------------- |
| `hookEventName`            | `"PreToolUse"` | 必须设置                                       |
| `permissionDecision`       | `str`          | `"allow"` / `"deny"` / `"ask"` / `"defer"` |
| `permissionDecisionReason` | `str`          | 权限决策原因                                     |
| `updatedInput`             | `dict`         | 修改后的工具输入，替换原始 `tool_input`                 |
| `additionalContext`        | `str`          | 注入到模型下一轮的额外上下文                             |

<div id="posttoolusehookinput" />

### `PostToolUseHookInput`

```python theme={null}
@dataclass
class PostToolUseHookInput(BaseHookInput):
    hook_event_name: Literal["PostToolUse"]
    tool_name: str
    tool_input: Any
    tool_response: Any
```

| 字段              | 类型    | 说明      |
| :-------------- | :---- | :------ |
| `tool_name`     | `str` | 被调用工具名称 |
| `tool_input`    | `Any` | 传入工具的参数 |
| `tool_response` | `Any` | 工具的执行结果 |

**输出行为：**

| 字段                                     | 位置     | 行为                                 |
| :------------------------------------- | :----- | :--------------------------------- |
| `hookSpecificOutput.updatedToolOutput` | 事件专属输出 | **覆盖** `tool_response`；模型只能看到覆盖后的值 |
| `hookSpecificOutput.additionalContext` | 事件专属输出 | **追加**补充上下文，不修改原始结果                |
| `decision: "block"` + `reason`         | 顶层输出   | 阻止 agent 进一步处理该工具结果                |

**`hook_specific_output`（`hookSpecificOutput`）：**

| 字段                  | 类型              | 说明             |
| :------------------ | :-------------- | :------------- |
| `hookEventName`     | `"PostToolUse"` | 必须设置           |
| `updatedToolOutput` | `str`           | 覆盖工具响应内容       |
| `additionalContext` | `str`           | 附加在工具结果旁的额外上下文 |

> 当多个 hook 都设置了 `updatedToolOutput` 时，**最后一个非空值**生效。如需链式转换，请在单个回调内按顺序执行。

<div id="posttoolusefailurehookinput" />

### `PostToolUseFailureHookInput`

```python theme={null}
@dataclass
class PostToolUseFailureHookInput(BaseHookInput):
    hook_event_name: Literal["PostToolUseFailure"]
    tool_name: str
    tool_input: Any
    error: str
    is_interrupt: bool | None
```

| 字段             | 类型             | 说明         |
| :------------- | :------------- | :--------- |
| `tool_name`    | `str`          | 执行失败的工具名称  |
| `tool_input`   | `Any`          | 传入工具的参数    |
| `error`        | `str`          | 错误信息       |
| `is_interrupt` | `bool \| None` | 是否由中断/中止引起 |

<div id="userpromptsubmithookinput" />

### `UserPromptSubmitHookInput`

```python theme={null}
@dataclass
class UserPromptSubmitHookInput(BaseHookInput):
    hook_event_name: Literal["UserPromptSubmit"]
    prompt: str
```

| 字段       | 类型    | 说明      |
| :------- | :---- | :------ |
| `prompt` | `str` | 用户输入的文本 |

**`hook_specific_output`（`hookSpecificOutput`）：**

| 字段                  | 类型                   | 说明                  |
| :------------------ | :------------------- | :------------------ |
| `hookEventName`     | `"UserPromptSubmit"` | 必须设置                |
| `additionalContext` | `str`                | 追加到用户 prompt 的额外上下文 |

<div id="sessionstarthookinput" />

### `SessionStartHookInput`

```python theme={null}
@dataclass
class SessionStartHookInput(BaseHookInput):
    hook_event_name: Literal["SessionStart"]
    source: str
```

| 字段       | 类型    | 说明                                                        |
| :------- | :---- | :-------------------------------------------------------- |
| `source` | `str` | 会话启动原因：`"startup"` / `"resume"` / `"clear"` / `"compact"` |

**`hook_specific_output`（`hookSpecificOutput`）：**

| 字段                  | 类型               | 说明           |
| :------------------ | :--------------- | :----------- |
| `hookEventName`     | `"SessionStart"` | 必须设置         |
| `additionalContext` | `str`            | 在会话开始时注入的上下文 |

<div id="sessionendhookinput" />

### `SessionEndHookInput`

```python theme={null}
@dataclass
class SessionEndHookInput(BaseHookInput):
    hook_event_name: Literal["SessionEnd"]
    reason: str
```

| 字段       | 类型    | 说明                                                                                                               |
| :------- | :---- | :--------------------------------------------------------------------------------------------------------------- |
| `reason` | `str` | 会话结束原因：`"clear"` / `"resume"` / `"logout"` / `"prompt_input_exit"` / `"other"` / `"bypass_permissions_disabled"` |

<div id="stophookinput" />

### `StopHookInput`

```python theme={null}
@dataclass
class StopHookInput(BaseHookInput):
    hook_event_name: Literal["Stop"]
    stop_hook_active: bool
```

| 字段                 | 类型     | 说明                 |
| :----------------- | :----- | :----------------- |
| `stop_hook_active` | `bool` | Stop hook 是否正在阻止停止 |

返回 `{"decision": "block", "reason": "..."}` 可阻止 AI 停止并强制继续。`reason` 作为续接提示注入模型上下文。

<div id="subagentstarthookinput" />

### `SubagentStartHookInput`

```python theme={null}
@dataclass
class SubagentStartHookInput(BaseHookInput):
    hook_event_name: Literal["SubagentStart"]
    agent_id: str
    agent_type: str
```

| 字段           | 类型    | 说明               |
| :----------- | :---- | :--------------- |
| `agent_id`   | `str` | 子 Agent 实例的唯一标识符 |
| `agent_type` | `str` | 子 Agent 的类型/角色   |

<div id="subagentstophookinput" />

### `SubagentStopHookInput`

```python theme={null}
@dataclass
class SubagentStopHookInput(BaseHookInput):
    hook_event_name: Literal["SubagentStop"]
    stop_hook_active: bool
```

| 字段                 | 类型     | 说明                 |
| :----------------- | :----- | :----------------- |
| `stop_hook_active` | `bool` | Stop hook 是否正在阻止停止 |

<div id="precompacthookinput" />

### `PreCompactHookInput`

```python theme={null}
@dataclass
class PreCompactHookInput(BaseHookInput):
    hook_event_name: Literal["PreCompact"]
    trigger: str
    custom_instructions: str | None
```

| 字段                    | 类型            | 说明                         |
| :-------------------- | :------------ | :------------------------- |
| `trigger`             | `str`         | 触发原因：`"manual"` / `"auto"` |
| `custom_instructions` | `str \| None` | 压缩摘要的自定义指令                 |

<div id="postcompacthookinput" />

### `PostCompactHookInput`

```python theme={null}
@dataclass
class PostCompactHookInput(BaseHookInput):
    hook_event_name: Literal["PostCompact"]
    trigger: str
    compact_summary: str
```

| 字段                | 类型    | 说明                         |
| :---------------- | :---- | :------------------------- |
| `trigger`         | `str` | 触发原因：`"manual"` / `"auto"` |
| `compact_summary` | `str` | 压缩上下文后生成的摘要                |

<div id="cwdchangedhookinput" />

### `CwdChangedHookInput`

```python theme={null}
@dataclass
class CwdChangedHookInput(BaseHookInput):
    hook_event_name: Literal["CwdChanged"]
    old_cwd: str
    new_cwd: str
```

| 字段        | 类型    | 说明       |
| :-------- | :---- | :------- |
| `old_cwd` | `str` | 变更前的工作目录 |
| `new_cwd` | `str` | 变更后的工作目录 |

<div id="instructionsloadedhookinput" />

### `InstructionsLoadedHookInput`

```python theme={null}
@dataclass
class InstructionsLoadedHookInput(BaseHookInput):
    hook_event_name: Literal["InstructionsLoaded"]
    load_reason: str
```

| 字段            | 类型    | 说明                                              |
| :------------ | :---- | :---------------------------------------------- |
| `load_reason` | `str` | 加载原因：`"nested_traversal"` / `"path_glob_match"` |

<div id="filechangedhookinput" />

### `FileChangedHookInput`

```python theme={null}
@dataclass
class FileChangedHookInput(BaseHookInput):
    hook_event_name: Literal["FileChanged"]
    file_path: str
    event: str
```

| 字段          | 类型    | 说明                                       |
| :---------- | :---- | :--------------------------------------- |
| `file_path` | `str` | 发生变更的文件路径                                |
| `event`     | `str` | 文件系统事件：`"change"` / `"add"` / `"unlink"` |

<div id="permissionrequesthookinput" />

### `PermissionRequestHookInput`

```python theme={null}
@dataclass
class PermissionRequestHookInput(BaseHookInput):
    hook_event_name: Literal["PermissionRequest"]
    tool_name: str
    tool_input: Any
    permission_suggestions: list | None
```

| 字段                       | 类型             | 说明      |
| :----------------------- | :------------- | :------ |
| `tool_name`              | `str`          | 申请权限的工具 |
| `tool_input`             | `Any`          | 工具输入参数  |
| `permission_suggestions` | `list \| None` | 建议的权限规则 |

**`hook_specific_output`（`hookSpecificOutput`）：**

| 字段              | 类型                    | 说明        |
| :-------------- | :-------------------- | :-------- |
| `hookEventName` | `"PermissionRequest"` | 必须设置      |
| `decision`      | `dict`                | 权限决策（见下方） |

`decision` 为以下两种之一：

* **批准：** `{"behavior": "allow", "updatedInput": {...}, "updatedPermissions": [...]}`
* **拒绝：** `{"behavior": "deny", "message": "..."}`

<div id="message-types" />

<div id="messagetypes" />

## Message Types

<div id="assistantmessage" />

### `AssistantMessage`

AI 的完整回复，按 turn 触达一次。`content` 是 `TextBlock` 和 `ToolUseBlock` 的列表。

```python theme={null}
@dataclass
class AssistantMessage:
    content: list[TextBlock | ToolUseBlock]
    parent_tool_use_id: str | None = None
    session_id: str | None = None
    uuid: str | None = None
```

<div id="resultmessage" />

### `ResultMessage`

整个会话结束时的最终消息。

```python theme={null}
@dataclass
class ResultMessage:
    subtype: str  # "success" | "error_max_turns" | "error_during_execution" | ...
    duration_ms: int
    num_turns: int
    session_id: str
    total_cost_usd: float | None = None
    result: str | None = None  # 仅在 subtype == "success" 时存在
```

<div id="systemmessage" />

### `SystemMessage`

会话系统消息。`subtype == "init"` 时 `data` 携带初始化信息（session\_id、model、tools 等）。

```python theme={null}
@dataclass
class SystemMessage:
    subtype: str  # "init" | "compact_boundary" | "status" | "mcp_status_change" | ...
    data: dict[str, Any]
```

<div id="streamevent" />

### `StreamEvent`

需启用 `include_partial_messages=True`，按 token 增量流出。

```python theme={null}
@dataclass
class StreamEvent:
    uuid: str
    session_id: str
    event: dict[str, Any]  # 上游兼容的原始 stream event
    parent_tool_use_id: str | None = None
```

`event["type"]` 值：

| `event["type"]`       | 说明                                                      |
| :-------------------- | :------------------------------------------------------ |
| `message_start`       | 消息开始                                                    |
| `content_block_start` | block 开始（text / tool\_use / thinking）                   |
| `content_block_delta` | 增量：`text_delta` / `input_json_delta` / `thinking_delta` |
| `content_block_stop`  | block 结束                                                |
| `message_delta`       | 消息级状态变化（如 stop\_reason）                                 |
| `message_stop`        | 完整 turn 结束                                              |

完整用法见 [流式输出](/zh/cli/sdk/python/streaming-output)。

<div id="content-blocks" />

<div id="contentblocks" />

### Content Blocks

`AssistantMessage.content` 中的元素：

```python theme={null}
@dataclass
class TextBlock:
    text: str


@dataclass
class ToolUseBlock:
    id: str
    name: str
    input: dict[str, Any]
```
