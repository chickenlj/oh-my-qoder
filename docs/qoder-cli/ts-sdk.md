> ## Documentation Index
> Fetch the complete documentation index at: https://docs.qoder.com/llms.txt
> Use this file to discover all available pages before exploring further.

# SDK References

<div id="functions" />

## Functions

<div id="query" />

### `query()`

SDK 的主入口函数。创建一个 async generator，按消息到达顺序流式输出 `SDKMessage`。

```typescript theme={null}
function query(params: {
  prompt: string | AsyncIterable<SDKUserMessage>;
  options?: Options;
}): Query
```

<div id="参数" />

#### 参数

| 参数        | 类型                                                               | 说明                |
| :-------- | :--------------------------------------------------------------- | :---------------- |
| `prompt`  | `string \| AsyncIterable<`[`SDKUserMessage`](#sdkusermessage)`>` | 单轮传字符串；多轮传异步可迭代对象 |
| `options` | [`Options`](#options)                                            | 可选会话配置            |

<div id="返回值" />

#### 返回值

返回 `Query`——一个 `AsyncGenerator<`[`SDKMessage`](#sdkmessage)`, void>`，通过 `for await` 消费。

<div id="types" />

## Types

<div id="options" />

### `Options`

`query()` 的配置对象。

| 字段                                | 类型                                                                                                | 默认值                     | 说明                                                                                   |
| :-------------------------------- | :------------------------------------------------------------------------------------------------ | :---------------------- | :----------------------------------------------------------------------------------- |
| `abortController`                 | `AbortController`                                                                                 | `new AbortController()` | 取消会话的控制器                                                                             |
| `additionalDirectories`           | `string[]`                                                                                        | `[]`                    | AI 可访问的额外目录                                                                          |
| `agent`                           | `string`                                                                                          | `undefined`             | 主线程使用的 agent 名，见 [Agents Reference](#optionsagent)                                   |
| `agents`                          | `Record<string, AgentDefinition>`                                                                 | `undefined`             | 编程方式定义的子 Agent，见 [Agents Reference](#optionsagents)                                  |
| `allowDangerouslySkipPermissions` | `boolean`                                                                                         | `false`                 | 允许跳过权限检查；与 `permissionMode: 'bypassPermissions'` 配合                                  |
| `allowedTools`                    | `string[]`                                                                                        | `[]`                    | 工具白名单，预授权放行；内置工具名见 [Tools Reference](#内置工具列表)                                        |
| `auth`                            | [`AuthOptions`](#authoptions)                                                                     | `undefined`             | 认证配置，**`query()` 必传**                                                                |
| `canUseTool`                      | [`CanUseTool`](#canusetool)                                                                       | `undefined`             | 自定义工具权限回调                                                                            |
| `continue`                        | `boolean`                                                                                         | `false`                 | 继续最近一次会话                                                                             |
| `cwd`                             | `string`                                                                                          | `process.cwd()`         | 工作目录                                                                                 |
| `disallowedTools`                 | `string[]`                                                                                        | `[]`                    | 工具黑名单，优先级高于 `allowedTools` 与 `permissionMode`；内置工具名见 [Tools Reference](#内置工具列表)      |
| `enableFileCheckpointing`         | `boolean`                                                                                         | `false`                 | 启用文件 checkpoint，配合 `rewindFiles()`，见 [Checkpoint](/zh/cli/sdk/checkpoint)            |
| `env`                             | `Record<string, string \| undefined>`                                                             | `process.env`           | 传给 CLI 进程的环境变量                                                                       |
| `proxy`                           | `string`                                                                                          | `undefined`             | CLI 进程使用的代理 URL，支持 `http://`、`https://`、`socks5://` 和 `socks://`                     |
| `executable`                      | `'bun' \| 'deno' \| 'node'`                                                                       | 自动检测                    | JavaScript 运行时                                                                       |
| `executableArgs`                  | `string[]`                                                                                        | `[]`                    | 传给运行时的参数                                                                             |
| `experimentalCloudAgent`          | [`CloudAgentOptions`](#cloudagentoptions)                                                         | `undefined`             | 切换到 Qoder Cloud Agent runtime（experimental），见 [Cloud Agent](/zh/cli/sdk/cloud-agent) |
| `extraArgs`                       | `Record<string, string \| null>`                                                                  | `{}`                    | 传给 CLI 的附加参数                                                                         |
| `fallbackModel`                   | `string`                                                                                          | `undefined`             | 主模型失败时的备选模型                                                                          |
| `forkSession`                     | `boolean`                                                                                         | `false`                 | 与 `resume` 配合时分叉为新 session ID                                                        |
| `hooks`                           | `Partial<Record<`[`HookEvent`](#hookevent)`, `[`HookCallbackMatcher`](#hookcallbackmatcher)`[]>>` | `{}`                    | 生命周期钩子，见 [Hooks](/zh/cli/sdk/hooks)                                                  |
| `includeHookEvents`               | `boolean`                                                                                         | `false`                 | 在消息流中包含 hook 生命周期事件                                                                  |
| `includePartialMessages`          | `boolean`                                                                                         | `false`                 | 包含 `stream_event` 流式片段，见 [流式输出](/zh/cli/sdk/streaming-output)                        |
| `maxTurns`                        | `number`                                                                                          | `undefined`             | 最大对话轮次（工具调用 round-trip 数）                                                            |
| `mcpServers`                      | `Record<string, `[`McpServerConfig`](#mcpserverconfig)`>`                                         | `{}`                    | MCP 服务器配置，见 [MCP](/zh/cli/sdk/mcp)                                                   |
| `model`                           | `string`                                                                                          | CLI 默认                  | 使用的模型，可选值：`'auto'` / `'ultimate'` / `'performance'` / `'efficient'` / `'lite'`       |
| `pathToQoderCLIExecutable`        | `string`                                                                                          | 自动解析 bundled binary     | qodercli 可执行文件路径                                                                     |
| `permissionMode`                  | [`PermissionMode`](#permissionmode)                                                               | `'default'`             | 会话权限模式                                                                               |
| `permissionPromptToolName`        | `string`                                                                                          | `undefined`             | 权限提示用的 MCP 工具名，与 `canUseTool` 互斥                                                     |
| `planModeInstructions`            | `string`                                                                                          | `undefined`             | `permissionMode: 'plan'` 时覆盖计划模式工作流正文                                                |
| `plugins`                         | [`SdkPluginConfig`](#sdkpluginconfig)`[]`                                                         | `[]`                    | 加载本地插件，见 [Plugins](/zh/cli/sdk/plugins)                                              |
| `promptSuggestions`               | `boolean`                                                                                         | `false`                 | 每轮 result 后发出 `prompt_suggestion` 消息                                                 |
| `resolveModel`                    | [`ModelPolicyProvider`](#modelpolicyprovider)                                                     | `undefined`             | 动态模型选择回调，传入即进入动态回调模式，见 [Model Policy](/zh/cli/sdk/model-policy)                      |
| `resolveModelTimeoutMs`           | `number`                                                                                          | `500`                   | 回调超时（毫秒），仅在传入 `resolveModel` 时生效                                                     |
| `resume`                          | `string`                                                                                          | `undefined`             | 要恢复的 session ID                                                                      |
| `resumeSessionAt`                 | `string`                                                                                          | `undefined`             | 从指定 message UUID 恢复                                                                  |
| `sandbox`                         | [`SandboxSettings`](#sandboxsettings)                                                             | `undefined`             | 沙箱配置                                                                                 |
| `sessionId`                       | `string`                                                                                          | 自动生成                    | 指定会话 UUID                                                                            |
| `settings`                        | `string \| Settings`                                                                              | `undefined`             | 内联 settings 对象或 settings 文件路径                                                        |
| `settingSources`                  | [`SettingSource`](#settingsource)`[]`                                                             | CLI 默认                  | 加载哪些 filesystem settings；传 `[]` 跳过 user/project/local                                |
| `skills`                          | `string[] \| 'all'`                                                                               | `undefined`             | 启用的 Skill；传 `'all'` 启用全部，见 [Skills](/zh/cli/sdk/skills)                              |
| `spawnQoderCLIProcess`            | `(options: SpawnOptions) => SpawnedProcess`                                                       | `undefined`             | 自定义进程 spawn 函数                                                                       |
| `strictMcpConfig`                 | `boolean`                                                                                         | `false`                 | 严格 MCP 校验                                                                            |
| `systemPrompt`                    | `string \| { type: 'preset'; preset: 'qodercli'; append?: string }`                               | `undefined`             | 系统提示。字符串覆盖；preset 形式在 qodercli 预设之后 append                                           |
| `toolConfig`                      | [`ToolConfig`](#toolconfig)                                                                       | `undefined`             | 内置工具行为配置；工具使用见 [Tools](/zh/cli/sdk/tools)                                            |
| `tools`                           | `string[] \| { type: 'preset'; preset: 'qodercli' }`                                              | `undefined`             | 工具集合。传字符串数组限定可用工具；传空数组禁用所有工具；内置工具名见 [Tools Reference](#内置工具列表)                       |

<div id="authoptions" />

### `AuthOptions`

```typescript theme={null}
type AuthOptions =
  | { type: 'accessToken'; accessToken: string | { envVar: string } }
  | { type: 'qodercli' };
```

| 形式                                                 | 说明                                             |
| :------------------------------------------------- | :--------------------------------------------- |
| `{ type: 'accessToken'; accessToken: string }`     | 直接传入 PAT                                       |
| `{ type: 'accessToken'; accessToken: { envVar } }` | 从指定环境变量读取 PAT，默认 `QODER_PERSONAL_ACCESS_TOKEN` |
| `{ type: 'qodercli' }`                             | 复用本机 `qodercli login` 状态                       |

便捷构造器：`accessToken(token)` / `accessTokenFromEnv(envVar?)` / `qodercliAuth()`，见 [SDK 认证](/zh/cli/sdk/authentication)。

<div id="optionsagents" />

### `options.agents`

**类型:** `Record<string, AgentDefinition>`

注册当前 `query()` 会话可用的自定义 Agent。对象 key 是 Agent 名称，value 是该 Agent 的定义。

> **必须包含 `Agent` 工具**：自定义 subagents 需要主会话通过内置 `Agent` 工具发起委派。The Agent tool must be included in `allowedTools` since Qoder invokes subagents through the Agent tool.

```typescript theme={null}
const q = query({
  prompt: 'Use the reviewer agent to inspect recent changes.',
  options: {
    allowedTools: ['Agent'],
    agents: {
      reviewer: {
        description: 'Reviews code quality and reports actionable findings.',
        prompt: 'Review the requested code and report concrete issues.',
        tools: ['Read', 'Grep', 'Glob'],
      },
    },
  },
});
```

注册后，模型可通过内置 `Agent` 工具调用这些子 Agent。主会话要能委派任务，工具集中必须存在 `Agent`；`allowedTools: ['Agent']` 是必需的预授权写法。如果你使用 `options.tools` 收窄主会话可用工具，也要把 `Agent` 放进去。

<div id="optionsagent" />

### `options.agent`

**类型:** `string`

指定主会话以哪个 Agent 身份运行。值可以是 `options.agents` 中注册的名称，也可以是当前 CLI 已发现的内置 / 插件 Agent 名称。

```typescript theme={null}
const q = query({
  prompt: 'Plan the implementation.',
  options: {
    agents: {
      planner: {
        description: 'Plans work before implementation.',
        prompt: 'Break work into steps, risks, and validation checks.',
        tools: ['Read', 'Grep', 'Glob'],
      },
    },
    agent: 'planner',
  },
});
```

设置后，主会话使用该 Agent 的 `prompt`、`model` 和工具限制。省略时使用默认主会话行为。

<div id="agentdefinition" />

### `AgentDefinition`

自定义 Agent 的定义。下列字段是当前版本 SDK 覆盖并经过功能测试验证的稳定能力。

```typescript theme={null}
type AgentDefinition = {
  description: string;
  prompt: string;
  tools?: string[];
  disallowedTools?: string[];
  model?: string;
  mcpServers?: AgentMcpServerSpec[];
  skills?: string[];
  initialPrompt?: string;
  maxTurns?: number;
  effort?: EffortLevel;
  permissionMode?: PermissionMode;
};
```

| 字段                | 类型                     | 必填 | 说明                         |
| ----------------- | ---------------------- | -- | -------------------------- |
| `description`     | `string`               | 是  | Agent 用途描述，模型据此判断何时调用      |
| `prompt`          | `string`               | 是  | Agent 的系统提示词               |
| `tools`           | `string[]`             | 否  | Agent 可用工具白名单              |
| `disallowedTools` | `string[]`             | 否  | 从 Agent 工具集中排除的工具          |
| `model`           | `string`               | 否  | 模型覆盖；`'inherit'` 表示继承主会话模型 |
| `mcpServers`      | `AgentMcpServerSpec[]` | 否  | Agent 可用的 MCP server 规格    |
| `skills`          | `string[]`             | 否  | 预加载到 Agent 上下文的 skill 名称   |
| `initialPrompt`   | `string`               | 否  | 作为主会话 Agent 时自动提交的首轮用户输入   |
| `maxTurns`        | `number`               | 否  | Agent 最大 API 轮次            |
| `effort`          | `EffortLevel`          | 否  | 推理努力级别                     |
| `permissionMode`  | `PermissionMode`       | 否  | Agent 内工具执行的权限模式           |

<div id="description" />

#### `description`

描述 Agent 适合处理什么任务。它会影响模型是否选择该 Agent。

```typescript theme={null}
description: 'Runs project tests, analyzes failing output, and suggests fixes.'
```

建议写清楚触发场景。避免只写 `Helpful assistant` 这类宽泛描述。

<div id="prompt" />

#### `prompt`

Agent 的系统提示词，用来定义角色、约束和输出格式。

```typescript theme={null}
prompt: `You are a security reviewer.
Check for authentication bypass, authorization bugs, injection risks, and secret leaks.
Return findings sorted by severity.`
```

<div id="tools" />

#### `tools`

Agent 可用工具白名单。设置后，Agent 只能使用列出的工具。

```typescript theme={null}
tools: ['Read', 'Grep', 'Glob']
```

省略 `tools` 时，使用子 Agent 默认工具表。子 Agent 的工具表不继承主会话 `allowedTools` 的裁剪。

<div id="disallowedtools" />

#### `disallowedTools`

从 Agent 工具集中排除指定工具。

```typescript theme={null}
disallowedTools: ['Bash', 'Write']
```

省略 `disallowedTools` 时，子 Agent 不继承主会话 `disallowedTools` 的裁剪。通常不要同时设置 `tools` 和 `disallowedTools`，除非你明确知道最终工具集合。

<div id="model" />

#### `model`

为 Agent 指定模型，省略时使用会话默认模型。可填模型级别包括：

| 值             | 级别   | 说明                 | 适用场景             | Credit 消耗 |
| ------------- | ---- | ------------------ | ---------------- | --------- |
| `auto`        | 智能路由 | 智能选择最适合的模型，平衡性能与成本 | 大部分日常开发工作，建议默认使用 | \~1.0x    |
| `ultimate`    | 极致   | 专家级深度推理与思考能力       | 复杂系统设计、高难度问题分析   | \~1.6x    |
| `performance` | 性能   | 高级推理能力，高质量输出       | 核心功能实现、架构设计、代码重构 | \~1.1x    |
| `efficient`   | 经济   | 标准推理能力，高性价比        | 基础代码生成、单元测试、日常问答 | \~0.3x    |
| `lite`        | 轻量   | 基础推理能力，免费使用        | 快速验证、基础逻辑实现、快问快答 | 0x        |

Agent 还支持两个特殊写法：

| 值         | 说明                      |
| --------- | ----------------------- |
| `inherit` | 继承主会话模型                 |
| 完整模型 ID   | 直接指定当前 CLI / 后端支持的模型 ID |

<div id="mcpservers" />

#### `mcpServers`

限制或增加该 Agent 可用的 MCP server。

```typescript theme={null}
type AgentMcpServerSpec =
  | string
  | Record<string, McpServerConfig>;
```

字符串形式用于引用会话中已配置的 MCP server 名称；对象形式用于给该 Agent 配置专属 MCP server。MCP server 配置结构见 [SDK References - McpServerConfig](#mcpserverconfig)。

<div id="skills" />

#### `skills`

预加载到 Agent 上下文的 skill 名称列表。支持普通 skill 名称，也支持插件限定名。

```typescript theme={null}
skills: ['review', 'sdk-test-plugin:sdk-echo']
```

会话级 skill 行为见 [Skills](/zh/cli/sdk/skills)。

<div id="initialprompt" />

#### `initialPrompt`

当该 Agent 通过 `options.agent` 成为主会话 Agent 时，自动作为首轮用户输入提交。

```typescript theme={null}
initialPrompt: 'Start by scanning authentication and session management code.'
```

该字段只对主会话 Agent 生效。作为子 Agent 被 `Agent` 工具调用时会被忽略。

<div id="maxturns" />

#### `maxTurns`

限制 Agent 的最大 API 轮次。适合控制成本、执行时间和循环风险。

```typescript theme={null}
maxTurns: 6
```

<div id="effort" />

#### `effort`

```typescript theme={null}
type EffortLevel = 'low' | 'medium' | 'high' | 'max';
```

控制 Agent 的推理努力级别。更高的 `effort` 通常适合复杂审查、架构分析和高风险变更，但会增加延迟和 token 消耗。

<div id="permissionmode" />

#### `permissionMode`

控制该 Agent 内部工具执行的权限模式。它和会话级 `permissionMode` 使用同一组语义，但作用范围只限这个 Agent。会话级权限链路、`allowedTools` / `disallowedTools` / `canUseTool` 的优先级和示例见 [权限控制](/zh/cli/sdk/permissions#控制默认策略permissionmode)。

```typescript theme={null}
type PermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'bypassPermissions'
  | 'yolo'
  | 'plan'
  | 'dontAsk'
  | 'auto';
```

| 值                     | 语义                                              | 适合场景                     |
| --------------------- | ----------------------------------------------- | ------------------------ |
| `'default'`           | 标准权限行为。工具调用仍会经过工具集合、允许 / 禁止规则、运行时审批或 CLI 默认策略处理 | 大多数交互式子 Agent            |
| `'acceptEdits'`       | 自动接受文件编辑类操作；其他敏感操作仍按权限流程处理                      | 已确认子 Agent 可以修改工作区文件     |
| `'bypassPermissions'` | 跳过权限检查。高风险模式，通常只用于受信任的自动化或测试环境                  | 受控 CI、临时验证、一次性自动化任务      |
| `'yolo'`              | `'bypassPermissions'` 的兼容别名，同样会跳过权限检查           | 兼容旧配置，不建议新代码优先使用         |
| `'plan'`              | 计划模式，适合先产出执行计划，默认不执行实际变更                        | 规划、设计、审查，不希望子 Agent 修改文件 |
| `'dontAsk'`           | 不进行交互询问；未预授权、未被规则允许的操作会被拒绝                      | 无交互运行环境，或希望失败也不要弹确认      |
| `'auto'`              | 由运行时能力自动判断 allow 或 deny；安全的工作区内文件编辑可能自动放行       | 希望减少确认打断，同时保留运行时判断       |

权限语义介绍见 [权限控制](/zh/cli/sdk/permissions)。

<div id="agentinfo" />

### `AgentInfo`

`q.supportedAgents()` 返回的 Agent 摘要。

```typescript theme={null}
type AgentInfo = {
  name: string;
  description: string;
  model?: string;
};
```

| 字段            | 类型                    | 说明                                        |
| ------------- | --------------------- | ----------------------------------------- |
| `name`        | `string`              | Agent 名称                                  |
| `description` | `string`              | Agent 用途描述                                |
| `model`       | `string \| undefined` | Agent 的模型覆盖；未设置或 `model: 'inherit'` 时通常为空 |

```typescript theme={null}
const q = query({
  prompt: 'List agents.',
  options: {
    agents: {
      reviewer: {
        description: 'Reviews code quality.',
        prompt: 'Review code and report findings.',
      },
    },
  },
});

const agents = await q.supportedAgents();
```

返回列表可能包含通过 `options.agents` 注册的 Agent，也可能包含当前 CLI 发现的内置、项目、用户或插件 Agent。实际可用项取决于 qodercli 版本和当前配置。

<div id="上下文与调用边界" />

### 上下文与调用边界

* 子 Agent 使用独立上下文，不接收父会话完整历史。
* 父会话传给子 Agent 的主要信息，是调用 `Agent` 工具时传入的任务 prompt。
* 子 Agent 的中间工具结果不会直接进入父会话；父会话收到的是子 Agent 最终返回。
* 子 Agent 不能再生成自己的子 Agent，因此不要把 `Agent` 放进子 Agent 的 `tools`。
* `initialPrompt` 只对 `options.agent` 指定的主会话 Agent 生效。

***

<div id="model-policy" />

### Model Policy

`query()` 的动态模型选择能力。两种模式：固定模型（不传 `resolveModel`，使用 `options.model` 或后端默认）与动态回调模式（传入 `resolveModel`，每次 LLM 调用前由回调决定模型）。完整概念、触发时机与错误处理见 [Model Policy](/zh/cli/sdk/model-policy)。

<div id="optionsresolvemodel" />

#### `options.resolveModel`

**类型:** [`ModelPolicyProvider`](#modelpolicyprovider)

动态回调模式入口。传入即进入动态回调模式，每次 LLM 请求前 SDK 都会调用该回调拿模型；回调返回的 `model` 是该次请求的最终模型，**不会自动降级**。

<div id="optionsresolvemodeltimeoutms" />

#### `options.resolveModelTimeoutMs`

**类型:** `number`，默认 `500`

回调超时（毫秒）。超时后抛 [`ModelPolicyTimeoutError`](#modelpolicytimeouterror)，query 失败，不降级。仅在传入 `resolveModel` 时生效。

<div id="modelpolicyprovider" />

### `ModelPolicyProvider`

回调函数签名。同步或异步均可。

```typescript theme={null}
type ModelPolicyProvider = (
  context: ModelPolicyContext,
) => ModelPolicyResult | Promise<ModelPolicyResult>;
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
* 抛异常或返回空 `model` 让 query 直接失败，详细错误处理见 [Model Policy — 超时与错误处理](/zh/cli/sdk/model-policy#超时与错误处理)。

<div id="modelpolicycontext" />

### `ModelPolicyContext`

回调每次接收的上下文。

```typescript theme={null}
interface ModelPolicyContext {
  purpose: QoderModelPurpose;
  sessionId: string;
  availableModels: ModelInfo[];
}
```

| 字段                | 类型                                        | 必填 | 说明                                              |
| ----------------- | ----------------------------------------- | -- | ----------------------------------------------- |
| `purpose`         | [`QoderModelPurpose`](#qodermodelpurpose) | 是  | 本次 LLM 调用用途                                     |
| `sessionId`       | `string`                                  | 是  | 当前会话 ID；同一会话内多次回调拿到相同值，可作缓存 / 埋点键               |
| `availableModels` | [`ModelInfo`](#modelinfo)`[]`             | 是  | 当前账号实时可用的模型列表（CLI 在每次 `get_model_policy` 请求时携带） |

<div id="qodermodelpurpose" />

### `QoderModelPurpose`

```typescript theme={null}
type QoderModelPurpose =
  | 'main'
  | 'subagent'
  | 'web_fetch'
  | 'image_gen'
  | 'compact';
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

```typescript theme={null}
interface ModelPolicyResult {
  model: string | (CustomModel & { model: string });
  parameters?: Record<string, unknown>;
}
```

| 字段           | 类型                                                                | 必填 | 说明                                 |
| ------------ | ----------------------------------------------------------------- | -- | ---------------------------------- |
| `model`      | `string \| (`[`CustomModel`](#custommodel)` & { model: string })` | 是  | 字符串：模型标识；对象：BYOK 凭证 + 模型标识         |
| `parameters` | `Record<string, unknown>`                                         | 否  | 本次请求的模型参数覆盖。SDK 控制层参数名使用 camelCase |

支持的 `parameters` 键：

| 键                 | 类型       | 说明                                                                                                                                             |
| ----------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `contextWindow`   | `number` | 本次 LLM 请求使用的上下文窗口 token 数。应选择当前模型支持的值，通常从 [`ModelInfo.context_config`](#modelcontextconfig) 读取                                                 |
| `reasoningEffort` | `string` | 本次 LLM 请求使用的思考 / 推理深度。应选择当前模型支持的档位，通常从 [`ModelInfo.thinking_config`](#modelthinkingconfig) 读取。常见值包括 `none`、`low`、`medium`、`high`、`xhigh`、`max` |

`model` 形式：

* **字符串** — 后端支持的模型 ID（如 `auto` / `performance` / `glm51`），具体可用值由 [`q.getAvailableModels()`](#qgetavailablemodels) 实时返回。**必须非空**，否则 query 失败。
* **`CustomModel` 对象**（BYOK） — SDK 自动提取对象里的 `model` 字段作为本次调用的模型标识，其余字段作为凭证转发给 CLI 路由到第三方 LLM。

<div id="custommodel" />

### `CustomModel`

BYOK 凭证。在 `resolveModel` 回调里把 `model` 字段直接设为该对象，本次 LLM 请求会路由到第三方 provider。

```typescript theme={null}
interface CustomModel {
  provider: string;
  model: string;
  api_key: string;
  style?: string;
}
```

| 字段         | 类型       | 必填 | 说明                                                           |
| ---------- | -------- | -- | ------------------------------------------------------------ |
| `provider` | `string` | 是  | provider 标识，必须匹配 [`BYOKProviderInfo.key`](#byokproviderinfo) |
| `model`    | `string` | 是  | 模型标识，SDK 自动提取为本次调用的模型 ID                                     |
| `api_key`  | `string` | 是  | 用户提供的 API Key                                                |
| `style`    | `string` | 否  | 上游协议风格，如 `"openai"` / `"anthropic"`；默认 `"openai"`            |

注意：

* `provider` 必须命中目录里的 `key`，否则后端鉴权失败。
* `api_key` 错误时鉴权失败让 query 直接失败（动态回调模式不降级）。
* BYOK 调用平台 `total_cost_usd` 计为 0，token 用量按真实值上报，由 provider 侧扣费。

<div id="byok-目录类型" />

### BYOK 目录类型

[`q.listByokProviders()`](#qlistbyokproviders) 返回的 provider/model 目录。

```typescript theme={null}
interface SDKControlGetByokConfigResponse {
  providers: BYOKProviderInfo[];
}

interface BYOKProviderInfo {
  key: string;
  display_name: string;
  api_key_url: string;
  types: BYOKModelTypeInfo[];
}

interface BYOKModelTypeInfo {
  key?: string;
  display_name: string;
  models: BYOKModelInfo[];
}

interface BYOKModelInfo {
  key: string;
  display_name: string;
  is_vl: boolean;
  is_reasoning: boolean;
  format: string;
  max_input_tokens: number;
}
```

<div id="byokproviderinfo" />

#### `BYOKProviderInfo`

| 字段             | 类型                    | 说明                                          |
| -------------- | --------------------- | ------------------------------------------- |
| `key`          | `string`              | provider 标识，BYOK 时填到 `CustomModel.provider` |
| `display_name` | `string`              | 展示名                                         |
| `api_key_url`  | `string`              | 引导用户去申请 API Key 的地址                         |
| `types`        | `BYOKModelTypeInfo[]` | 该 provider 下的模型分组                           |

<div id="byokmodeltypeinfo" />

#### `BYOKModelTypeInfo`

| 字段             | 类型                    | 说明                          |
| -------------- | --------------------- | --------------------------- |
| `key`          | `string \| undefined` | 分组标识，常见值：`cp` / `tp` / `pg` |
| `display_name` | `string`              | 分组展示名                       |
| `models`       | `BYOKModelInfo[]`     | 分组下的模型                      |

<div id="byokmodelinfo" />

#### `BYOKModelInfo`

| 字段                 | 类型        | 说明                           |
| ------------------ | --------- | ---------------------------- |
| `key`              | `string`  | 模型 ID，填到 `CustomModel.model` |
| `display_name`     | `string`  | 展示名                          |
| `is_vl`            | `boolean` | 是否支持视觉 / 多模态输入               |
| `is_reasoning`     | `boolean` | 是否推理型模型                      |
| `format`           | `string`  | 上游协议格式（如 `openai`）           |
| `max_input_tokens` | `number`  | 最大输入 token                   |

<div id="modelinfo" />

### `ModelInfo`

[`q.getAvailableModels()`](#qgetavailablemodels) 返回的可用模型摘要，也作为 [`ModelPolicyContext.availableModels`](#modelpolicycontext) 的元素类型。

```typescript theme={null}
interface ModelInfo {
  value: string;
  displayName: string;
  description: string;
  isEnabled: boolean;
  isNew?: boolean;
  isFree?: boolean;
  priceFactor?: number;
  context_config?: ModelContextConfig;
  thinking_config?: ModelThinkingConfig;
  promotion?: ModelPromotion;
  serverModel?: ServerModelJson;
}
```

| 字段                | 类型                                                           | 说明                                                                                      |
| ----------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `value`           | `string`                                                     | 模型标识，可用于 [`ModelPolicyResult.model`](#modelpolicyresult) 或 [`q.setModel()`](#qsetmodel) |
| `displayName`     | `string`                                                     | 展示名                                                                                     |
| `description`     | `string`                                                     | 模型描述文本                                                                                  |
| `isEnabled`       | `boolean`                                                    | 是否当前可用                                                                                  |
| `isNew`           | `boolean \| undefined`                                       | 是否新上线模型                                                                                 |
| `isFree`          | `boolean \| undefined`                                       | 是否免费模型                                                                                  |
| `priceFactor`     | `number \| undefined`                                        | 价格系数                                                                                    |
| `context_config`  | [`ModelContextConfig`](#modelcontextconfig) `\| undefined`   | 上下文窗口配置（层级标签 → token 数量）                                                                |
| `thinking_config` | [`ModelThinkingConfig`](#modelthinkingconfig) `\| undefined` | 思考（推理）配置                                                                                |
| `promotion`       | [`ModelPromotion`](#modelpromotion) `\| undefined`           | 模型列表 API 返回的优惠/折扣信息；缺省表示没有优惠                                                            |
| `serverModel`     | [`ServerModelJson`](#servermodeljson) `\| undefined`         | CLI 原样透传的模型列表 API 原始模型条目                                                                |

<div id="modelcontextconfig" />

### `ModelContextConfig`

模型的上下文窗口配置，按层级标签（如 `"200K"`、`"1M"`）索引。

```typescript theme={null}
type ModelContextConfig = Record<string, ModelContextWindowEntry>;

interface ModelContextWindowEntry {
  token_count: number;
  is_default?: boolean;
}
```

| 字段            | 类型                     | 说明            |
| ------------- | ---------------------- | ------------- |
| `token_count` | `number`               | 该层级的 token 数量 |
| `is_default`  | `boolean \| undefined` | 是否为默认层级       |

<div id="modelthinkingconfig" />

### `ModelThinkingConfig`

模型的思考（推理）配置。

```typescript theme={null}
interface ModelThinkingConfig {
  disabled?: ModelThinkingDisabled;
  enabled?: ModelThinkingEnabled;
}

interface ModelThinkingDisabled {
  description?: string;
}

interface ModelThinkingEnabled {
  description?: string;
  efforts?: Record<string, ModelEffortEntry>;
  is_default?: boolean;
}

interface ModelEffortEntry {
  description?: string;
  is_default?: boolean;
}
```

| 字段                | 类型                                              | 说明                                |
| ----------------- | ----------------------------------------------- | --------------------------------- |
| `disabled`        | `ModelThinkingDisabled \| undefined`            | 关闭思考时的配置                          |
| `enabled`         | `ModelThinkingEnabled \| undefined`             | 开启思考时的配置，包含努力级别                   |
| `enabled.efforts` | `Record<string, ModelEffortEntry> \| undefined` | 各努力级别（如 `"low"`、`"high"`）的描述与默认选项 |

<div id="modelpromotion" />

### `ModelPromotion`

CLI 从模型列表 API 透传的优惠/折扣信息。嵌套字段名保持服务端的 snake\_case 形式。

```typescript theme={null}
type LocalizedModelText = {
  en?: string;
  zh?: string;
} & Record<string, string | undefined>;

interface ModelPromotion {
  active: boolean;
  badge?: LocalizedModelText;
  description?: LocalizedModelText;
  discount_factor?: number;
  before_promotion_price_factor?: number;
  timezone?: string;
  rule_id?: string;
  window_start?: string;
  window_end?: string;
}
```

| 字段                              | 类型                                | 说明                     |
| ------------------------------- | --------------------------------- | ---------------------- |
| `active`                        | `boolean`                         | 当前模型的优惠是否正在生效          |
| `badge`                         | `LocalizedModelText \| undefined` | 简短的本地化标签               |
| `description`                   | `LocalizedModelText \| undefined` | 更完整的本地化描述              |
| `discount_factor`               | `number \| undefined`             | 优惠生效时的折扣价格系数           |
| `before_promotion_price_factor` | `number \| undefined`             | 优惠前的原始价格系数             |
| `timezone`                      | `string \| undefined`             | 判断优惠窗口使用的 IANA 时区      |
| `rule_id`                       | `string \| undefined`             | 服务端规则标识                |
| `window_start`                  | `string \| undefined`             | 每日优惠窗口开始时间，格式为 `HH:mm` |
| `window_end`                    | `string \| undefined`             | 每日优惠窗口结束时间，格式为 `HH:mm` |

<div id="servermodeljson" />

### `ServerModelJson`

模型列表 API 返回的 JSON 兼容原始模型条目。服务端新增字段尚未进入 `ModelInfo` 一等字段时，可以从这里读取。

```typescript theme={null}
type ServerModelJson = Record<string, ServerModelJsonValue>;
```

<div id="usageinfo" />

### `UsageInfo`

[`q.getUsageInfo()`](#qgetusageinfo) 返回的账号配额与用量快照。

```typescript theme={null}
interface UsageInfo {
  userId?: string;
  userType?: string;
  totalUsagePercentage?: number;
  isHighestTier?: boolean;
  expiresAt?: number;
  upgradeUrl?: string;
  userQuota?: UsageQuotaBucket;
  addOnQuota?: UsageAddOnQuotaBucket;
  isQuotaExceeded?: boolean;
  isPlanQuotaProrated?: boolean;
  orgResourcePackage?: UsageOrgResourcePackage;
}

interface UsageQuotaBucket {
  total?: number;
  used?: number;
  remaining?: number;
  percentage?: number;
  unit?: string;
}

interface UsageAddOnQuotaBucket extends UsageQuotaBucket {
  detailUrl?: string;
}

interface UsageOrgResourcePackage {
  used?: number;
  cap?: number;
  remaining?: number;
  percentage?: number;
  available?: boolean;
  unit?: string;
}
```

| 字段                     | 类型                                     | 说明                                    |
| ---------------------- | -------------------------------------- | ------------------------------------- |
| `userId`               | `string \| undefined`                  | 账号 ID                                 |
| `userType`             | `string \| undefined`                  | 套餐档位（如 `free`、`pro`、`teams`）          |
| `totalUsagePercentage` | `number \| undefined`                  | 所有额度的整体用量，`0`–`100`                   |
| `isHighestTier`        | `boolean \| undefined`                 | 是否已是最高档套餐                             |
| `expiresAt`            | `number \| undefined`                  | 当前套餐/额度到期时间，Unix 毫秒时间戳                |
| `upgradeUrl`           | `string \| undefined`                  | 升级页面 URL（存在可升级套餐时返回）                  |
| `userQuota`            | `UsageQuotaBucket \| undefined`        | 套餐内置额度                                |
| `addOnQuota`           | `UsageAddOnQuotaBucket \| undefined`   | 加购额度；账号存在加购额度时返回（`detailUrl` 指向用量明细页） |
| `isQuotaExceeded`      | `boolean \| undefined`                 | 是否所有可用额度已耗尽                           |
| `isPlanQuotaProrated`  | `boolean \| undefined`                 | 当前周期套餐额度是否按比例折算                       |
| `orgResourcePackage`   | `UsageOrgResourcePackage \| undefined` | 组织共享资源包（`available` 表示是否可使用）          |

各额度桶均以 `unit`（通常为 `credits`）为单位，按 `total`（组织包为 `cap`）给出 `used` / `remaining` / `percentage`。
缺失字段或运行时类型不符合预期的字段会从返回对象中省略。

<div id="modelpolicytimeouterror" />

### `ModelPolicyTimeoutError`

```typescript theme={null}
class ModelPolicyTimeoutError extends Error {}
```

`resolveModel` 回调超过 `options.resolveModelTimeoutMs` 仍未返回时由 SDK 抛出，query 直接失败，不降级。

<div id="qsetmodel" />

### `q.setModel()`

```typescript theme={null}
setModel(model?: string): Promise<void>;
```

运行中切换固定模型模式下的模型，下一次 LLM 调用生效。仅在固定模型模式下生效；动态回调模式下调用不会覆盖回调结果。可用模型 ID 见 [`ModelInfo.value`](#modelinfo)。

<div id="qgetavailablemodels" />

### `q.getAvailableModels()`

```typescript theme={null}
getAvailableModels(): Promise<ModelInfo[]>;
```

实时拉取当前账号可用的模型列表。返回最新结果，不缓存；暂时无法获取时返回空数组，不抛异常。动态回调模式下 [`ModelPolicyContext.availableModels`](#modelpolicycontext) 已实时携带相同列表，无需额外调用。

<div id="qlistbyokproviders" />

### `q.listByokProviders()`

```typescript theme={null}
listByokProviders(): Promise<BYOKProviderInfo[] | null>;
```

返回当前账号可用的 BYOK provider/model 目录数组：

* 返回 `null`：CLI 不支持该接口（兼容降级，不抛异常）。
* 返回数组（可能为空）：当前账号可用的 provider 列表（空数组表示账号未开通 BYOK）。

provider/model 字段含义见 [BYOK 目录类型](#byok-目录类型)。

<div id="qgetusageinfo" />

### `q.getUsageInfo()`

```typescript theme={null}
getUsageInfo(): Promise<UsageInfo | null>;
```

实时获取当前账号的配额与用量信息（由运行中的 CLI 返回）。

* 返回 `null`：CLI 未登录、旧版本 CLI 不支持该接口，或 CLI 未返回对象（兼容降级，不抛异常）。
* 返回 [`UsageInfo`](#usageinfo) 对象：运行时类型合法的账号配额与用量字段。缺失或类型不合法的字段会被省略。

```typescript theme={null}
import { query, qodercliAuth } from '@qoder-ai/qoder-agent-sdk';

const q = query({
  prompt: userMessages(),
  options: { auth: qodercliAuth() },
});

const usage = await q.getUsageInfo();
if (usage) {
  console.log(`套餐：${usage.userType}，已用 ${usage.totalUsagePercentage}%`);
  console.log(`套餐额度剩余：${usage.userQuota?.remaining}/${usage.userQuota?.total} ${usage.userQuota?.unit}`);
}
```

返回类型见 [`UsageInfo`](#usageinfo)。

***

<div id="canusetool" />

### `CanUseTool`

宿主自定义的工具权限审批回调。

```typescript theme={null}
type CanUseTool = (
  toolName: string,
  input: Record<string, unknown>,
  options: CanUseToolOptions,
) => Promise<PermissionResult>;
```

<div id="canusetooloptions" />

#### `CanUseToolOptions`

```typescript theme={null}
type CanUseToolOptions = {
  signal: AbortSignal;
  suggestions?: PermissionUpdate[];
  blockedPath?: string;
  decisionReason?: string;
  decisionReasonType?: PermissionDecisionReasonType;
  classifierApprovable?: boolean;
  title?: string;
  displayName?: string;
  description?: string;
  toolUseID: string;
  agentID?: string;
  exitPlanMode?: ExitPlanModeApprovalDetails;
};
```

| `options` 字段                            | 类型                             | 说明                 |
| :-------------------------------------- | :----------------------------- | :----------------- |
| `signal`                                | `AbortSignal`                  | 取消时被 abort         |
| `suggestions`                           | `PermissionUpdate[]`           | CLI 给出的权限更新建议      |
| `blockedPath`                           | `string`                       | 触发授权的文件路径（仅文件相关场景） |
| `decisionReason`                        | `string`                       | CLI 提供的人类可读授权原因    |
| `decisionReasonType`                    | `PermissionDecisionReasonType` | 权限原因分类             |
| `classifierApprovable`                  | `boolean`                      | 当前调用是否可由运行时分类器自动批准 |
| `title` / `displayName` / `description` | `string`                       | 运行时生成的人类可读授权文案     |
| `toolUseID`                             | `string`                       | 本次工具调用 ID          |
| `agentID`                               | `string`                       | 发起调用的子 Agent ID    |
| `exitPlanMode`                          | `ExitPlanModeApprovalDetails`  | 退出计划模式时的审批详情       |

完整使用与例子见 [权限控制](/zh/cli/sdk/permissions#canusetool)。

<div id="permissionmode" />

### `PermissionMode`

```typescript theme={null}
type PermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'bypassPermissions'
  | 'yolo'
  | 'plan'
  | 'dontAsk'
  | 'auto';
```

| 值                     | 语义                                                                          | 适合场景                |
| :-------------------- | :-------------------------------------------------------------------------- | :------------------ |
| `'default'`           | 标准权限行为。工具调用按 `tools`、allow / deny 规则、动态审批或运行时策略处理                           | 大多数交互式会话            |
| `'acceptEdits'`       | 自动接受文件编辑类操作；其他敏感操作仍按权限流程处理                                                  | 已确认可以修改工作区的会话       |
| `'bypassPermissions'` | 跳过权限检查；必须同时设置 `allowDangerouslySkipPermissions: true`                       | 受信任的自动化或测试环境        |
| `'yolo'`              | `'bypassPermissions'` 的兼容别名；也必须同时设置 `allowDangerouslySkipPermissions: true` | 兼容旧配置，不建议新代码优先使用    |
| `'plan'`              | 计划模式，适合先产出执行计划，默认不执行实际变更                                                    | 规划、设计、审查            |
| `'dontAsk'`           | 不进行交互询问；未预授权、未被规则允许的操作会被拒绝                                                  | 无交互运行环境，或希望失败也不要弹确认 |
| `'auto'`              | 由运行时能力自动判断 allow 或 deny；安全的工作区内文件编辑可能自动放行                                   | 希望减少确认打断，同时保留运行时判断  |

更多权限链路说明见 [权限控制](/zh/cli/sdk/permissions#控制默认策略permissionmode)。

<div id="permissionresult" />

### `PermissionResult`

`CanUseTool` 的返回值。

```typescript theme={null}
type PermissionResult =
  | {
      behavior: 'allow';
      updatedInput?: Record<string, unknown>;
      updatedPermissions?: PermissionUpdate[];
      toolUseID?: string;
      decisionClassification?: PermissionDecisionClassification;
    }
  | {
      behavior: 'deny';
      message: string;
      interrupt?: boolean;
      toolUseID?: string;
      decisionClassification?: PermissionDecisionClassification;
    };
```

`allow.updatedInput` 修改后会替换工具实际收到的入参。`deny.interrupt: true` 拒绝同时中断 Agent。

<div id="mcpserverconfig" />

### `McpServerConfig`

MCP 服务器配置，传给 `Options.mcpServers`。

```typescript theme={null}
type McpServerConfig =
  | McpStdioServerConfig
  | McpSSEServerConfig
  | McpHttpServerConfig
  | McpSdkServerConfigWithInstance;
```

<div id="mcpstdioserverconfig" />

#### `McpStdioServerConfig`

```typescript theme={null}
type McpStdioServerConfig = {
  type?: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
};
```

<div id="mcpsseserverconfig" />

#### `McpSSEServerConfig`

```typescript theme={null}
type McpSSEServerConfig = {
  type: 'sse';
  url: string;
  headers?: Record<string, string>;
};
```

<div id="mcphttpserverconfig" />

#### `McpHttpServerConfig`

```typescript theme={null}
type McpHttpServerConfig = {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
};
```

<div id="mcpsdkserverconfigwithinstance" />

#### `McpSdkServerConfigWithInstance`

```typescript theme={null}
type McpSdkServerConfigWithInstance = {
  type: 'sdk';
  name: string;
  instance: McpServer;
};
```

由 `createSdkMcpServer()` 工厂返回，见 [MCP - In-Process Server](/zh/cli/sdk/mcp#in-process-server推荐)。

<div id="sdkpluginconfig" />

### `SdkPluginConfig`

加载本地插件。

```typescript theme={null}
type SdkPluginConfig = {
  type: 'local';
  path: string;
};
```

| 字段     | 类型        | 说明             |
| :----- | :-------- | :------------- |
| `type` | `'local'` | 当前仅支持 local    |
| `path` | `string`  | 插件目录的绝对路径或相对路径 |

<div id="cloudagentoptions" />

### `CloudAgentOptions`

`Options.experimentalCloudAgent` 的类型。Cloud runtime 的 agent / session 引用配置；完整用法见 [Cloud Agent](/zh/cli/sdk/cloud-agent)。

```typescript theme={null}
type CloudAgentOptions =
  | {
      session: { id: string };
      agent?: never;
      stream?: CloudAgentStreamOptions;
    }
  | {
      agent: CloudAgentReference;
      session: { create: CloudSessionCreateParams };
      stream?: CloudAgentStreamOptions;
    };

type CloudAgentReference =
  | { id: string; create?: never }
  | { create: AgentCreateParams; id?: never };

type CloudAgentStreamOptions = {
  afterId?: string;
  deltaFlushIntervalMs?: number;
};
```

| 字段                            | 类型                                                      | 说明                                   |
| :---------------------------- | :------------------------------------------------------ | :----------------------------------- |
| `agent.id`                    | `string`                                                | 复用已有 Cloud Agent；与 `agent.create` 互斥 |
| `agent.create`                | [`AgentCreateParams`](#agentcreateparams)               | 新建 Cloud Agent；与 `agent.id` 互斥       |
| `session.id`                  | `string`                                                | 复用已有 Cloud session；不允许再传 `agent`     |
| `session.create`              | [`CloudSessionCreateParams`](#cloudsessioncreateparams) | 新建 Cloud session；`environment_id` 必填 |
| `stream.afterId`              | `string`                                                | SSE replay 的起始事件 ID                  |
| `stream.deltaFlushIntervalMs` | `number`                                                | 增量内容的合并 / 刷新间隔（毫秒）                   |

<div id="agentcreateparams" />

### `AgentCreateParams`

新建 Cloud Agent 的请求体，对应 Qoder Cloud OpenAPI 的 agent create 字段。

```typescript theme={null}
type AgentCreateParams = {
  model: string;
  name: string;
  description?: string | null;
  system?: string | null;
  tools?: Array<{
    type: 'agent_toolset_20260401';
    enabled_tools?: Array<
      | 'bash'
      | 'write'
      | 'glob'
      | 'web_fetch'
      | 'read'
      | 'edit'
      | 'grep'
      | 'web_search'
    >;
  }>;
  mcp_servers?: Array<{ name: string; type: 'url'; url: string }>;
  skills?: Array<{ skill_id: string; type: 'custom' }>;
  metadata?: Record<string, string>;
};
```

| 字段            | 类型                       | 说明                                                                            |
| :------------ | :----------------------- | :---------------------------------------------------------------------------- |
| `model`       | `string`                 | 模型标识，可选值：`'auto'` / `'ultimate'` / `'performance'` / `'efficient'` / `'lite'` |
| `name`        | `string`                 | 人类可读的 agent 名称                                                                |
| `description` | `string \| null`         | 描述                                                                            |
| `system`      | `string \| null`         | system prompt                                                                 |
| `tools`       | 见上                       | 内置工具集合，`enabled_tools` 控制白名单                                                  |
| `mcp_servers` | 见上                       | URL 形式的 MCP server 连接                                                         |
| `skills`      | 见上                       | 用户自定义 Skill                                                                   |
| `metadata`    | `Record<string, string>` | 任意 key-value 元数据                                                              |

<div id="cloudsessioncreateparams" />

### `CloudSessionCreateParams`

新建 Cloud session 的请求体。

```typescript theme={null}
type CloudSessionCreateParams = {
  environment_id: string;
  resources?: Array<{ type: 'file'; file_id: string; path?: string }>;
  title?: string | null;
  vault_ids?: Array<string>;
  memory_store_ids?: Array<string>;
};
```

| 字段                 | 类型               | 说明                             |
| :----------------- | :--------------- | :----------------------------- |
| `environment_id`   | `string`         | 容器环境 ID，**必填**                 |
| `resources`        | 见上               | 挂载到 session 容器的资源（当前支持 `file`） |
| `title`            | `string \| null` | 会话标题                           |
| `vault_ids`        | `string[]`       | 凭据 vault ID                    |
| `memory_store_ids` | `string[]`       | memory store ID                |

<div id="sandboxsettings" />

### `SandboxSettings`

沙箱行为配置。

```typescript theme={null}
type SandboxSettings = {
  enabled?: boolean;
  autoAllowBashIfSandboxed?: boolean;
  excludedCommands?: string[];
  allowUnsandboxedCommands?: boolean;
  network?: SandboxNetworkConfig;
  filesystem?: SandboxFilesystemConfig;
  ignoreViolations?: { file?: string[]; network?: string[] };
  enableWeakerNestedSandbox?: boolean;
};
```

| 字段                         | 类型                        | 默认          | 说明                              |
| :------------------------- | :------------------------ | :---------- | :------------------------------ |
| `enabled`                  | `boolean`                 | `false`     | 启用沙箱                            |
| `autoAllowBashIfSandboxed` | `boolean`                 | `true`      | 沙箱启用时自动放行 bash                  |
| `excludedCommands`         | `string[]`                | `[]`        | 静态绕过沙箱的命令（如 `['docker']`）       |
| `allowUnsandboxedCommands` | `boolean`                 | `true`      | 允许模型请求在沙箱外运行命令（落到 `canUseTool`） |
| `network`                  | `SandboxNetworkConfig`    | `undefined` | 网络限制                            |
| `filesystem`               | `SandboxFilesystemConfig` | `undefined` | 文件系统限制                          |
| `ignoreViolations`         | `{ file?, network? }`     | `undefined` | 按 pattern 忽略的违规                 |

<div id="sandboxnetworkconfig" />

#### `SandboxNetworkConfig`

```typescript theme={null}
type SandboxNetworkConfig = {
  allowLocalBinding?: boolean;
  allowUnixSockets?: string[];
  allowAllUnixSockets?: boolean;
  httpProxyPort?: number;
  socksProxyPort?: number;
};
```

<div id="sandboxfilesystemconfig" />

#### `SandboxFilesystemConfig`

```typescript theme={null}
type SandboxFilesystemConfig = {
  allowWrite?: string[];
  denyWrite?: string[];
  denyRead?: string[];
  allowRead?: string[];
  allowManagedReadPathsOnly?: boolean;
};
```

<div id="settingsource" />

### `SettingSource`

控制加载哪些 filesystem settings。

```typescript theme={null}
type SettingSource = 'user' | 'project' | 'local';
```

| 值           | 含义                       | 位置                           |
| :---------- | :----------------------- | :--------------------------- |
| `'user'`    | 用户级全局 settings           | `~/.qoder/settings.json`     |
| `'project'` | 项目共享 settings（版本控制）      | `.qoder/settings.json`       |
| `'local'`   | 项目本地 settings（gitignore） | `.qoder/settings.local.json` |

省略时按 CLI 默认加载所有源；传 `[]` 完全跳过。

<div id="toolconfig" />

### `ToolConfig`

内置工具行为配置。

```typescript theme={null}
type ToolConfig = {
  askUserQuestion?: {
    previewFormat?: 'markdown' | 'html';
  };
};
```

<div id="内置工具列表" />

### 内置工具列表

在 `tools`、`allowedTools`、`disallowedTools`、`canUseTool`、hooks matcher 和 Agent 工具白名单里，内置工具使用下表中的运行时工具名。

| 分类            | 工具名                | 说明               |
| ------------- | ------------------ | ---------------- |
| 命令执行          | `Bash`             | 执行 shell 命令      |
| 文件操作          | `Read`             | 读取文件内容           |
| 文件操作          | `Edit`             | 基于字符串匹配编辑文件      |
| 文件操作          | `Write`            | 创建或覆写文件          |
| 搜索            | `Glob`             | 按文件名模式搜索         |
| 搜索            | `Grep`             | 按内容正则搜索          |
| 网络            | `WebFetch`         | 获取 URL 内容并处理     |
| 网络            | `WebSearch`        | 网络搜索             |
| Agent         | `Agent`            | 调用子 Agent        |
| 交互            | `AskUserQuestion`  | 向用户提问            |
| Notebook      | `NotebookEdit`     | 编辑 Notebook 单元格  |
| 后台任务          | `TaskOutput`       | 向后台任务发送输出        |
| 后台任务          | `TaskStop`         | 停止后台任务           |
| 计划 / worktree | `ExitPlanMode`     | 退出计划模式           |
| 计划 / worktree | `EnterWorktree`    | 进入 git worktree  |
| 计划 / worktree | `ExitWorktree`     | 退出 worktree      |
| 配置            | `Config`           | 读写配置             |
| 待办            | `TodoWrite`        | 管理待办事项           |
| MCP 资源        | `ListMcpResources` | 列出 MCP resources |
| MCP 资源        | `ReadMcpResource`  | 读取 MCP resource  |
| MCP 调用        | `Mcp`              | 通用 MCP 工具调用      |

自定义 MCP 工具名格式：

```text theme={null}
mcp__{serverName}__{toolName}
```

<div id="tool" />

### `tool()`

创建一个类型安全的 SDK MCP 工具定义。

```typescript theme={null}
function tool<Schema extends AnyZodRawShape>(
  name: string,
  description: string,
  inputSchema: Schema,
  handler: (
    args: InferShape<Schema>,
    extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
  ) => Promise<CallToolResult>,
  extras?: ToolExtras,
): SdkMcpToolDefinition<Schema>;
```

| 参数            | 类型                                         | 是否必填 | 语义                          | 当前 Qoder 行为                                                             |
| ------------- | ------------------------------------------ | ---- | --------------------------- | ----------------------------------------------------------------------- |
| `name`        | `string`                                   | 是    | 工具在当前 MCP server 内的唯一标识     | 会组成模型可见的完整工具名 `mcp__{serverName}__{name}`；注册时要求非空                       |
| `description` | `string`                                   | 是    | 给模型看的工具说明，描述工具何时使用、做什么、返回什么 | 会透传到工具列表，直接影响模型是否正确调用；注册时要求非空                                           |
| `inputSchema` | `Schema extends AnyZodRawShape`            | 是    | 定义工具输入参数的 Zod raw shape     | SDK 会据此生成 MCP input schema，并把 handler 的 `args` 推导为 `InferShape<Schema>` |
| `handler`     | `(args, extra) => Promise<CallToolResult>` | 是    | 工具被调用时执行的异步函数               | 模型调用工具时由 SDK 执行；返回值会作为 tool result 传回模型                                 |
| `extras`      | `ToolExtras`                               | 否    | 工具额外元信息，目前用于传 `annotations` | SDK 会把支持的 annotations 注册到 MCP server；不会替代权限配置                           |

`tool()` 本身是定义工具的工厂函数；`name`、`description` 和重复工具名等注册约束由 `createSdkMcpServer()` 在注册工具时校验。

<div id="anyzodrawshape" />

#### `AnyZodRawShape`

```typescript theme={null}
type AnyZodRawShape = ZodRawShapeCompat;
```

`AnyZodRawShape` 兼容 Zod 3 / Zod 4。它表示字段对象，而不是 `z.object(...)`。

<div id="infershape" />

#### `InferShape`

```typescript theme={null}
type InferShape<T extends AnyZodRawShape> = ShapeOutput<T>;
```

`InferShape` 根据 Zod raw shape 推导 handler 的 `args` 类型。

<div id="sdkmcptooldefinition" />

#### `SdkMcpToolDefinition`

```typescript theme={null}
type SdkMcpToolDefinition<
  Schema extends AnyZodRawShape = AnyZodRawShape,
> = {
  name: string;
  description: string;
  inputSchema: Schema;
  annotations?: ToolAnnotations;
  handler: (
    args: InferShape<Schema>,
    extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
  ) => Promise<CallToolResult>;
};
```

<div id="toolextras" />

#### `ToolExtras`

```typescript theme={null}
type ToolExtras = {
  annotations?: ToolAnnotations;
};
```

<div id="toolannotations" />

#### `ToolAnnotations`

```typescript theme={null}
type ToolAnnotations = {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  openWorldHint?: boolean;
};
```

| 字段                | 类型        | 可选 | 语义              | 当前 Qoder 行为                                   |
| ----------------- | --------- | -- | --------------- | --------------------------------------------- |
| `title`           | `string`  | 是  | 工具的人类可读标题       | MCP 元信息；当前不作为已验证的 Qoder 行为能力说明                |
| `readOnlyHint`    | `boolean` | 是  | 标记工具不修改状态       | 当前可观察作用是让只读工具在同一批 tool calls 中具备并发执行条件；不是权限开关 |
| `destructiveHint` | `boolean` | 是  | 标记工具可能执行破坏性更新   | 风险元信息；当前不自动阻止已授权工具执行                          |
| `openWorldHint`   | `boolean` | 是  | 标记工具是否与外部开放世界交互 | 外部交互元信息；当前不自动阻止已授权工具执行                        |

这些字段是元信息和调度提示，不是权限开关。是否允许执行仍由 `tools`、`allowedTools`、`disallowedTools`、`permissionMode`、`canUseTool` 和 hooks 决定。当前功能点文档中列为已验证行为能力的是 `readOnlyHint`、`destructiveHint` 和 `openWorldHint`；`title` 仅按 MCP 元信息保留在类型参考里。

<div id="createsdkmcpserver" />

### `createSdkMcpServer()`

创建一个与 SDK 同进程运行的 MCP server。

```typescript theme={null}
function createSdkMcpServer(
  options: CreateSdkMcpServerOptions,
): McpSdkServerConfigWithInstance;
```

<div id="createsdkmcpserveroptions" />

#### `CreateSdkMcpServerOptions`

```typescript theme={null}
type CreateSdkMcpServerOptions = {
  name: string;
  version?: string;
  tools?: Array<SdkMcpToolDefinition<any>>;
};
```

| 字段        | 默认值         | 说明                                               |
| --------- | ----------- | ------------------------------------------------ |
| `name`    | 必填          | MCP server 名，会进入 `mcp__{serverName}__{toolName}` |
| `version` | `'1.0.0'`   | server 版本信息                                      |
| `tools`   | `undefined` | 注册到该 server 的工具列表                                |

<div id="返回值" />

#### 返回值

返回 `McpSdkServerConfigWithInstance`，可直接作为 `options.mcpServers` 的值。完整 MCP server 配置见 [McpServerConfig](#mcpserverconfig)。

```typescript theme={null}
type McpSdkServerConfigWithInstance = {
  type: 'sdk';
  name: string;
  instance: McpServer;
};
```

<div id="calltoolresult" />

### `CallToolResult`

工具 handler 返回 MCP 协议的 `CallToolResult`。

```typescript theme={null}
type CallToolResult = {
  content: McpToolResultContent[];
  isError?: boolean;
  _meta?: Record<string, unknown>;
};
```

<div id="mcptoolresultcontent" />

#### `McpToolResultContent`

```typescript theme={null}
type McpToolResultContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'audio'; data: string; mimeType: string }
  | {
      type: 'resource_link';
      uri: string;
      name?: string;
      description?: string;
      mimeType?: string;
    }
  | {
      type: 'resource';
      resource: {
        uri: string;
        mimeType?: string;
        text?: string;
        blob?: string;
      };
    };
```

| 字段        | 说明                    |
| --------- | --------------------- |
| `content` | 返回给模型的内容块数组           |
| `isError` | 为 `true` 时表示工具语义上执行失败 |
| `_meta`   | 工具结果元数据，会随 MCP 响应透传   |

<div id="内置工具输入输出类型" />

### 内置工具输入输出类型

SDK 在类型层提供内置工具的输入 / 输出结构。注意：这些是 TypeScript 类型名；权限配置里仍使用上方的运行时工具名。

<div id="agentinput-agentoutput" />

#### `AgentInput` / `AgentOutput`

```typescript theme={null}
type AgentInput = {
  prompt: string;
  agent?: string;
  timeout_ms?: number;
};

type AgentOutput = {
  result: string;
  agent?: string;
  error?: string;
};
```

<div id="bashinput-bashoutput" />

#### `BashInput` / `BashOutput`

```typescript theme={null}
type BashInput = {
  command: string;
  timeout?: number;
  description?: string;
  run_in_background?: boolean;
  dangerouslyDisableSandbox?: boolean;
};

type BashOutput = {
  stdout: string;
  stderr: string;
  exitCode: number;
  interrupted?: boolean;
};
```

<div id="filereadinput-filereadoutput" />

#### `FileReadInput` / `FileReadOutput`

运行时工具名是 `Read`，类型名保留为 `FileReadInput` / `FileReadOutput`。

```typescript theme={null}
type FileReadInput = {
  file_path: string;
  offset?: number;
  limit?: number;
  pages?: string;
};

type FileReadOutput =
  | {
      type: 'text';
      text: string;
      file_path: string;
      totalLines?: number;
    }
  | {
      type: 'image';
      source: {
        type: 'base64';
        media_type: string;
        data: string;
      };
      file_path: string;
    }
  | {
      type: 'notebook';
      cells: Array<{
        cell_number: number;
        cell_type: 'code' | 'markdown' | 'raw';
        source: string;
        outputs?: string[];
      }>;
      file_path: string;
    }
  | {
      type: 'pdf';
      pages: Array<{
        page_number: number;
        content: string;
      }>;
      file_path: string;
      totalPages: number;
    }
  | {
      type: 'parts';
      parts: Array<
        | { type: 'text'; text: string }
        | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
      >;
      file_path: string;
    }
  | {
      type: 'file_unchanged';
      file_path: string;
      message: string;
    };
```

<div id="fileeditinput-fileeditoutput" />

#### `FileEditInput` / `FileEditOutput`

运行时工具名是 `Edit`。

```typescript theme={null}
type FileEditInput = {
  file_path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
};

type FileEditOutput = {
  success: boolean;
  file_path: string;
  diff?: string;
  error?: string;
};
```

<div id="filewriteinput-filewriteoutput" />

#### `FileWriteInput` / `FileWriteOutput`

运行时工具名是 `Write`。

```typescript theme={null}
type FileWriteInput = {
  file_path: string;
  content: string;
};

type FileWriteOutput = {
  success: boolean;
  file_path: string;
  bytesWritten?: number;
  error?: string;
};
```

<div id="globinput-globoutput" />

#### `GlobInput` / `GlobOutput`

```typescript theme={null}
type GlobInput = {
  pattern: string;
  path?: string;
};

type GlobOutput = {
  files: string[];
  totalMatches: number;
  truncated?: boolean;
};
```

<div id="grepinput-grepoutput" />

#### `GrepInput` / `GrepOutput`

```typescript theme={null}
type GrepInput = {
  pattern: string;
  path?: string;
  glob?: string;
  type?: string;
  output_mode?: 'content' | 'files_with_matches' | 'count';
  head_limit?: number;
  offset?: number;
  context?: number;
  '-A'?: number;
  '-B'?: number;
  '-C'?: number;
  '-i'?: boolean;
  '-n'?: boolean;
  multiline?: boolean;
};

type GrepOutput = {
  results: string;
  matchCount: number;
  truncated?: boolean;
};
```

<div id="webfetchinput-webfetchoutput" />

#### `WebFetchInput` / `WebFetchOutput`

```typescript theme={null}
type WebFetchInput = {
  url: string;
  prompt: string;
};

type WebFetchOutput = {
  content: string;
  url: string;
  statusCode?: number;
  error?: string;
  redirectUrl?: string;
};
```

<div id="websearchinput-websearchoutput" />

#### `WebSearchInput` / `WebSearchOutput`

```typescript theme={null}
type WebSearchInput = {
  query: string;
  allowed_domains?: string[];
  blocked_domains?: string[];
};

type WebSearchOutput = {
  results: Array<{
    title: string;
    url: string;
    snippet: string;
  }>;
  query: string;
};
```

<div id="askuserquestioninput-askuserquestionoutput" />

#### `AskUserQuestionInput` / `AskUserQuestionOutput`

```typescript theme={null}
type AskUserQuestionInput = {
  question: string;
  options?: string[];
  default?: string;
};

type AskUserQuestionOutput = {
  answer: string;
};
```

<div id="notebookeditinput-notebookeditoutput" />

#### `NotebookEditInput` / `NotebookEditOutput`

```typescript theme={null}
type NotebookEditInput = {
  notebook_path: string;
  cell_id?: string;
  cell_type?: 'code' | 'markdown';
  new_source: string;
  edit_mode?: 'replace' | 'insert' | 'delete';
};

type NotebookEditOutput = {
  success: boolean;
  notebook_path: string;
  error?: string;
};
```

<div id="taskoutputinput" />

#### `TaskOutputInput`

```typescript theme={null}
type TaskOutputInput = {
  task_id: string;
  output: string;
};
```

<div id="taskstopinput-taskstopoutput" />

#### `TaskStopInput` / `TaskStopOutput`

```typescript theme={null}
type TaskStopInput = {
  task_id: string;
  reason?: string;
};

type TaskStopOutput = {
  success: boolean;
  task_id: string;
  error?: string;
};
```

<div id="exitplanmodeinput-exitplanmodeoutput" />

#### `ExitPlanModeInput` / `ExitPlanModeOutput`

```typescript theme={null}
type ExitPlanModeInput = {
  confirm?: boolean;
};

type ExitPlanModeOutput = {
  success: boolean;
  error?: string;
};
```

<div id="configinput-configoutput" />

#### `ConfigInput` / `ConfigOutput`

```typescript theme={null}
type ConfigInput = {
  action: 'get' | 'set' | 'list';
  key?: string;
  value?: unknown;
  scope?: 'user' | 'project' | 'local';
};

type ConfigOutput = {
  success: boolean;
  value?: unknown;
  values?: Record<string, unknown>;
  error?: string;
};
```

<div id="enterworktreeinput-enterworktreeoutput" />

#### `EnterWorktreeInput` / `EnterWorktreeOutput`

```typescript theme={null}
type EnterWorktreeInput = {
  name?: string;
};

type EnterWorktreeOutput = {
  worktree_path: string;
  branch_name: string;
  success: boolean;
  error?: string;
};
```

<div id="exitworktreeinput-exitworktreeoutput" />

#### `ExitWorktreeInput` / `ExitWorktreeOutput`

```typescript theme={null}
type ExitWorktreeInput = {
  action: 'keep' | 'remove';
  discard_changes?: boolean;
};

type ExitWorktreeOutput = {
  success: boolean;
  error?: string;
  uncommitted_files?: string[];
  unmerged_commits?: string[];
};
```

<div id="todowriteinput-todowriteoutput" />

#### `TodoWriteInput` / `TodoWriteOutput`

```typescript theme={null}
type TodoWriteInput = {
  todos: Array<{
    id?: string;
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
    priority?: 'low' | 'medium' | 'high';
  }>;
};

type TodoWriteOutput = {
  success: boolean;
  todos: Array<{
    id: string;
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
    priority?: 'low' | 'medium' | 'high';
  }>;
  error?: string;
};
```

<div id="listmcpresourcesinput-listmcpresourcesoutput" />

#### `ListMcpResourcesInput` / `ListMcpResourcesOutput`

```typescript theme={null}
type ListMcpResourcesInput = {
  server_name: string;
};

type ListMcpResourcesOutput = {
  resources: Array<{
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
  }>;
  server_name: string;
};
```

<div id="readmcpresourceinput" />

#### `ReadMcpResourceInput`

```typescript theme={null}
type ReadMcpResourceInput = {
  server_name: string;
  uri: string;
};
```

<div id="mcpinput-mcpoutput" />

#### `McpInput` / `McpOutput`

```typescript theme={null}
type McpInput = {
  server_name: string;
  tool_name: string;
  arguments?: Record<string, unknown>;
};

type McpOutput = {
  content: unknown;
  isError?: boolean;
};
```

<div id="toolinputschemas" />

#### `ToolInputSchemas`

```typescript theme={null}
type ToolInputSchemas =
  | AgentInput
  | BashInput
  | FileReadInput
  | FileEditInput
  | FileWriteInput
  | GlobInput
  | GrepInput
  | WebFetchInput
  | WebSearchInput
  | AskUserQuestionInput
  | NotebookEditInput
  | TaskOutputInput
  | TaskStopInput
  | ExitPlanModeInput
  | ConfigInput
  | EnterWorktreeInput
  | ExitWorktreeInput
  | TodoWriteInput
  | ListMcpResourcesInput
  | ReadMcpResourceInput
  | McpInput;
```

<div id="tooloutputschemas" />

#### `ToolOutputSchemas`

```typescript theme={null}
type ToolOutputSchemas =
  | AgentOutput
  | BashOutput
  | FileReadOutput
  | FileEditOutput
  | FileWriteOutput
  | GlobOutput
  | GrepOutput
  | WebFetchOutput
  | WebSearchOutput
  | AskUserQuestionOutput
  | NotebookEditOutput
  | TaskStopOutput
  | ExitPlanModeOutput
  | ConfigOutput
  | EnterWorktreeOutput
  | ExitWorktreeOutput
  | TodoWriteOutput
  | ListMcpResourcesOutput
  | McpOutput;
```

***

<div id="hooks-reference" />

## Hooks Reference

使用指南和示例见 [Hooks](/zh/cli/sdk/hooks)。

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

```typescript theme={null}
type HookEvent =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'UserPromptSubmit'
  | 'SessionStart'
  | 'SessionEnd'
  | 'Stop'
  | 'SubagentStart'
  | 'SubagentStop'
  | 'PreCompact'
  | 'PostCompact'
  | 'CwdChanged'
  | 'InstructionsLoaded'
  | 'FileChanged'
  | 'PermissionRequest';
```

<div id="hookcallback" />

### `HookCallback`

```typescript theme={null}
type HookCallback = (
  input: HookInput,
  toolUseID: string | undefined,
  options: { signal: AbortSignal }
) => Promise<HookJSONOutput>;
```

<div id="hookcallbackmatcher" />

### `HookCallbackMatcher`

```typescript theme={null}
interface HookCallbackMatcher {
  matcher?: string;
  hooks: HookCallback[];
  timeout?: number;
}
```

| 字段        | 类型               | 说明                       |
| :-------- | :--------------- | :----------------------- |
| `matcher` | `string`         | 可选正则，按 `tool_name` 等字段过滤 |
| `hooks`   | `HookCallback[]` | 匹配时执行的回调列表               |
| `timeout` | `number`         | 可选，超时时间（秒），默认 60         |

<div id="basehookinput" />

### `BaseHookInput`

所有 hook 事件的通用输入字段。

```typescript theme={null}
interface BaseHookInput {
  hook_event_name: string;
  session_id: string;
  transcript_path: string;
  cwd: string;
}
```

| 字段                | 类型       | 说明                        |
| :---------------- | :------- | :------------------------ |
| `hook_event_name` | `string` | 事件类型标识符（如 `"PreToolUse"`） |
| `session_id`      | `string` | 当前会话的唯一标识符                |
| `transcript_path` | `string` | 会话记录文件路径（JSONL 格式）        |
| `cwd`             | `string` | 会话的当前工作目录                 |

<div id="hookjsonoutput" />

### `HookJSONOutput`

Hook 回调的返回类型。

```typescript theme={null}
interface HookJSONOutput {
  continue?: boolean;
  stopReason?: string;
  decision?: string;
  reason?: string;
  hookSpecificOutput?: object;
}
```

| 字段                   | 类型        | 默认值    | 说明                                                                                                              |
| :------------------- | :-------- | :----- | :-------------------------------------------------------------------------------------------------------------- |
| `continue`           | `boolean` | `true` | 设为 `false` 可终止会话。仅对 `PreToolUse`、`PostToolUse`、`PostToolUseFailure`、`UserPromptSubmit`、`Stop`、`SubagentStop` 有效 |
| `stopReason`         | `string`  | —      | 停止会话的可读原因（与 `continue: false` 配合）                                                                               |
| `decision`           | `string`  | —      | `"approve"` 或 `"block"`。`"block"` 阻止工具执行；对 `Stop` 事件，`"block"` 阻止停止并强制继续                                        |
| `reason`             | `string`  | —      | 决策原因（展示给模型；`Stop` 事件的 `"block"` 决策时作为续接提示注入上下文）                                                                 |
| `hookSpecificOutput` | `object`  | —      | 事件专属输出（见各事件类型）                                                                                                  |

> 当多个 hook 返回冲突的 `decision` 值时，`"deny"` / `"block"` 优先（最严格规则生效）。

***

<div id="pretoolusehookinput" />

### `PreToolUseHookInput`

```typescript theme={null}
interface PreToolUseHookInput extends BaseHookInput {
  hook_event_name: 'PreToolUse';
  permission_mode: string | undefined;
  tool_name: string;
  tool_input: unknown;
}
```

| 字段                | 类型                    | 说明       |
| :---------------- | :-------------------- | :------- |
| `permission_mode` | `string \| undefined` | 会话当前权限模式 |
| `tool_name`       | `string`              | 被调用工具名称  |
| `tool_input`      | `unknown`             | 传入工具的参数  |

**`hookSpecificOutput`：**

| 字段                         | 类型                        | 说明                                         |
| :------------------------- | :------------------------ | :----------------------------------------- |
| `hookEventName`            | `"PreToolUse"`            | 必须设置                                       |
| `permissionDecision`       | `string`                  | `"allow"` / `"deny"` / `"ask"` / `"defer"` |
| `permissionDecisionReason` | `string`                  | 权限决策原因                                     |
| `updatedInput`             | `Record<string, unknown>` | 修改后的工具输入，替换原始 `tool_input`                 |
| `additionalContext`        | `string`                  | 注入到模型下一轮的额外上下文                             |

<div id="posttoolusehookinput" />

### `PostToolUseHookInput`

```typescript theme={null}
interface PostToolUseHookInput extends BaseHookInput {
  hook_event_name: 'PostToolUse';
  tool_name: string;
  tool_input: unknown;
  tool_response: unknown;
}
```

| 字段              | 类型        | 说明      |
| :-------------- | :-------- | :------ |
| `tool_name`     | `string`  | 被调用工具名称 |
| `tool_input`    | `unknown` | 传入工具的参数 |
| `tool_response` | `unknown` | 工具的执行结果 |

**输出行为：**

| 字段                                     | 位置     | 行为                                 |
| :------------------------------------- | :----- | :--------------------------------- |
| `hookSpecificOutput.updatedToolOutput` | 事件专属输出 | **覆盖** `tool_response`；模型只能看到覆盖后的值 |
| `hookSpecificOutput.additionalContext` | 事件专属输出 | **追加**补充上下文，不修改原始结果                |
| `decision: "block"` + `reason`         | 顶层输出   | 阻止 agent 进一步处理该工具结果                |

**`hookSpecificOutput`：**

| 字段                  | 类型              | 说明             |
| :------------------ | :-------------- | :------------- |
| `hookEventName`     | `"PostToolUse"` | 必须设置           |
| `updatedToolOutput` | `string`        | 覆盖工具响应内容       |
| `additionalContext` | `string`        | 附加在工具结果旁的额外上下文 |

> 当多个 hook 都设置了 `updatedToolOutput` 时，**最后一个非空值**生效。如需链式转换，请在单个回调内按顺序执行。

<div id="posttoolusefailurehookinput" />

### `PostToolUseFailureHookInput`

```typescript theme={null}
interface PostToolUseFailureHookInput extends BaseHookInput {
  hook_event_name: 'PostToolUseFailure';
  tool_name: string;
  tool_input: unknown;
  error: string;
  is_interrupt: boolean | undefined;
}
```

| 字段             | 类型                     | 说明         |
| :------------- | :--------------------- | :--------- |
| `tool_name`    | `string`               | 执行失败的工具名称  |
| `tool_input`   | `unknown`              | 传入工具的参数    |
| `error`        | `string`               | 错误信息       |
| `is_interrupt` | `boolean \| undefined` | 是否由中断/中止引起 |

<div id="userpromptsubmithookinput" />

### `UserPromptSubmitHookInput`

```typescript theme={null}
interface UserPromptSubmitHookInput extends BaseHookInput {
  hook_event_name: 'UserPromptSubmit';
  prompt: string;
}
```

| 字段       | 类型       | 说明      |
| :------- | :------- | :------ |
| `prompt` | `string` | 用户输入的文本 |

**`hookSpecificOutput`：**

| 字段                  | 类型                   | 说明                  |
| :------------------ | :------------------- | :------------------ |
| `hookEventName`     | `"UserPromptSubmit"` | 必须设置                |
| `additionalContext` | `string`             | 追加到用户 prompt 的额外上下文 |

<div id="sessionstarthookinput" />

### `SessionStartHookInput`

```typescript theme={null}
interface SessionStartHookInput extends BaseHookInput {
  hook_event_name: 'SessionStart';
  source: string;
}
```

| 字段       | 类型       | 说明                                                        |
| :------- | :------- | :-------------------------------------------------------- |
| `source` | `string` | 会话启动原因：`"startup"` / `"resume"` / `"clear"` / `"compact"` |

**`hookSpecificOutput`：**

| 字段                  | 类型               | 说明           |
| :------------------ | :--------------- | :----------- |
| `hookEventName`     | `"SessionStart"` | 必须设置         |
| `additionalContext` | `string`         | 在会话开始时注入的上下文 |

<div id="sessionendhookinput" />

### `SessionEndHookInput`

```typescript theme={null}
interface SessionEndHookInput extends BaseHookInput {
  hook_event_name: 'SessionEnd';
  reason: string;
}
```

| 字段       | 类型       | 说明                                                                                                               |
| :------- | :------- | :--------------------------------------------------------------------------------------------------------------- |
| `reason` | `string` | 会话结束原因：`"clear"` / `"resume"` / `"logout"` / `"prompt_input_exit"` / `"other"` / `"bypass_permissions_disabled"` |

<div id="stophookinput" />

### `StopHookInput`

```typescript theme={null}
interface StopHookInput extends BaseHookInput {
  hook_event_name: 'Stop';
  stop_hook_active: boolean;
}
```

| 字段                 | 类型        | 说明                 |
| :----------------- | :-------- | :----------------- |
| `stop_hook_active` | `boolean` | Stop hook 是否正在阻止停止 |

返回 `{ decision: 'block', reason: '...' }` 可阻止 AI 停止并强制继续。`reason` 作为续接提示注入模型上下文。

<div id="subagentstarthookinput" />

### `SubagentStartHookInput`

```typescript theme={null}
interface SubagentStartHookInput extends BaseHookInput {
  hook_event_name: 'SubagentStart';
  agent_id: string;
  agent_type: string;
}
```

| 字段           | 类型       | 说明               |
| :----------- | :------- | :--------------- |
| `agent_id`   | `string` | 子 Agent 实例的唯一标识符 |
| `agent_type` | `string` | 子 Agent 的类型/角色   |

<div id="subagentstophookinput" />

### `SubagentStopHookInput`

```typescript theme={null}
interface SubagentStopHookInput extends BaseHookInput {
  hook_event_name: 'SubagentStop';
  stop_hook_active: boolean;
}
```

| 字段                 | 类型        | 说明                 |
| :----------------- | :-------- | :----------------- |
| `stop_hook_active` | `boolean` | Stop hook 是否正在阻止停止 |

<div id="precompacthookinput" />

### `PreCompactHookInput`

```typescript theme={null}
interface PreCompactHookInput extends BaseHookInput {
  hook_event_name: 'PreCompact';
  trigger: string;
  custom_instructions: string | null;
}
```

| 字段                    | 类型               | 说明                         |
| :-------------------- | :--------------- | :------------------------- |
| `trigger`             | `string`         | 触发原因：`"manual"` / `"auto"` |
| `custom_instructions` | `string \| null` | 压缩摘要的自定义指令                 |

<div id="postcompacthookinput" />

### `PostCompactHookInput`

```typescript theme={null}
interface PostCompactHookInput extends BaseHookInput {
  hook_event_name: 'PostCompact';
  trigger: string;
  compact_summary: string;
}
```

| 字段                | 类型       | 说明                         |
| :---------------- | :------- | :------------------------- |
| `trigger`         | `string` | 触发原因：`"manual"` / `"auto"` |
| `compact_summary` | `string` | 压缩上下文后生成的摘要                |

<div id="cwdchangedhookinput" />

### `CwdChangedHookInput`

```typescript theme={null}
interface CwdChangedHookInput extends BaseHookInput {
  hook_event_name: 'CwdChanged';
  old_cwd: string;
  new_cwd: string;
}
```

| 字段        | 类型       | 说明       |
| :-------- | :------- | :------- |
| `old_cwd` | `string` | 变更前的工作目录 |
| `new_cwd` | `string` | 变更后的工作目录 |

<div id="instructionsloadedhookinput" />

### `InstructionsLoadedHookInput`

```typescript theme={null}
interface InstructionsLoadedHookInput extends BaseHookInput {
  hook_event_name: 'InstructionsLoaded';
  load_reason: string;
}
```

| 字段            | 类型       | 说明                                              |
| :------------ | :------- | :---------------------------------------------- |
| `load_reason` | `string` | 加载原因：`"nested_traversal"` / `"path_glob_match"` |

<div id="filechangedhookinput" />

### `FileChangedHookInput`

```typescript theme={null}
interface FileChangedHookInput extends BaseHookInput {
  hook_event_name: 'FileChanged';
  file_path: string;
  event: string;
}
```

| 字段          | 类型       | 说明                                       |
| :---------- | :------- | :--------------------------------------- |
| `file_path` | `string` | 发生变更的文件路径                                |
| `event`     | `string` | 文件系统事件：`"change"` / `"add"` / `"unlink"` |

<div id="permissionrequesthookinput" />

### `PermissionRequestHookInput`

```typescript theme={null}
interface PermissionRequestHookInput extends BaseHookInput {
  hook_event_name: 'PermissionRequest';
  tool_name: string;
  tool_input: unknown;
  permission_suggestions: PermissionUpdate[] | undefined;
}
```

| 字段                       | 类型                                | 说明      |
| :----------------------- | :-------------------------------- | :------ |
| `tool_name`              | `string`                          | 申请权限的工具 |
| `tool_input`             | `unknown`                         | 工具输入参数  |
| `permission_suggestions` | `PermissionUpdate[] \| undefined` | 建议的权限规则 |

**`hookSpecificOutput`：**

| 字段              | 类型                    | 说明        |
| :-------------- | :-------------------- | :-------- |
| `hookEventName` | `"PermissionRequest"` | 必须设置      |
| `decision`      | `object`              | 权限决策（见下方） |

`decision` 为以下两种之一：

* **批准：** `{ behavior: "allow", updatedInput?: Record<string, unknown>, updatedPermissions?: PermissionUpdate[] }`
* **拒绝：** `{ behavior: "deny", message?: string }`

<div id="message-types" />

## Message Types

<div id="sdkmessage" />

### `SDKMessage`

`Query` 流出的所有消息的判别联合。

```typescript theme={null}
type SDKMessage =
  | SDKAssistantMessage
  | SDKUserMessage
  | SDKUserMessageReplay
  | SDKResultMessage
  | SDKSystemMessage
  | SDKPartialAssistantMessage
  | SDKCompactBoundaryMessage
  | SDKStatusMessage
  | SDKMcpStatusChangeMessage
  | SDKAPIRetryMessage
  | SDKLocalCommandOutputMessage
  | SDKHookStartedMessage
  | SDKHookProgressMessage
  | SDKHookResponseMessage
  | SDKTaskStartedMessage
  | SDKTaskProgressMessage
  | SDKTaskNotificationMessage
  | SDKSessionStateChangedMessage
  | SDKSessionTitleChangedMessage
  | SDKBridgeStateMessage
  | SDKFilesPersistedEvent
  | SDKElicitationCompleteMessage
  | SDKPermissionDeniedMessage
  | SDKPromptSuggestionMessage
  | SDKCloudAgentEventMessage;
```

调用方应先按 `message.type` 分支，再按 `subtype` 进一步分流（仅 `system` / `result` 类型有 subtype）。

<div id="sdkassistantmessage" />

### `SDKAssistantMessage`

AI 的完整回复，按 turn 触达一次。

```typescript theme={null}
type SDKAssistantMessage = {
  type: 'assistant';
  uuid: string;
  session_id: string;
  parent_tool_use_id: string | null;
  message: {
    role: 'assistant';
    content: Array<
      | { type: 'text'; text: string }
      | { type: 'tool_use'; id: string; name: string; input: unknown }
      | { type: 'thinking'; thinking: string }
    >;
  };
};
```

<div id="sdkusermessage" />

### `SDKUserMessage`

用户消息或工具结果回灌。

```typescript theme={null}
type SDKUserMessage = {
  type: 'user';
  uuid?: string;
  session_id?: string;
  parent_tool_use_id: string | null;
  message: {
    role: 'user';
    content: Array<
      | { type: 'text'; text: string }
      | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
      | { type: 'tool_result'; tool_use_id: string; content: string | unknown[]; is_error?: boolean }
    >;
  };
  isSynthetic?: boolean;
  tool_use_result?: unknown;
};
```

<div id="sdkusermessagereplay" />

### `SDKUserMessageReplay`

会话恢复时回放的历史用户消息。

```typescript theme={null}
type SDKUserMessageReplay = SDKUserMessage & {
  uuid: string;
  session_id: string;
  isReplay: true;
};
```

<div id="sdkresultmessage" />

### `SDKResultMessage`

整个会话结束时的最终消息。

```typescript theme={null}
type SDKResultMessage =
  | {
      type: 'result';
      subtype: 'success';
      uuid: string;
      session_id: string;
      duration_ms: number;
      duration_api_ms: number;
      is_error: boolean;
      num_turns: number;
      result: string;
      permission_denials: SDKPermissionDenial[];
    }
  | {
      type: 'result';
      subtype:
        | 'error_max_turns'
        | 'error_during_execution'
        | 'error_max_structured_output_retries';
      // Same shared fields as success.
      errors: string[];
    };
```

<div id="sdksystemmessage" />

### `SDKSystemMessage`

会话初始化消息（`subtype: 'init'`）。其他系统事件通过单独的消息类型送达，见下方各 `SDK*Message`。

```typescript theme={null}
type SDKSystemMessage = {
  type: 'system';
  subtype: 'init';
  uuid: string;
  session_id: string;
  qodercli_version: string;
  protocol_version?: string;
  apiKeySource: 'user' | 'project' | 'org' | 'temporary';
  cwd: string;
  model: string;
  permissionMode: PermissionMode;
  tools: string[];
  slash_commands: string[];
  output_style: string;
  agents?: string[];
  skills: string[];
  plugins: { name: string; path: string; source?: string }[];
  mcp_servers: { name: string; status: string }[];
  fast_mode_state?: 'off' | 'cooldown' | 'on';
};
```

<div id="sdkpartialassistantmessage" />

### `SDKPartialAssistantMessage`

需启用 `includePartialMessages: true`，按 token 增量流出。完整用法见 [流式输出](/zh/cli/sdk/streaming-output)。

```typescript theme={null}
type SDKPartialAssistantMessage = {
  type: 'stream_event';
  uuid: string;
  session_id: string;
  parent_tool_use_id: string | null;
  event: {
    type: string;
    index?: number;
    delta?: {
      type?: string;
      text?: string;
      partial_json?: string;
      thinking?: string;
    };
    content_block?: {
      type: string;
      id?: string;
      name?: string;
      text?: string;
    };
  };
};
```

<div id="sdkcompactboundarymessage" />

### `SDKCompactBoundaryMessage`

上下文压缩完成的边界标记。

```typescript theme={null}
type SDKCompactBoundaryMessage = {
  type: 'system';
  subtype: 'compact_boundary';
  uuid: string;
  session_id: string;
  compact_metadata: {
    trigger: 'manual' | 'auto';
    pre_tokens: number;
    preserved_segment?: {
      head_uuid: string;
      anchor_uuid: string;
      tail_uuid: string;
    };
  };
};
```

<div id="sdkstatusmessage" />

### `SDKStatusMessage`

会话运行状态变化（如压缩中）。

```typescript theme={null}
type SDKStatusMessage = {
  type: 'system';
  subtype: 'status';
  status: 'compacting' | null;
  permissionMode?: PermissionMode;
  uuid: string;
  session_id: string;
};
```

<div id="sdkmcpstatuschangemessage" />

### `SDKMcpStatusChangeMessage`

MCP 连接池状态变化。

```typescript theme={null}
type SDKMcpStatusChangeMessage = {
  type: 'system';
  subtype: 'mcp_status_change';
  servers: McpServerStatus[];
  uuid: string;
  session_id: string;
};
```

<div id="sdkapiretrymessage" />

### `SDKAPIRetryMessage`

网络/服务异常时的自动重试。

```typescript theme={null}
type SDKAPIRetryMessage = {
  type: 'system';
  subtype: 'api_retry';
  attempt: number;
  max_retries: number;
  retry_delay_ms: number;
  error_status: number | null;
  error: SDKAssistantMessageError;
  uuid: string;
  session_id: string;
};
```

<div id="sdklocalcommandoutputmessage" />

### `SDKLocalCommandOutputMessage`

本地 slash command 的输出。

```typescript theme={null}
type SDKLocalCommandOutputMessage = {
  type: 'system';
  subtype: 'local_command_output';
  content: string;
  uuid: string;
  session_id: string;
};
```

<div id="sdkhookstartedmessage" />

### `SDKHookStartedMessage`

Hook 开始执行。

```typescript theme={null}
type SDKHookStartedMessage = {
  type: 'system';
  subtype: 'hook_started';
  hook_id: string;
  hook_name: string;
  hook_event: string;
  uuid: string;
  session_id: string;
};
```

<div id="sdkhookprogressmessage" />

### `SDKHookProgressMessage`

Hook 执行中输出。

```typescript theme={null}
type SDKHookProgressMessage = {
  type: 'system';
  subtype: 'hook_progress';
  hook_id: string;
  hook_name: string;
  hook_event: string;
  stdout: string;
  stderr: string;
  output: string;
  uuid: string;
  session_id: string;
};
```

<div id="sdkhookresponsemessage" />

### `SDKHookResponseMessage`

Hook 结束。

```typescript theme={null}
type SDKHookResponseMessage = {
  type: 'system';
  subtype: 'hook_response';
  hook_id: string;
  hook_name: string;
  hook_event: string;
  output: string;
  stdout: string;
  stderr: string;
  exit_code?: number;
  outcome: 'success' | 'error' | 'cancelled';
  uuid: string;
  session_id: string;
};
```

<div id="sdktaskstartedmessage" />

### `SDKTaskStartedMessage`

子 Agent 任务启动。

```typescript theme={null}
type SDKTaskStartedMessage = {
  type: 'system';
  subtype: 'task_started';
  task_id: string;
  tool_use_id?: string;
  description: string;
  task_type?: string;
  workflow_name?: string;
  prompt?: string;
  uuid: string;
  session_id: string;
};
```

<div id="sdktaskprogressmessage" />

### `SDKTaskProgressMessage`

子 Agent 任务进度。

```typescript theme={null}
type SDKTaskProgressMessage = {
  type: 'system';
  subtype: 'task_progress';
  task_id: string;
  tool_use_id?: string;
  description: string;
  usage: {
    total_tokens: number;
    tool_uses: number;
    duration_ms: number;
  };
  last_tool_name?: string;
  summary?: string;
  uuid: string;
  session_id: string;
};
```

<div id="sdktasknotificationmessage" />

### `SDKTaskNotificationMessage`

子 Agent 任务结束。

```typescript theme={null}
type SDKTaskNotificationMessage = {
  type: 'system';
  subtype: 'task_notification';
  task_id: string;
  tool_use_id?: string;
  status: 'completed' | 'failed' | 'stopped';
  output_file: string;
  summary: string;
  usage?: {
    total_tokens: number;
    tool_uses: number;
    duration_ms: number;
  };
  uuid: string;
  session_id: string;
};
```

<div id="sdksessionstatechangedmessage" />

### `SDKSessionStateChangedMessage`

主会话运行状态变化。

```typescript theme={null}
type SDKSessionStateChangedMessage = {
  type: 'system';
  subtype: 'session_state_changed';
  state: 'idle' | 'running' | 'requires_action';
  uuid: string;
  session_id: string;
};
```

<div id="sdksessiontitlechangedmessage" />

### `SDKSessionTitleChangedMessage`

会话标题变化。

```typescript theme={null}
type SDKSessionTitleChangedMessage = {
  type: 'system';
  subtype: 'session_title_changed';
  title: string;
  source: 'ai' | 'custom';
  revision: number;
  uuid: string;
  session_id: string;
};
```

<div id="sdkbridgestatemessage" />

### `SDKBridgeStateMessage`

Bridge 连接状态变化。

```typescript theme={null}
type SDKBridgeStateMessage = {
  type: 'system';
  subtype: 'bridge_state';
  state: string;
  detail?: string;
  uuid: string;
  session_id: string;
};
```

<div id="sdkfilespersistedevent" />

### `SDKFilesPersistedEvent`

文件 checkpoint 持久化结果。

```typescript theme={null}
type SDKFilesPersistedEvent = {
  type: 'system';
  subtype: 'files_persisted';
  files: { filename: string; file_id: string }[];
  failed: { filename: string; error: string }[];
  processed_at: string;
  uuid: string;
  session_id: string;
};
```

<div id="sdkelicitationcompletemessage" />

### `SDKElicitationCompleteMessage`

MCP elicitation 完成。

```typescript theme={null}
type SDKElicitationCompleteMessage = {
  type: 'system';
  subtype: 'elicitation_complete';
  mcp_server_name: string;
  elicitation_id: string;
  uuid: string;
  session_id: string;
};
```

<div id="sdkpermissiondeniedmessage" />

### `SDKPermissionDeniedMessage`

工具调用被权限策略短路拒绝（`dontAsk` / `auto` / deny rule 等）。

```typescript theme={null}
type SDKPermissionDeniedMessage = {
  type: 'system';
  subtype: 'permission_denied';
  tool_name: string;
  tool_use_id: string;
  agent_id?: string;
  decision_reason_type?: string;
  decision_reason?: string;
  message: string;
  uuid: string;
  session_id: string;
};
```

<div id="sdkpromptsuggestionmessage" />

### `SDKPromptSuggestionMessage`

启用 `promptSuggestions: true` 后，每轮 result 后可能收到的下一步建议。

```typescript theme={null}
type SDKPromptSuggestionMessage = {
  type: 'prompt_suggestion';
  suggestion: string;
  uuid: string;
  session_id: string;
};
```

<div id="sdkcloudagenteventmessage" />

### `SDKCloudAgentEventMessage`

Cloud runtime（`options.experimentalCloudAgent`）下，从 Qoder Cloud session SSE 流转发的事件。完整用法见 [Cloud Agent](/zh/cli/sdk/cloud-agent)。

```typescript theme={null}
type SDKCloudAgentEventMessage = {
  type: 'cloud_agent_event';
  event: string;
  id?: string;
  data: unknown;
  uuid: string;
  session_id: string;
};
```

| 字段           | 类型        | 说明                                                               |
| :----------- | :-------- | :--------------------------------------------------------------- |
| `event`      | `string`  | Cloud 事件名，如 `user.message`、`agent.message`、`session.status_idle` |
| `id`         | `string`  | SSE 事件 ID，可作为 `stream.afterId` 的 replay 起点                       |
| `data`       | `unknown` | Cloud 事件 payload（含 `turn_id` 等字段）                                |
| `session_id` | `string`  | 所属 Cloud session ID                                              |

<div id="sdkpermissiondenial" />

### `SDKPermissionDenial`

`SDKResultMessage.permission_denials` 数组中的元素。

```typescript theme={null}
type SDKPermissionDenial = {
  tool_name: string;
  tool_use_id: string;
  tool_input: Record<string, unknown>;
};
```


0