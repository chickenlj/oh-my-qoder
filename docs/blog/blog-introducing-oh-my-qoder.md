# 当 AI 编程助手学会「分身术」：oh-my-qoder 多智能体编排实战

> 一个人写代码很快，一群 Agent 协作更快。oh-my-qoder 把你的 Qoder CLI 从单线程助手升级为多智能体军团。

## 你遇到过这些问题吗？

用 AI 编程助手写代码，体验很好——直到项目复杂度上来：

- **单线程瓶颈**：你说「重构认证模块」，它改完 A 文件忘了 B 文件，改完 B 又破坏了 C
- **上下文健忘**：跨 session 丢失项目约定，每次都要重复交代架构决策
- **缺乏验证**：代码写完就声称「完成」，不跑测试、不检查类型、不验证实际行为
- **无法并行**：前端、后端、数据库三条线，只能串行推进

这不是 AI 能力的问题，是编排的问题。

## oh-my-qoder 是什么

oh-my-qoder（简称 OMQ）是 Qoder CLI 的多智能体编排插件。它不替换你的 AI 助手，而是把一个助手变成一支协调有序的团队。

核心思路：**专业分工 + 流程编排 + 强制验证**。

```
用户输入 → Hooks (事件检测) → Skills (行为注入)
       → Agents (任务执行) → State (进度追踪)
```

你只需用自然语言描述意图，OMQ 自动选择合适的编排模式、调度专业 Agent、管理状态流转，直到任务被验证完成。

## 十大编排模式

这是 OMQ 的核心能力——根据任务性质选择最优执行策略：

| 模式 | 适用场景 | 工作方式 |
|------|----------|----------|
| **Team** | 标准工程流程 | 分阶段流水线：plan → PRD → exec → verify → fix |
| **Autopilot** | 端到端自动交付 | 五阶段自治执行，从分析到验证全自动 |
| **Ralph** | 复杂重构 | 持久化自引用循环，验证通过前绝不停止 |
| **Ultrawork** | 批量并行任务 | 最大并行度突发执行 |
| **UltraQA** | 质量把关 | QA 循环直到所有质量门禁通过 |
| **CCG** | 多模型交叉验证 | Codex + Gemini + Qoder 三模型综合决策 |
| **Deep Interview** | 需求不明确 | 苏格拉底式提问，消除歧义后再动手 |
| **RalPlan** | 架构规划 | 共识规划 + 结构化审议 |
| **Ultragoal** | 多目标长期任务 | 持久化计划/账本，跨 session 推进 |
| **Pipeline** | 有序多步骤 | 顺序分阶段处理 |

激活方式就是打字。输入 `autopilot`、`ralph`、`team` 这些关键词，OMQ 自动识别并启动对应模式。

## 19+ 专业 Agent

OMQ 内置五大协作 Lane，覆盖软件工程全生命周期：

**构建 Lane**：explore → analyst → planner → architect → debugger → executor → verifier → tracer

**审查 Lane**：code-reviewer / security-reviewer / style-reviewer / api-reviewer / performance-reviewer

**领域 Lane**：test-engineer / designer / writer / qa-tester / scientist / git-master / document-specialist / code-simplifier

**协调 Lane**：critic（多视角审视决策质量）

**产品 Lane**：product-manager / ux-researcher / information-architect / product-analyst / vision

每个 Agent 有独立的工具集、模型偏好和执行约束。你不需要手动调度——编排模式会根据任务阶段自动分配。

## 50+ MCP 工具

OMQ 通过 MCP 协议暴露 11 类共 50+ 工具：

- **LSP 代码智能**（12 个）：hover、goto-definition、find-references、diagnostics、rename、code-actions 等
- **AST Grep**：结构化代码模式匹配与替换，比正则精确一个量级
- **状态管理**：跨模式的执行状态读写与生命周期控制
- **项目记忆**：技术栈、构建约定、架构决策持久化存储
- **Notepad**：优先级分层的工作记忆（priority / working / manual）
- **Session 搜索**：跨历史会话的全文检索
- **Python REPL**：持久化 Python 执行环境，变量跨调用保持
- **共享内存**：跨 Agent 的键值数据传递
- **Trace**：执行流追踪与时间线回放
- **Skills 管理**：技能的发现、加载与注册
- **Deepinit Manifest**：增量式代码库文档化

## 智能模型路由

OMQ 不会把所有任务都丢给最贵的模型。它按任务复杂度自动路由：

- **LOW**（haiku）：文件查找、快速查询、简单格式化
- **MEDIUM**（sonnet）：常规编码、标准重构、测试编写
- **HIGH**（opus）：架构设计、安全审计、深度分析

实测节省 30-50% token 开销，质量不降反升——因为小任务不再被大模型的过度思考拖慢。

## Hooks 系统

20 个 Hook 分布在 11 个生命周期事件上：

- **关键词检测**：自然语言触发编排模式
- **持久模式强制**：ralph/ultrawork 激活后，每轮注入状态提醒防止偏离
- **Compaction 抗性记忆**：长对话压缩时保护关键上下文
- **子 Agent 追踪**：并行 Agent 的生命周期监控

## 验证协议

OMQ 的验证不是可选的，是流程内置的：

| 级别 | 触发条件 | 验证内容 |
|------|----------|----------|
| LIGHT | 简单修改 | 类型检查 + lint |
| STANDARD | 功能开发 | 测试通过 + 行为验证 |
| THOROUGH | 重构/安全 | 多维度证据收集 |

未通过验证的任务不会被标记为完成，Agent 会自动进入修复循环。

## 跨 Session 记忆

项目知识通过 `.omq/project-memory.json` 和 `.omq/notepad.md` 持久化：

- 技术栈偏好、构建命令、测试约定——不再每次重复
- 架构决策历史——新 session 自动加载上下文
- 工作记忆 7 天自动过期，优先级记忆永久保留

## 41+ 技能系统

技能分两层作用域：

- 项目级：`.omq/skills/`（团队共享，随代码提交）
- 用户级：`~/.omq/skills/`（个人习惯，跨项目生效）

用 `/skillify` 可以把当前会话中的重复模式一键提取为可复用技能。

## 实战场景

```
你：帮我构建一个 REST API
OMQ：[autopilot] 全自动端到端 → 分析需求 → 生成代码 → 编写测试 → 验证通过
```

```
你：同时开发前端、后端和数据库
OMQ：[team 3:executor] 三路并行组件开发 → 集成验证
```

```
你：修复所有 47 个 TypeScript 错误
OMQ：[team 5:executor] 五路并行独立修复 → 类型检查全绿
```

```
你：彻底重构认证模块
OMQ：[ralph] 持久循环 → 逐步重构 → 测试覆盖 → 验证完成前绝不停止
```

```
你：我有一个模糊的应用想法
OMQ：[deep-interview] 苏格拉底式提问 → 消除歧义 → 生成清晰需求文档
```

## 安装

**插件方式**（推荐）：通过 Qoder CLI marketplace 安装

**CLI 方式**：

```bash
npm i -g oh-my-qoder
```

**初始化**：

```bash
# 在 Qoder CLI 中输入
/oh-my-qoder:omq-setup
# 或直接说
setup omq
```

**诊断**：

```bash
/oh-my-qoder:omq-doctor
```

## 写在最后

oh-my-qoder 解决的不是「AI 写不好代码」的问题，而是「如何让 AI 像工程团队一样协作」的问题。

单个 AI 助手是一把好刀。OMQ 把它变成一整套厨房——每个工位各司其职，主厨（你）只需要点菜。

项目开源，欢迎 Star、Issue 和 PR。

---

*如果这篇文章对你有帮助，欢迎分享给同样在用 AI 编程的朋友。*
