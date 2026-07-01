# OMQ SDK 迁移规划：claude-agent-sdk → Qoder Agent SDK

> 状态: Draft v1 · 负责人: (待定) · 适用仓库: `oh-my-qoder`
> 依据文档: `docs/qoder-cli/ts-sdk.md`、`docs/qoder-cli/ts-sdk-quickstart.md`、`docs/qoder-cli/sdk.md`

---

## 0. 结论先行

**Qoder Agent SDK（TS 包 `@qoder-ai/qoder-agent-sdk`）与 `@anthropic-ai/claude-agent-sdk` 能力对等，且是超集。** 它本质是同一套 Agent SDK 形态的"换牌"实现：`query()` / `Options` / `createSdkMcpServer()` / `tool()` / `AgentDefinition` / `SDKMessage` 全部一一对应，字段名同为 camelCase。

**应当替换**，原因有三：
1. OMQ 当前的编程式嵌入路径（`createOmqSession()` + 进程内 MCP `omq-tools-server`）现在 import 的是 Claude 的 SDK → 实际会拉起 Claude Code 而非 Qoder。换 SDK 才能让这条路真正面向 Qoder。
2. 替换是**机械级**改动（真实运行时依赖仅 1 处 import）。
3. 顺带解锁一批 Qoder 原生能力（用量配额、模型策略、子代理、checkpoint、sandbox），对 HUD / 模型路由 / teams 都有直接收益。

---

## 1. 能力对等性核对（TS 实测对照）

| 能力 | claude-agent-sdk | `@qoder-ai/qoder-agent-sdk` | 结论 |
|------|------------------|------------------------------|------|
| 主入口 | `query({prompt,options})→AsyncGenerator` | `query({prompt,options})→Query`(`ts-sdk.md:17`) | ✅ 一致 |
| Options 字段 | camelCase | `systemPrompt/agents/mcpServers/allowedTools/disallowedTools/permissionMode/settingSources/hooks/plugins/skills/canUseTool/model/maxTurns/cwd/env/agent`(`ts-sdk.md:49-96`) | ✅ 与 `createOmqSession` 现用字段完全同名 |
| 进程内 MCP | `createSdkMcpServer({name,version,tools})→{type:'sdk',name,instance}` | 同签名同返回(`ts-sdk.md:1421-1461`) | ✅ 一致 |
| 工具定义 | `tool(name,desc,schema,handler)` | `tool(name,desc,inputSchema,handler,extras?)`(`ts-sdk.md:1321-1335`) | ✅ 4 参调用兼容；annotations 走第 5 参 |
| 子代理 | `agents`+`Task`/`Agent` | `agents:Record<string,AgentDefinition>` + 内置 **`Agent`** 工具(`ts-sdk.md:116-204`) | ✅ 委派工具名是 `Agent` |
| AgentDefinition | description/prompt/tools/model… | 同字段 + `skills/mcpServers/initialPrompt/maxTurns/effort/permissionMode`(`ts-sdk.md:176-204`) | ✅ OMQ `AgentConfig` 可映射 |
| Hooks | Pre/Post/Stop/Subagent… | **超集**：+`PostToolUseFailure/CwdChanged/InstructionsLoaded/FileChanged/PermissionRequest/PostCompact`(`ts-sdk.md:2048-2063`) | ✅ 超集 |
| 权限 | default/acceptEdits/plan/bypass | **超集**：+`yolo/dontAsk/auto`(`ts-sdk.md:959-966`) | ✅ 超集 |
| 消息流 | `message.type` 判别联合 | `SDKMessage` 同结构（assistant.content=text/tool_use/thinking；result.subtype）(`ts-sdk.md:2461-2587`) | ✅ 一致 |
| 模型策略 | — | `resolveModel` 回调 + BYOK(`ts-sdk.md:412-560`) | ➕ 额外 |
| 运行时控制 | — | `getUsageInfo/getAvailableModels/setModel/supportedAgents/listByokProviders`(`ts-sdk.md:837-900`) | ➕ 额外 |

---

## 2. 必须处理的真实差异（不是纯改名）

1. **`auth` 在 `query()` 必传**（`ts-sdk.md:57` "`query()` 必传"）。Claude SDK 走 API key/登录态隐式认证；Qoder 必须显式提供：
   - 便捷构造器：`accessToken(token)` / `accessTokenFromEnv(envVar?)`（默认读 `QODER_PERSONAL_ACCESS_TOKEN`）/ `qodercliAuth()`（复用本机 `qodercli login`）。
   - → `createOmqSession` 产出的 `queryOptions.options` 必须带 `auth`。

2. **委派工具 `Task` → `Agent`**：`src/index.ts:313` 的 `allowedTools` 硬编码了 `'Task'`，Qoder 内置工具是 `Agent`（`ts-sdk.md:1299`），且文档强调 `allowedTools` 必须含 `Agent` 才能委派子代理（`ts-sdk.md:124`）。技能层 53 处 `Task(` 同步处理（见 teams/对齐规划，本规划只改 SDK options 这处）。

3. **模型档位字符串语义不同**：Qoder 模型值为 `auto/ultimate/performance/efficient/lite`（`ts-sdk.md:76,260-266`）。OMQ 现有 model-routing / delegation-enforcer 用 high/medium/low ↔ Qwen ID。换 SDK 后 `options.model` 与 `AgentDefinition.model` 应使用 Qoder 档位（或完整 ID）。需做一次映射对齐（建议用 `resolveModel` 回调集中处理）。

4. **包名**：`@anthropic-ai/claude-agent-sdk` → `@qoder-ai/qoder-agent-sdk`（`ts-sdk-quickstart.md:20`）。

5. **`tool()` annotations**：当前 wrapper 只传 4 参，`team-tools.ts` 等定义里的 `annotations`（readOnlyHint 等）会被丢弃。Qoder 支持第 5 参 `extras.annotations`（`ts-sdk.md:1334,1397-1417`）——可选增强。

---

## 3. 改动清单（精确到文件/行）

| 文件 | 改动 | 说明 |
|------|------|------|
| `package.json` / `package-lock.json` | 依赖 `@anthropic-ai/claude-agent-sdk` → `@qoder-ai/qoder-agent-sdk` | 删旧增新；`npm i` |
| `src/mcp/omq-tools-server.ts:8` | `import { createSdkMcpServer, tool } from '@qoder-ai/qoder-agent-sdk'` | **唯一真实运行时 import** |
| `src/mcp/omq-tools-server.ts:122-129` | 确认 `tool(...)` 4 参调用与新签名兼容（可选：把 `annotations` 作为第 5 参 `{annotations}` 传入） | 类型 `Parameters<typeof tool>[2]` 自动跟随新包 |
| `src/index.ts` `createOmqSession`（`:354-366`） | `queryOptions.options` 增加 `auth`（默认 `accessTokenFromEnv()`，可被 `OmqOptions` 覆盖）；`allowedTools` 的 `'Task'`→`'Agent'`（`:313`） | 核心行为修复 |
| `src/index.ts` import | 增 `import { accessTokenFromEnv, qodercliAuth } from '@qoder-ai/qoder-agent-sdk'`（用到时） | 认证 |
| `src/index.ts:253` / `src/commands/index.ts:154` | JSDoc 示例 `from '@anthropic-ai/claude-agent-sdk'` → 新包 | 文档 |
| `src/agents/definitions.ts` / `types.ts` | 校验 `AgentConfig`→`AgentDefinition` 字段映射（description/prompt/tools/model）；`model` 用 Qoder 档位 | 子代理注册正确性 |
| `OmqOptions`（`src/index.ts` 类型） | 增 `auth?` / `accessToken?` 配置项 + 文档 | 可配置认证 |
| `docs/*`、`README.md` | 凡示例引用旧 SDK 处同步 | 文档 |

> 说明：插件/CLI 路径（`.mcp.json → bridge/mcp-server.cjs ← standalone-server ← tool-registry`）**不依赖**该 SDK，不受影响；本次只动"编程式嵌入"这条路。

---

## 4. 顺带解锁的能力（建议后续利用，非本规划必须）

- `q.getUsageInfo()`（`ts-sdk.md:872-898`）→ 给 HUD 提供真实配额/用量（替代 `hud/usage-api.ts` 的近似）。
- `resolveModel` 模型策略（`ts-sdk.md:412-461`）→ 把 OMQ 的 tier 路由从"env 注入"升级为 SDK 原生回调，统一 high/medium/low ↔ auto/performance/efficient。
- `options.agents` + `Agent` 工具 → **SDK 嵌入场景下 OMQ teams worker 的原生实现路径**（与 `agent-teams-completion-plan.md` 互补：CLI/插件路径用 `spawn_agent`，SDK 嵌入路径用 `agents`+`Agent`）。
- `enableFileCheckpointing` / `sandbox` / `experimentalCloudAgent` → 后续增强项。

---

## 5. 分阶段实施

### Phase 1 — 依赖与最小编译通过
- 换包、改 `omq-tools-server.ts:8` import、修 2 处 JSDoc。
- 验收：`npm i && npm run build` 通过；`lsp_diagnostics_directory` 无新增类型错误。

### Phase 2 — `createOmqSession` 认证与委派工具
- 注入 `auth`（默认 `accessTokenFromEnv()`），`OmqOptions` 增认证配置；`'Task'`→`'Agent'`。
- 验收：新增单测——`createOmqSession()` 的 `queryOptions.options` 含 `auth` 且 `allowedTools` 含 `Agent` 不含 `Task`。

### Phase 3 — 模型档位对齐
- 把 `agents`/`options.model` 的模型值映射到 Qoder 档位；或接入 `resolveModel` 回调集中决策。复查 `delegation-enforcer.ts` 的 tier 映射与新档位一致。
- 验收：单测覆盖 tier→Qoder 模型值映射；冒烟一次真实 `query()`（需 PAT）跑通一个工具调用。

### Phase 4 — 端到端冒烟 + 文档
- 用 `QODER_PERSONAL_ACCESS_TOKEN` 跑 `ts-sdk-quickstart.md` 式最小脚本，确认 OMQ 进程内工具（`mcp__t__*`）可被模型调用。
- 同步 README/docs 示例与 `package.json` keywords。
- 验收：脚本能完成"读文件→调用一个 OMQ 工具→返回 result"。

---

## 6. 风险与回滚

| 风险 | 缓解 |
|------|------|
| PAT 认证在 CI/无人值守缺失 | 默认 `accessTokenFromEnv()`，文档要求设置 `QODER_PERSONAL_ACCESS_TOKEN`；交互式可回退 `qodercliAuth()` |
| 模型档位字符串不被后端识别 | 用 `q.getAvailableModels()` 实测可用值；tier 映射集中到一处 |
| `tool()`/类型签名细微差异 | Phase 1 以 `npm run build` 类型检查兜底；4 参调用已确认兼容 |
| 新包在内网 registry 的可获得性 | 先确认 `@qoder-ai/qoder-agent-sdk` 可安装（quickstart 用的就是它） |

**回滚**：改动集中、可逆。回退 = 还原 `package.json` 依赖 + `omq-tools-server.ts:8` import + `index.ts` 的 auth/Task 两处。

---

## 7. 待确认（实施前)

1. `@qoder-ai/qoder-agent-sdk` 的发布 registry 与版本（内网/公网均可装？）。
2. 是否导出便捷构造器 `accessToken/accessTokenFromEnv/qodercliAuth`（quickstart 示例为 `accessTokenFromEnv`，应已导出）。
3. OMQ 嵌入场景默认认证方式：PAT 环境变量 vs 复用 `qodercli login`（建议默认前者、可配置后者）。
