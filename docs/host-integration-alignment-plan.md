# OMQ 宿主集成对齐规划（Host Integration Alignment）

> 第三份规划文档。与 `agent-teams-completion-plan.md`、`qoder-sdk-migration-plan.md` 并列。
> 覆盖**非-teams** 的宿主集成缺口：OMQ 作为 Qoder CLI 外围编排层，但 fork 自 OMC 后仍有大量 Claude 宿主假设未改写。
> 本文所有"现状"均已对当前代码核验（含 `file:line` 证据）。

---

## 0. 范围与目标

- **目标**：让 OMQ 在 Qoder CLI 宿主上"装得上、认得出、跑得通、能委派"，消除残留的 Claude 宿主假设。
- **不在本规划内**：agent teams 自托管（见 teams 规划）、SDK 迁移（见 SDK 规划）。但 §3 委派改造与 SDK 规划的 `Task→Agent` 一处有交集，本文负责**技能层 53 处**，SDK 规划只负责 options 那一处。
- **核验基线**：commit @ 2026-06-30；下列行号以当前 `src/` 为准。

### 关键前置决策（实施前必须确认）

这几项决定了 P0 的"目标值"。它们取决于 **Qoder CLI 实际行为**，文档无法替代，需你确认：

| # | 待确认 | 影响范围 |
|---|--------|----------|
| D1 | Qoder CLI 的真实配置目录是 `~/.qoder` 还是 `~/.claude`？（installer 注释写 `~/.qoder`，但 `config-dir.ts` 默认 `~/.claude`） | G1、G5 |
| D2 | Qoder CLI 加载插件清单时读 `.claude-plugin/plugin.json` 还是 `.qoder-plugin/plugin.json`？（仓库现有 `.qoder-plugin/`，installer 校验要 `.claude-plugin/`） | G3 |
| D3 | Qoder CLI 读取的"项目指令文件"叫 `CLAUDE.md` 还是 `QODER.md`/`AGENTS.md`？ | G4 |
| D4 | Qoder CLI 全局 MCP 配置文件名（OMC 写 `~/.claude.json`） | G5 |
| D5 | 子代理委派工具：Qoder 内置工具名是 `Agent`（SDK 文档确认）；交互式技能里应写 `spawn_agent` 还是 `Agent`？ | G6 |

> 我的推断（供决策参考）：D1=`~/.qoder`、D2=`.qoder-plugin`、D3 大概率 `AGENTS.md`（仓库根已有 `AGENTS.md`）、D5 技能层用 `spawn_agent`（与 AGENTS.md `<child_agent_protocol>` 一致）。但都需你拍板。

---

## 1. 严重度总览

| ID | 缺口 | 严重度 | 现状证据 | 状态 |
|----|------|--------|----------|------|
| G1 | config-dir 默认 `~/.claude` | **P0** | `src/utils/config-dir.ts:41` | 待改 |
| G2 | `isClaudeInstalled()` 检测 `claude` 二进制 | **P0** | `src/installer/index.ts:401-409` | 待改 |
| G3 | 插件校验要 `.claude-plugin/`，仓库只有 `.qoder-plugin/` | **P0** | `index.ts:1014,1022,1034`；仓库 `.qoder-plugin/plugin.json` | 待改 |
| G4 | 安装 `docs/CLAUDE.md` 而非 `QODER.md`/`AGENTS.md` | **P0** | `index.ts:1714,2122` | 待决/改 |
| G5 | MCP 写 `~/.claude.json` | **P0** | `src/installer/mcp-registry.ts:78` | 待改 |
| G6 | 11 技能 ~50 处 `Task()`、0 处 `spawn_agent` | **P0** | `skills/**`（grep）；`spawn_agent`=0 | 待改 |
| G7 | `setup-maintenance` 未注册（脚本已存在） | P1 | `hooks/hooks.json`（缺）；`scripts/setup-maintenance.mjs`（在） | 待改 |
| G8 | hooks matcher 方案未在 Qoder 上验证 | P1 | `hooks/hooks.json:40,63` | 待验证 |
| G9 | `~/.qoder/prompts/` 无安装步骤 | P1 | installer 只同步 `agents/`，无 `prompts/` | 待补 |
| G10 | `QODER_LITE/PERFORMANCE_MODEL` 文档债 | P1 | 代码已接（`src/config/models.ts` 等），用户文档缺 | 待补 |
| G11 | auto-update 包名 `@anthropic-ai/qoder-cli` 可疑 | P1（附带） | `src/features/auto-update.ts:37,173` | 待核 |
| — | ~~npm 包名 `oh-my-claude-sisyphus`~~ | — | `package.json:2` 已是 `oh-my-qoder` | **已解决** |

---

## 2. P0 — 集成边界

### G1 · config-dir 默认 `~/.claude`

**现状**：
```36:42:src/utils/config-dir.ts
export function getQoderConfigDir(): string {
  const home = homedir();
  const configured = process.env.QODER_CONFIG_DIR?.trim();

  if (!configured) {
    return stripTrailingSep(normalize(join(home, '.claude')));
  }
```
矛盾点：`installer/index.ts:5` 注释写 "into the Qoder CLI config directory (`~/.qoder/`)"，但默认值是 `~/.claude`。

**目标**（取决于 D1）：未设 `QODER_CONFIG_DIR` 时默认 `~/.qoder`。

**改动**：
- `src/utils/config-dir.ts:41` 默认 `join(home, '.claude')` → `join(home, '.qoder')`。
- **同步 4 个镜像**（文件头注释已声明必须同步）：`scripts/lib/config-dir.mjs`、`scripts/lib/config-dir.cjs`、`scripts/lib/config-dir.sh`。
- 更新 JSDoc 中两处 "fallback to `~/.claude`"。

**验收**：未设环境变量时 `getQoderConfigDir()` 返回 `~/.qoder`；4 镜像返回值一致（加一条一致性测试）。

---

### G2 · `isClaudeInstalled()` 检测 `claude`

**现状**：
```401:409:src/installer/index.ts
export function isClaudeInstalled(): boolean {
  try {
    const command = isWindows() ? 'where claude' : 'which claude';
    execSync(command, { encoding: 'utf-8', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}
```
调用点：`index.ts:1965` `if (!options.skipClaudeCheck && !isClaudeInstalled())`。在没有 `claude` 二进制的纯 Qoder 环境里会误判"未安装宿主"而拦截安装。

**改动**：
- 重命名 `isClaudeInstalled` → `isQoderCliInstalled`，命令改 `which qoder`/`where qoder`（确认 Qoder CLI 可执行名）。
- 同步重命名 `skipClaudeCheck` → `skipQoderCheck`（保留旧名做 1 版兼容别名可选）。
- 更新调用点 `index.ts:1965` 与相关测试。

**验收**：在仅装 Qoder CLI 的环境 `omq setup` 不再因宿主检测失败而中止。

---

### G3 · 插件清单目录 `.claude-plugin` vs `.qoder-plugin`

**现状**：仓库实际产物是 `.qoder-plugin/plugin.json`（`name: "oh-my-qoder"`），但 installer 校验硬编码 `.claude-plugin/`：
```1021:1034:src/installer/index.ts
const REQUIRED_PLUGIN_PAYLOAD_FILES = [
  '.claude-plugin/plugin.json',
  'package.json',
  'dist/hooks/skill-bridge.cjs',
  'bridge/cli.cjs',
  'hooks/hooks.json',
] as const;
...
function readPluginManifest(root: string): ... {
  const manifestPath = join(root, '.claude-plugin', 'plugin.json');
```
`PLUGIN_PAYLOAD_DIRS` 同样含 `.claude-plugin`（`:1014`）。即 installer 找不到清单 → 插件模式校验/打包失败。

**改动**（取决于 D2，二选一并保持全链路一致）：
- 若 Qoder 读 `.qoder-plugin/`：把 `index.ts` 中 `.claude-plugin` 全部改 `.qoder-plugin`（`:1014,1022,1034,1042,1047,1071,1075,1077,1083,1099`），并核对打包 `files`/`PLUGIN_PAYLOAD_DIRS`。
- 若 Qoder 读 `.claude-plugin/`：把仓库 `.qoder-plugin/` 重命名为 `.claude-plugin/`，并更新 `package.json#files`、`.qoder-plugin/marketplace.json` 引用。

**验收**：`validatePluginPayload`（或等价路径）对真实产物通过；插件模式 `omq setup` 能定位并校验清单。

---

### G4 · 安装 `CLAUDE.md` 而非 Qoder 指令文件

**现状**：
```1714:1717:src/installer/index.ts
  const claudeMdPath = join(getPackageDir(), 'docs', 'CLAUDE.md');
  if (!existsSync(claudeMdPath)) {
    console.error(`FATAL: CLAUDE.md not found: ${claudeMdPath}`);
```
以及写入目标 `index.ts:2122` `join(QODER_CONFIG_DIR, 'CLAUDE.md')`、合并/备份逻辑（`:1798-1815`,`:2134`）、检测候选 `:128-129`。

**改动**（取决于 D3）：把源文件 `docs/CLAUDE.md` 与目标文件名统一为 Qoder 宿主真正读取的文件（推断 `AGENTS.md`，仓库根已用 `AGENTS.md`）。涉及：源文件改名/新增、`getPackageDir()` 读取路径、写入目标路径、marker 合并、备份命名、检测候选列表。保持 marker 合并逻辑不变（仅文件名变量化，建议抽 `INSTRUCTION_FILE_NAME` 常量集中）。

**验收**：`omq setup` 把指令写入 Qoder 真正加载的文件；二次安装走 marker 合并而非覆盖。

---

### G5 · MCP 写 `~/.claude.json`

**现状**：
```78:78:src/installer/mcp-registry.ts
  return join(dirname(getQoderConfigDir()), '.claude.json');
```
（即 `~/.claude.json`，Qoder CLI 不会读取它 → MCP server 注册无效。）

**改动**（取决于 D1+D4）：改为 Qoder CLI 实际读取的全局 MCP 配置路径。若 G1 改为 `~/.qoder`，此处 `dirname(...)/.claude.json` 也要同步成 Qoder 的文件名（如 `.qoder.json` 或 Qoder 约定路径）。

**验收**：`omq setup` 后，Qoder CLI 能在其配置中看到 OMQ 注册的 MCP server（`omq doctor` 校验）。

---

### G6 · 委派：技能层全是 `Task()`，零 `spawn_agent`

**现状**（grep 核验）：`Task(` 分布在 10 个技能、约 50 处；`spawn_agent` = 0：

| 技能 | `Task(` 次数 |
|------|------|
| ultrawork | 12 |
| sciomq | 11 |
| ralph | 10 |
| plan | 6 |
| ultraqa / autopilot | 3 / 3 |
| external-context | 2 |
| deepinit / deep-interview / writer-memory | 1 / 1 / 1 |

Qoder 没有 `Task` 工具；委派要走 `spawn_agent`（AGENTS.md `<child_agent_protocol>`）或内置 `Agent` 工具（SDK 文档）。技能现状在 Qoder 上无法委派。

**改动**（取决于 D5）：
- 统一把技能里的 `Task(subagent_type=..., prompt=...)` 调用范式改写为 AGENTS.md 约定的 `spawn_agent` 协议（读 `~/.qoder/prompts/{role}.md` → 注入到 `spawn_agent.message`）。
- 这与 G9（prompts 安装）强耦合：spawn_agent 协议依赖 `~/.qoder/prompts/` 存在。
- 建议分两步：先在 1 个技能（如 `ultrawork`）落地范式并验证可跑，再批量套用其余 9 个。
- 同步 `agents/`、`commands/` 中若有 `Task(` 残留一并处理。

**验收**：`grep -rn 'Task(' skills/` = 0；至少 1 个技能实测可通过 `spawn_agent` 起子代理并回收结果。

---

## 3. P1 — 运行时与文档债

### G7 · `setup-maintenance` 未注册（脚本已存在）

**现状**：`scripts/setup-maintenance.mjs` 在 OMQ **已存在**，但 `hooks/hooks.json` 的 `SessionStart` 只注册了 `setup-init.mjs`（`startup` matcher，`:40-48`），没有 maintenance 块。OMC 对照：OMC 在 SessionStart 额外注册 `setup-maintenance.mjs`（`timeout 60`）。

**改动**：在 `hooks/hooks.json` 的 `SessionStart` 增补一个块运行 `setup-maintenance.mjs`（参考 OMC 的 matcher/timeout=60）。确认 bridge 路由支持该 hook 名（OMC `bridge.ts` 有；OMQ bridge 若缺需补 case）。

**验收**：SessionStart 触发后 maintenance 脚本执行；`omq doctor`/trace 可见。

---

### G8 · hooks matcher 方案待在 Qoder 验证

**现状**：`hooks.json` 用了 `"matcher": "startup"`（`:40`，SessionStart）与 `"matcher": "Bash"`（`:63`，PermissionRequest）。需确认 Qoder CLI 的 hook matcher 语义与 Claude 一致（事件名、matcher 匹配规则、`$QODER_PLUGIN_ROOT` 注入）。

**改动**：在真实 Qoder CLI 上逐事件验证触发；若 matcher 语义不同，调整为 Qoder 支持的写法。产出一张"事件→是否触发→参数"对照表存档。

**验收**：每个注册事件都有实测触发证据。

---

### G9 · `~/.qoder/prompts/` 无安装步骤

**现状**：AGENTS.md `<child_agent_protocol>` 要求"读取 `~/.qoder/prompts/{role}.md` 再 `spawn_agent`"，但 installer 只同步 `~/.qoder/agents/`，没有把角色 prompt 落到 `~/.qoder/prompts/`。→ G6 改造后委派会因找不到 prompt 文件而失败。

**改动**：installer 增加 `prompts/` 同步步骤（源：`agents/` 角色定义或新建 `prompts/` 目录 → 目标 `~/.qoder/prompts/`），插件模式下同样可由 `$QODER_PLUGIN_ROOT/prompts` 提供。明确 agents 与 prompts 的关系（是否同源、命名映射）。

**验收**：`omq setup` 后 `~/.qoder/prompts/{role}.md` 存在；G6 的 spawn_agent 范式能读到。

---

### G10 · `QODER_LITE/PERFORMANCE_MODEL` 文档债

**现状**：env 变量在代码里已接通（`src/config/models.ts`、`src/config/loader.ts`、`src/features/delegation-enforcer.ts`、`AGENTS.md` 的 `<team_model_resolution>` 都引用），但面向用户的文档（README/docs/REFERENCE）缺少说明：变量名、优先级、与 `QODER_MODEL`/`OMQ_MODEL_MEDIUM` 的关系。

**改动**：补文档一节"模型档位与环境变量"，落清 AGENTS.md `<team_model_resolution>` 的优先级链（`--model` > `QODER_MODEL` > `QODER_LITE/PERFORMANCE_MODEL` > `OMQ_MODEL_MEDIUM` > 默认）。纯文档，无代码改动。

**验收**：文档与代码实际读取的变量/优先级一致。

---

### G11 · （附带）auto-update 包名可疑

**现状**：
```37:37:src/features/auto-update.ts
const QODER_CLI_NPM_PACKAGE = '@anthropic-ai/qoder-cli';
```
`@anthropic-ai/qoder-cli` 看起来是 fork 残留（Anthropic scope + qoder 名）。`:173` 同款路径拼接。若真实 Qoder CLI 发布包名不同，auto-update 检测会失效。

**改动**：核实 Qoder CLI 真实 npm 包名并替换两处常量/路径。

**验收**：auto-update 能正确读取已装 Qoder CLI 版本。

---

## 4. 分阶段与里程碑

> P0 之间有依赖：G6 ← G9（prompts）；G1 ← G5（路径）。建议顺序如下。

**Phase 1 — 路径与宿主识别（P0 基座）**：G1（含 4 镜像）、G2、G5。
→ 里程碑 M1：纯 Qoder 环境 `omq setup` 不再误判宿主，配置/ MCP 落到 Qoder 真实路径。

**Phase 2 — 插件与指令文件（P0 打包）**：G3、G4。
→ 里程碑 M2：插件模式校验通过，指令文件写入 Qoder 真正加载的文件。

**Phase 3 — 委派链路（P0 行为）**：G9（prompts 安装）→ G6（技能改写，先 1 个后批量）。
→ 里程碑 M3：技能 `Task(`=0，实测可 `spawn_agent` 委派并回收。

**Phase 4 — 运行时与文档（P1）**：G7、G8、G10、G11。
→ 里程碑 M4：maintenance 注册、matcher 验证存档、模型文档补齐、auto-update 包名核实。

每阶段结束跑：`lint → typecheck → 相关单测 → omq doctor`。

---

## 5. 跨切面风险

| 风险 | 缓解 |
|------|------|
| D1–D5 决策错误导致"改了但更不对" | 先在真实 Qoder CLI 上验证宿主期望，再统一改值；改动用集中常量（`INSTRUCTION_FILE_NAME`、配置路径 helper）降低散点 |
| config-dir 4 镜像不同步 | 加一致性测试（已建议）；CI 校验四源返回值相等 |
| G6 批量改技能引入回归 | 先单技能验证范式，保留独立 reviewer pass（符合 AGENTS.md anti-slop 要求）；每改一个技能 grep 复核 |
| `~/.claude` → `~/.qoder` 迁移影响既有用户 | 提供迁移提示/兼容读取旧路径一版；`omq doctor` 检测旧路径并提示 |
| 与 SDK 规划在 `Task→Agent` 重叠 | 明确分工：SDK 规划只改 `src/index.ts` options 一处；本规划只改技能层 |

## 6. 验收（整体）

- 纯 Qoder（无 `claude` 二进制）环境完成 `omq setup` 且 `omq doctor` 全绿。
- 配置、MCP、指令文件、插件清单均落到 Qoder CLI 真实读取的位置（逐项实测）。
- `grep -rn 'Task(' skills/ agents/ commands/` = 0；委派端到端可跑。
- `lint`/`typecheck`/单测全过；config-dir 一致性测试通过。
- P1：maintenance 触发、matcher 对照表存档、模型文档与代码一致、auto-update 版本读取正确。

---

## 7. 待你确认

1. **D1–D5 五项宿主行为**（§0 表）——这是 P0 目标值的前提，建议先在真实 Qoder CLI 上各验一次。
2. 是否需要保留 `~/.claude` 旧路径的**一版兼容/迁移**（影响 G1 改动量）。
3. 实施顺序：先 Phase 1（路径基座）还是先 Phase 3（委派链路，最影响"能跑")？我建议按 Phase 1→4 顺序。
