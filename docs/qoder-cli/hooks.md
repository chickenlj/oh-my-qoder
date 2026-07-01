> ## Documentation Index
> Fetch the complete documentation index at: https://docs.qoder.com/llms.txt
> Use this file to discover all available pages before exploring further.

# 钩子

Hooks 允许在 Qoder CLI 的关键节点介入 Agent 的主执行流，同时与 CLI 保持解耦。常见用途包括：工具执行前拦截危险操作、任务完成后发送桌面通知、写文件后自动跑 lint 等。

Hooks 通过 JSON 配置文件定义，不需要修改代码，编辑配置文件即可生效。

## 快速开始

以下示例演示如何用 Hook 拦截危险命令——当 Agent 尝试执行 `rm -rf` 时自动阻止。

**第一步：创建脚本**

```bash theme={null}
mkdir -p ~/.qoder/hooks
cat > ~/.qoder/hooks/block-rm.sh << 'EOF'
#!/bin/bash
input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command')

if echo "$command" | grep -q 'rm -rf'; then
  echo "危险命令已被阻止: $command" >&2
  exit 2
fi

exit 0
EOF
chmod +x ~/.qoder/hooks/block-rm.sh
```

**第二步：编辑配置文件**

在 `~/.qoder/settings.json` 中添加：

```json theme={null}
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "~/.qoder/hooks/block-rm.sh"
          }
        ]
      }
    ]
  }
}
```

**第三步：验证效果**

启动 Qoder CLI，让 Agent 执行包含 `rm -rf` 的命令，Hook 会阻止执行并提示 Agent。

## 配置

### 配置文件位置

Hook 配置从以下三个文件加载，三个来源都会**合并执行**（同事件下的 hook 不互相覆盖）：

```
~/.qoder/settings.json                    # 用户级，对所有项目生效
${project}/.qoder/settings.json           # 项目级，对当前项目生效，可提交 git 共享给团队
${project}/.qoder/settings.local.json     # 项目级（本地），建议加到 .gitignore
```

### 配置格式

```json theme={null}
{
  "hooks": {
    "事件名": [
      {
        "matcher": "匹配条件",
        "hooks": [
          {
            "type": "command",
            "command": "要执行的命令",
            "timeout": 600
          }
        ]
      }
    ]
  }
}
```

一个事件下可以配置多个 matcher 分组，每个分组可以包含多个 hook 条目。

**分组（HookDefinition）字段**：

| 字段        | 必填 | 说明                                                         |
| --------- | -- | ---------------------------------------------------------- |
| `matcher` | 否  | 匹配条件，不填则匹配所有                                               |
| `hooks`   | 是  | 该分组下的 hook 条目数组                                            |
| `async`   | 否  | 设为 `true` 时，该分组下所有 hook 在后台执行，不阻塞当前操作；结果在下一轮模型对话中作为附加上下文注入 |

### Hook 条目类型

每个 hook 条目通过 `type` 字段声明类型，不同类型有各自的字段。

#### command（执行 shell 命令）

```json theme={null}
{
  "type": "command",
  "command": "~/.qoder/hooks/check.sh",
  "timeout": 600,
  "shell": "bash",
  "env": { "FOO": "bar" }
}
```

| 字段              | 必填 | 说明                                                                               |
| --------------- | -- | -------------------------------------------------------------------------------- |
| `command`       | 是  | 要执行的 shell 命令                                                                    |
| `timeout`       | 否  | 超时时间（秒），默认 600                                                                   |
| `shell`         | 否  | 指定 shell，可选 `"bash"` 或 `"powershell"`；不填则使用系统默认 shell                            |
| `env`           | 否  | 额外环境变量，会与系统环境合并                                                                  |
| `if`            | 否  | 条件过滤，格式为 `"ToolName"` 或 `"ToolName(arg_pattern)"`，仅在工具名/参数匹配时触发                  |
| `async`         | 否  | 设为 `true` 时该 hook 单独后台执行，覆盖分组级 `async`                                           |
| `asyncRewake`   | 否  | 设为 `true` 时后台执行；若以 exit 2 退出，会用 stderr/stdout/error 内容生成一条系统提醒并唤醒模型继续处理，常用于长耗时检查 |
| `rewakeMessage` | 否  | 配合 `asyncRewake`，覆盖注入消息的前缀                                                       |
| `rewakeSummary` | 否  | 配合 `asyncRewake`，覆盖一行摘要（最长 300 字符）                                               |
| `once`          | 否  | 设为 `true` 时该 hook 在首次成功执行后从注册表移除，仅对会话级 hook 生效                                   |
| `statusMessage` | 否  | 自定义状态行/spinner 中显示的描述                                                            |

#### http（发送 HTTP 请求）

将 hook 输入以 JSON POST 至指定 URL，期望响应也是 JSON HookOutput。

```json theme={null}
{
  "type": "http",
  "url": "https://example.com/hook",
  "headers": { "Authorization": "Bearer ${MY_TOKEN}" },
  "timeout": 600
}
```

| 字段                              | 必填 | 说明                               |
| ------------------------------- | -- | -------------------------------- |
| `url`                           | 是  | 接收 POST 的 URL                    |
| `headers`                       | 否  | 自定义请求头，值支持 `${ENV_VAR}` 插值       |
| `allowedEnvVars`                | 否  | 限制 `headers` 可插值的环境变量白名单；不填则允许所有 |
| `timeout`                       | 否  | 超时时间（秒），默认 600                   |
| `if` / `once` / `statusMessage` | 否  | 同 command                        |

#### prompt（单次模型调用）

通过单轮模型对话评估 hook 事件，模型按提示词返回 `{ ok, reason }`：`ok=true` 视为允许，`ok=false` 视为阻塞，`reason` 在阻塞时作为说明返回给 Agent。

```json theme={null}
{
  "type": "prompt",
  "prompt": "判断该命令是否安全，需要在不安全时返回 ok=false 并给出 reason",
  "model": "haiku",
  "timeout": 30
}
```

| 字段                              | 必填 | 说明                    |
| ------------------------------- | -- | --------------------- |
| `prompt`                        | 是  | 提示词模板，会附带序列化的 hook 输入 |
| `model`                         | 否  | 覆盖模型，不填则使用会话默认模型      |
| `timeout`                       | 否  | 超时时间（秒），默认 30         |
| `if` / `once` / `statusMessage` | 否  | 同 command             |

#### agent（子 Agent 校验）

启动一个子 Agent 来核查条件。子 Agent 必须调用 `StructuredOutput` 工具返回 `{ ok: boolean, reason?: string }`：`ok=true` 视为允许，`ok=false` 视为阻塞。

```json theme={null}
{
  "type": "agent",
  "prompt": "审查以下变更：$ARGUMENTS",
  "tools": ["Read", "Grep"],
  "maxTurns": 50,
  "timeout": 60
}
```

| 字段                              | 必填 | 说明                                                                             |
| ------------------------------- | -- | ------------------------------------------------------------------------------ |
| `prompt`                        | 是  | 校验提示词，支持 `$ARGUMENTS` 占位符（自动替换为 hook 输入 JSON）                                  |
| `tools`                         | 否  | 子 Agent 允许使用的工具白名单。不填则继承全部可用工具，但会自动过滤不适合在 hook 中使用的工具（如递归调用 Agent、计划模式、交互式提问等） |
| `maxTurns`                      | 否  | 最多 agent 轮次，默认 50                                                              |
| `model`                         | 否  | 覆盖模型                                                                           |
| `timeout`                       | 否  | 超时时间（秒），默认 60                                                                  |
| `if` / `once` / `statusMessage` | 否  | 同 command                                                                      |

### matcher 与 `if` 匹配规则

`matcher`（分组级）用于过滤 hook 的触发范围。匹配的字段因事件而异（详见各事件说明），常见的有工具名、事件 trigger、来源等：

| 写法        | 含义    | 示例                              |
| --------- | ----- | ------------------------------- |
| 不填或 `"*"` | 匹配所有  | 所有工具都触发                         |
| 精确值       | 精确匹配  | `"Bash"` 只匹配 Bash 工具            |
| `\|` 分隔   | 匹配多个值 | `"Write\|Edit"` 匹配 Write 或 Edit |
| 正则表达式     | 正则匹配  | `"mcp__.*"` 匹配所有 MCP 工具         |

`if`（hook 条目级）则是另一种更精细的过滤，格式为 `"ToolName"` 或 `"ToolName(arg_pattern)"`：

* 工具名部分复用与 `matcher` 相同的工具名匹配逻辑（即支持正则或 `|`）
* 括号中的 `arg_pattern` 走 **glob 通配匹配**（不是正则），用于检查工具的主要参数（如 Bash 的 `command`、文件类工具的 `file_path`）

示例：

| `if` 写法         | 含义                                   |
| --------------- | ------------------------------------ |
| `"Bash"`        | 工具是 Bash 时触发                         |
| `"Bash(git *)"` | 工具是 Bash 且命令以 `git ` 开头时触发           |
| `"Edit(*.ts)"`  | 工具是 Edit 且 `file_path` 匹配 `*.ts` 时触发 |

## Hook 脚本编写

Hook 脚本通过 stdin 接收 JSON 输入，通过 exit code 和 stdout 控制行为。本节说明所有事件通用的输入输出格式，事件特有的字段见[事件清单](#事件清单)。

### 输入

Hook 脚本通过 **stdin** 接收 JSON 数据。所有事件都包含以下通用字段：

| 字段                | 说明                   |
| ----------------- | -------------------- |
| `session_id`      | 当前会话 ID              |
| `transcript_path` | 当前 transcript 文件路径   |
| `cwd`             | 当前工作目录               |
| `hook_event_name` | 触发的事件名称              |
| `permission_mode` | 当前权限模式（如果该事件提供）      |
| `agent_id`        | 当前 Agent ID（如果该事件提供） |
| `agent_type`      | 当前 Agent 类型（如果该事件提供） |

不同事件会在此基础上附加额外字段（详见各事件说明）。

用 `jq` 解析输入：

```bash theme={null}
#!/bin/bash
input=$(cat)
tool_name=$(echo "$input" | jq -r '.tool_name')
```

### 输出

Hook 通过 exit code 和 stdout 控制行为。

#### exit code

* `0`：成功；stdout 会按下文规则解析。
* `2`：阻塞；stderr 内容作为反馈传给 Agent（仅对支持阻塞的事件生效）。
* 其他值：非阻塞错误，stdout 被忽略，stderr 写入诊断日志，主流程继续。

#### stdout JSON 通用字段

当 exit 0 且 stdout 是合法 JSON 时，CLI 会按以下字段解析；不是 JSON 则按纯文本处理（仅 `SessionStart` / `UserPromptSubmit` 会把纯文本作为附加上下文注入对话）。

| 字段                   | 说明                                                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `continue`           | `false` 时请求停止后续执行                                                                                                                |
| `stopReason`         | 与 `continue: false` 配合，向 Agent 说明停止原因                                                                                            |
| `suppressOutput`     | `true` 时不将 hook 输出展示给用户                                                                                                          |
| `systemMessage`      | 展示给用户的 hook 系统消息，不注入模型上下文                                                                                                        |
| `decision`           | `"allow"` 或 `"deny"`，事件相关的决策；`"deny"` 等价 exit 2。若需要请求用户授权（`"ask"`），仅在 `PreToolUse` 的 `hookSpecificOutput.permissionDecision` 中使用 |
| `reason`             | 决策原因，会展示给用户/模型                                                                                                                   |
| `hookSpecificOutput` | 各事件专属字段的容器（详见各事件说明）                                                                                                              |

事件特有的精细控制字段（如 `PreToolUse` 的 `permissionDecision`、`PostToolUse` 的 `updatedToolOutput` 等）放在 `hookSpecificOutput` 对象中。**输出 `hookSpecificOutput` 时必须带上 `hookEventName`**，否则整个 JSON 输出会被拒绝，TUI 显示 `<hookName> hook error: hookSpecificOutput is missing required field "hookEventName"`。例如：

```json theme={null}
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "ask"
  }
}
```

### 环境变量

Hook 脚本执行时可使用以下环境变量：

| 变量                  | 说明                      |
| ------------------- | ----------------------- |
| `QODER_PROJECT_DIR` | 当前项目的工作目录               |
| `QODER_PLUGIN_ROOT` | 当 hook 来自插件时，指向该插件根目录   |
| `QODER_PLUGIN_DATA` | 当 hook 来自插件时，指向该插件的数据目录 |

## 事件清单

按用途分组列出可订阅的事件。每个事件标明 matcher 匹配的字段、stdin 的额外输入字段、是否支持阻塞，以及可用的 `hookSpecificOutput` 字段。

### 总览

| 事件                   | matcher 匹配                                 | exit 2 阻塞                 | 关键输入字段                                           |
| -------------------- | ------------------------------------------ | ------------------------- | ------------------------------------------------ |
| `SessionStart`       | `source`（startup/resume/clear/compact/new） | —                         | `source`, `model`                                |
| `SessionEnd`         | `reason`                                   | —                         | `reason`                                         |
| `UserPromptSubmit`   | —                                          | ✅                         | `prompt`                                         |
| `PreToolUse`         | 工具名                                        | ✅                         | `tool_name`, `tool_input`                        |
| `PostToolUse`        | 工具名                                        | —                         | `tool_name`, `tool_input`, `tool_response`       |
| `PostToolUseFailure` | 工具名                                        | —                         | `tool_name`, `error`, `error_type`               |
| `PermissionRequest`  | 工具名                                        | —                         | `tool_name`, `tool_input`                        |
| `PermissionDenied`   | 工具名                                        | —                         | `tool_name`, `tool_input`, `reason`              |
| `Stop`               | —                                          | ✅                         | `stop_hook_active`, `last_assistant_message`     |
| `StopFailure`        | `error_type`                               | —                         | `error_type`, `error`                            |
| `SubagentStart`      | Agent 类型                                   | —                         | `agent_id`, `agent_type`                         |
| `SubagentStop`       | Agent 类型                                   | ✅                         | `agent_id`, `agent_type`, `stop_hook_active`     |
| `PreCompact`         | `trigger`                                  | ✅                         | `trigger`, `custom_instructions`                 |
| `PostCompact`        | `trigger`                                  | —                         | `trigger`, `compact_summary`                     |
| `Notification`       | `notification_type`                        | —                         | `notification_type`, `message`                   |
| `InstructionsLoaded` | `load_reason`                              | —                         | `file_path`, `memory_type`, `load_reason`        |
| `ConfigChange`       | `source`                                   | ✅（`policy_settings` 来源除外） | `source`, `file_path`                            |
| `CwdChanged`         | —                                          | —                         | `old_cwd`, `new_cwd`                             |
| `FileChanged`        | 文件名（basename）                              | —                         | `file_path`, `event`                             |
| `WorktreeCreate`     | —                                          | 失败：非 0 exit               | `name`                                           |
| `WorktreeRemove`     | —                                          | —                         | `worktree_path`                                  |
| `Elicitation`        | `mcp_server_name`                          | ✅                         | `mcp_server_name`, `message`, `requested_schema` |
| `ElicitationResult`  | `mcp_server_name`                          | ✅                         | `mcp_server_name`, `action`, `content`           |

### 会话生命周期

#### SessionStart

会话开始时触发。

**matcher 匹配：** 会话来源

| matcher 值 | 触发场景           |
| --------- | -------------- |
| `startup` | 新会话启动          |
| `resume`  | 恢复已有会话         |
| `clear`   | 通过 `/clear` 重置 |
| `compact` | 上下文压缩完成后       |
| `new`     | 新建会话（其他来源）     |

**额外输入字段：**

```json theme={null}
{
  "source": "startup",
  "model": "Auto"
}
```

**hookSpecificOutput：** `additionalContext`（注入到对话的上下文）

> 当返回纯文本（非 JSON）时，stdout 也会作为上下文注入对话。

#### SessionEnd

会话结束时触发。

**matcher 匹配：** 结束原因

| matcher 值                     | 触发场景             |
| ----------------------------- | ---------------- |
| `clear`                       | 通过 `/clear` 结束   |
| `resume`                      | 切换到另一个会话         |
| `logout`                      | 退出登录             |
| `prompt_input_exit`           | 用户退出输入（Ctrl+D 等） |
| `bypass_permissions_disabled` | 绕过权限模式被关闭导致结束    |
| `other`                       | 其他原因             |

**额外输入字段：**

```json theme={null}
{
  "reason": "prompt_input_exit"
}
```

#### UserPromptSubmit

用户提交 Prompt 后、Agent 处理前触发。可以阻止该 Prompt 进入对话。

**额外输入字段：**

```json theme={null}
{
  "prompt": "帮我写一个排序函数"
}
```

**阻塞：** exit 2 拒绝该 Prompt，stderr 作为提示展示给用户。

**hookSpecificOutput：**

* `additionalContext`：与 Prompt 一起注入对话
* `sessionTitle`：建议的会话标题

> 当返回纯文本（非 JSON）时，stdout 也会作为上下文注入对话。

### 工具调用

#### PreToolUse

工具执行前触发。可以阻止工具执行或修改输入参数。

**matcher 匹配：** 工具名（如 `Bash`、`Write`、`Edit`、`Read`、`Glob`、`Grep`，MCP 工具名如 `mcp__server__tool`）

**额外输入字段：**

```json theme={null}
{
  "tool_name": "Bash",
  "tool_input": {"command": "rm -rf /tmp/build"},
  "tool_use_id": "toolu_01ABC123"
}
```

> 当工具来自 MCP 时，还会附带 `mcp_context`（含 `server_name`、`tool_name`、连接信息）和 `original_request_name`。

**阻塞：** exit 2，stderr 作为错误返回给 Agent。

**hookSpecificOutput：**

| 字段                         | 说明                                                   |
| -------------------------- | ---------------------------------------------------- |
| `permissionDecision`       | `"allow"` / `"deny"` / `"ask"`，等价于顶层 `decision`，覆盖优先 |
| `permissionDecisionReason` | 决策原因，覆盖顶层 `reason`                                   |
| `updatedInput`             | 修改后的工具输入参数（替换原始 `tool_input`）                        |
| `additionalContext`        | 注入对话的额外上下文                                           |

#### PostToolUse

工具执行成功后触发。

**matcher 匹配：** 工具名

**额外输入字段：**

```json theme={null}
{
  "tool_name": "Write",
  "tool_input": {"file_path": "/path/to/file.ts", "content": "..."},
  "tool_response": {"success": true, "bytes_written": 1024},
  "tool_use_id": "toolu_01ABC123"
}
```

> `tool_response` 是对象，具体结构由工具决定。MCP 工具同样附带 `mcp_context` / `original_request_name`。

**hookSpecificOutput：**

| 字段                     | 说明                                      |
| ---------------------- | --------------------------------------- |
| `updatedToolOutput`    | 替换工具响应（任意工具均可使用）                        |
| `updatedMCPToolOutput` | 仅替换 MCP 工具响应（优先级低于 `updatedToolOutput`） |
| `additionalContext`    | 注入对话的额外上下文                              |

#### PostToolUseFailure

工具执行失败后触发。

**matcher 匹配：** 工具名

**额外输入字段：**

```json theme={null}
{
  "tool_name": "Bash",
  "tool_input": {"command": "npm test"},
  "tool_use_id": "toolu_01ABC123",
  "error": "Command exited with non-zero status code 1",
  "error_type": "execution_failed",
  "is_interrupt": false
}
```

**hookSpecificOutput：** `additionalContext`

#### PermissionRequest

工具执行需要用户授权时触发。可以自动允许、拒绝或修改输入。

**matcher 匹配：** 工具名

**额外输入字段：**

```json theme={null}
{
  "tool_name": "Bash",
  "tool_input": {"command": "rm -rf node_modules"},
  "permission_suggestions": []
}
```

**hookSpecificOutput：** `decision` 对象，其字段随 `behavior` 取值不同：

`behavior: "allow"`（允许执行，可同时改写输入或写入持久权限）：

```json theme={null}
{
  "behavior": "allow",
  "updatedInput": { "command": "..." },
  "updatedPermissions": []
}
```

| 字段                   | 说明                          |
| -------------------- | --------------------------- |
| `behavior`           | 必须是 `"allow"`               |
| `updatedInput`       | 修改后的工具输入（替换原始 `tool_input`） |
| `updatedPermissions` | 同时写入的持久权限规则                 |

`behavior: "deny"`（拒绝执行，可附加用户提示）：

```json theme={null}
{
  "behavior": "deny",
  "message": "...",
  "interrupt": false
}
```

| 字段          | 说明             |
| ----------- | -------------- |
| `behavior`  | 必须是 `"deny"`   |
| `message`   | 展示给用户的说明       |
| `interrupt` | 是否打断当前操作并向用户展示 |

> `PermissionRequest` 的 hook 不支持 `"ask"` 行为；如果希望弹窗征询用户，请使用 `PreToolUse` 的 `permissionDecision: "ask"`。

#### PermissionDenied

权限分类器拒绝工具调用时触发，可请求重试。

**matcher 匹配：** 工具名

**额外输入字段：**

```json theme={null}
{
  "tool_name": "Bash",
  "tool_input": {"command": "..."},
  "tool_use_id": "toolu_01ABC123",
  "reason": "Auto mode classifier blocked this call"
}
```

**hookSpecificOutput：** `retry: true` 时请求重试该工具调用。

### Agent 流程

#### Stop

主 Agent 完成响应、且无待执行工具调用时触发。可以阻止 Agent 停止，让其继续工作。

**额外输入字段：**

```json theme={null}
{
  "stop_hook_active": false,
  "last_assistant_message": "..."
}
```

| 字段                       | 说明                                    |
| ------------------------ | ------------------------------------- |
| `stop_hook_active`       | 当前是否正处于由 Stop hook 驱动的延续轮次（避免无限循环时使用） |
| `last_assistant_message` | 停止前最后一条 Assistant 消息                  |

**阻塞：** exit 2，stderr 作为消息注入对话，Agent 继续工作。

**hookSpecificOutput：** `clearContext: true` 时同时清空上下文。

#### StopFailure

Agent 因错误意外停止时触发，仅作通知，输出与 exit code 被忽略。

**matcher 匹配：** `error_type`（如 `rate_limit`、`server_error` 等）

**额外输入字段：**

```json theme={null}
{
  "error_type": "rate_limit",
  "error": "...",
  "error_details": "...",
  "last_assistant_message": "..."
}
```

`error_type` 取值：`rate_limit` / `authentication_failed` / `billing_error` / `invalid_request` / `server_error` / `max_output_tokens` / `unknown`。

#### SubagentStart

子 Agent 启动时触发。

**matcher 匹配：** Agent 类型名

**额外输入字段：**

```json theme={null}
{
  "agent_id": "a1b2c3d4",
  "agent_type": "task"
}
```

**hookSpecificOutput：** `additionalContext`

#### SubagentStop

子 Agent 完成时触发，可阻止其停止（与 `Stop` 类似）。

**matcher 匹配：** Agent 类型名

**额外输入字段：**

```json theme={null}
{
  "agent_id": "a1b2c3d4",
  "agent_type": "task",
  "stop_hook_active": false,
  "agent_transcript_path": "...",
  "last_assistant_message": "..."
}
```

**阻塞：** exit 2，stderr 作为消息注入子 Agent 对话。

**hookSpecificOutput：** `clearContext: true` 时同时清空子 Agent 上下文。

### 上下文压缩

#### PreCompact

上下文压缩前触发，可以阻止压缩。

**matcher 匹配：** 触发方式

| matcher 值 | 触发场景              |
| --------- | ----------------- |
| `manual`  | 用户手动执行 `/compact` |
| `auto`    | 上下文窗口接近上限时自动触发    |

**额外输入字段：**

```json theme={null}
{
  "trigger": "manual",
  "custom_instructions": "保留所有工具调用结果"
}
```

**阻塞：** exit 2 阻止本次压缩。

#### PostCompact

上下文压缩完成后触发。

**matcher 匹配：** 触发方式（同 PreCompact）

**额外输入字段：**

```json theme={null}
{
  "trigger": "manual",
  "compact_summary": "压缩摘要..."
}
```

**hookSpecificOutput：** `additionalContext`

### 通知与提示

#### Notification

发出用户提示（权限请求、空闲提示、Elicitation 等）时触发。

**matcher 匹配：** 通知类型

| matcher 值              | 触发场景                  |
| ---------------------- | --------------------- |
| `permission_prompt`    | 工具权限请求                |
| `idle_prompt`          | 空闲提示                  |
| `auth_success`         | 鉴权成功                  |
| `elicitation_dialog`   | MCP elicitation 对话框出现 |
| `elicitation_response` | 用户对 elicitation 做出回应  |
| `elicitation_complete` | elicitation 流程完成      |

**额外输入字段：**

```json theme={null}
{
  "notification_type": "permission_prompt",
  "message": "Agent is requesting permission to run: rm -rf node_modules",
  "title": "Permission Required",
  "details": {}
}
```

**hookSpecificOutput：** `additionalContext`

### 上下文与配置加载

#### InstructionsLoaded

指令/记忆文件被加载时触发，仅作通知，输出与 exit code 被忽略。

**matcher 匹配：** `load_reason`（如 `session_start`、`include` 等）

**额外输入字段：**

```json theme={null}
{
  "file_path": "/abs/path/AGENTS.md",
  "memory_type": "project",
  "load_reason": "session_start",
  "globs": ["**/AGENTS.md"],
  "trigger_file_path": "...",
  "parent_file_path": "..."
}
```

`load_reason` 取值：`session_start` / `nested_traversal` / `path_glob_match` / `include` / `compact`。

#### ConfigChange

会话期间配置文件发生变更时触发。

**matcher 匹配：** 配置来源

| matcher 值          | 触发场景                                         |
| ------------------ | -------------------------------------------- |
| `user_settings`    | 用户级 `~/.qoder/settings.json`                 |
| `project_settings` | 项目级 `${project}/.qoder/settings.json`        |
| `local_settings`   | 项目本地 `${project}/.qoder/settings.local.json` |
| `policy_settings`  | 策略配置                                         |
| `skills`           | Skill 目录变更                                   |
| `agents`           | 自定义 Agent 目录变更                               |

**额外输入字段：**

```json theme={null}
{
  "source": "user_settings",
  "file_path": "/abs/path/settings.json"
}
```

**阻塞：** exit 2 阻止该变更应用到当前会话。**`policy_settings` 来源例外**：hook 仍会触发用于审计，但变更会强制生效，不可被阻止。

### 工作目录与文件

#### CwdChanged

工作目录变更时触发。

**额外输入字段：**

```json theme={null}
{
  "old_cwd": "/old",
  "new_cwd": "/new"
}
```

**hookSpecificOutput：**

| 字段                  | 说明                           |
| ------------------- | ---------------------------- |
| `additionalContext` | 注入对话的上下文                     |
| `watchPaths`        | 注册到 `FileChanged` 监听器的绝对路径列表 |

#### FileChanged

被监听的文件变化时触发。

**matcher 匹配：** 变更文件的 basename（支持精确匹配、`|` 多值、正则）

**额外输入字段：**

```json theme={null}
{
  "file_path": "/abs/path/file.ts",
  "event": "change"
}
```

`event` 取值：`change` / `add` / `unlink`。

**hookSpecificOutput：** `additionalContext`、`watchPaths`（同 CwdChanged）

### Worktree 隔离

#### WorktreeCreate

需要创建一个隔离的工作树时触发。Hook 必须返回 worktree 的绝对路径，任何非零 exit code 视为失败。

**额外输入字段：**

```json theme={null}
{
  "name": "feature-x"
}
```

**返回路径**：把绝对路径写入 stdout，或在 `hookSpecificOutput.worktreePath` 中提供。

#### WorktreeRemove

移除工作树时触发，仅作通知，失败仅展示 stderr。

**额外输入字段：**

```json theme={null}
{
  "worktree_path": "/abs/path/worktree"
}
```

### MCP 交互

#### Elicitation

MCP server 请求用户输入（elicitation）时触发。Hook 可自动接受、拒绝或取消。

**matcher 匹配：** `mcp_server_name`

**额外输入字段：**

```json theme={null}
{
  "mcp_server_name": "my-server",
  "message": "请确认操作",
  "mode": "...",
  "url": "...",
  "elicitation_id": "...",
  "requested_schema": {}
}
```

**阻塞：** exit 2 拒绝该 elicitation。

**hookSpecificOutput：**

| 字段        | 说明                                    |
| --------- | ------------------------------------- |
| `action`  | `"accept"` / `"decline"` / `"cancel"` |
| `content` | `accept` 时提供的输入内容                     |

#### ElicitationResult

用户对 elicitation 完成响应后触发，可覆盖响应。

**matcher 匹配：** `mcp_server_name`

**额外输入字段：**

```json theme={null}
{
  "mcp_server_name": "my-server",
  "action": "accept",
  "content": {},
  "mode": "...",
  "elicitation_id": "..."
}
```

**阻塞：** exit 2 把 action 改写为 `decline`。

**hookSpecificOutput：** `action`、`content`（覆盖原响应）

## 实用场景

### 桌面通知提醒

当 Agent 完成任务或需要授权时，弹出桌面通知。

脚本 `~/.qoder/hooks/notify.sh`（macOS）：

```bash theme={null}
#!/bin/bash
input=$(cat)
ntype=$(echo "$input" | jq -r '.notification_type')

if [ "$ntype" = "permission_prompt" ]; then
  osascript -e 'display notification "任务需要授权" with title "Qoder CLI"'
else
  osascript -e 'display notification "收到新通知" with title "Qoder CLI"'
fi

exit 0
```

配置：

```json theme={null}
{
  "hooks": {
    "Notification": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.qoder/hooks/notify.sh"
          }
        ]
      }
    ]
  }
}
```

### 写文件后自动 Lint

每次 Agent 写入或编辑文件后，自动执行 lint 检查。

脚本 `${project}/.qoder/hooks/auto-lint.sh`：

```bash theme={null}
#!/bin/bash
input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path')

case "$file_path" in
  *.js|*.ts|*.jsx|*.tsx)
    npx eslint "$file_path" --fix 2>/dev/null
    ;;
esac

exit 0
```

配置：事件 `PostToolUse`，matcher `Write|Edit`，command `.qoder/hooks/auto-lint.sh`。

### 让 Agent 继续工作

在 Agent 停止时检查是否还有未完成的任务，如果有则注入消息让 Agent 继续。

脚本 `~/.qoder/hooks/check-continue.sh`：

```bash theme={null}
#!/bin/bash
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  echo "检测到未提交的变更，请完成 git commit" >&2
  exit 2
fi

exit 0
```

配置：事件 `Stop`，command `~/.qoder/hooks/check-continue.sh`。
