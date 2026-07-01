> ## Documentation Index
> Fetch the complete documentation index at: https://docs.qoder.com/llms.txt
> Use this file to discover all available pages before exploring further.

# 技能

技能（又称 Skill） 是 Qoder CLI 中将专业知识打包成可复用功能的机制。每个 Skill 包含一个 `SKILL.md` 文件，定义技能的描述、指令和可选的辅助文件（代码、脚本、模板等）。

**核心特点**：

* **智能调用**：模型根据用户请求和 Skill 描述自主决定何时使用（也支持命令加载）
* **模块化设计**：每个 Skill 专注解决特定类型的任务
* **灵活扩展**：支持用户级和项目级的自定义 Skill

## 快速开始

以下示例创建一个用于生成 API 文档的 Skill：

### 1. 创建 Skill 目录

在用户级 Skills 文件夹中创建目录。用户级 Skills 适用于所有项目，也可在 `.qoder/skills/` 中创建项目级 Skills 与团队共享。

```bash theme={null}
# 创建用户级 Skills 目录
mkdir -p ~/.qoder/skills/api-doc-generator
```

### 2. 编写 SKILL.md

每个 Skill 需要一个 `SKILL.md` 文件，以 `---` 标记之间的 YAML 元数据开头，必须包含 `name` 和 `description`，后跟 Markdown 指令。

创建 `~/.qoder/skills/api-doc-generator/SKILL.md`：

```markdown theme={null}
---
name: api-doc-generator
description: Generate comprehensive API documentation from code. Use when creating API docs, documenting endpoints, or generating OpenAPI specs.
---

# API Documentation Generator

When generating API documentation:
1. Identify all API endpoints and routes
2. Document request/response formats
3. Include authentication requirements
4. Add example requests and responses
5. Generate OpenAPI/Swagger specification if needed
```

### 3. 验证 Skill 加载

新会话会在启动时加载 Skill。如果 Qoder CLI 已在运行，使用 `/skills reload` 刷新已发现的 Skill。输入如下内容，验证是否加载成功：

```
What Skills are available?
```

或者输入命令验证：

```
/skills
```

对话中应显示 `api-doc-generator` 及其描述。

### 4. 测试 Skill

打开项目中的 API 路由文件，输入与 Skill 描述匹配的问题：

```
为这个 API 生成文档
```

Qoder CLI 应用 `api-doc-generator` Skill 并生成相关 API 文档。若未触发，尝试使用 `description` 中的关键词重新描述需求。

## 工作原理

Skill 可以由命令加载，也可以由模型自动调用。模型根据请求内容决定使用哪个 Skill，无需显式指定。

1. 启动时，Qoder CLI 加载每个 Skill 的名称和描述，保持快速启动的同时让模型了解各 Skill 的适用场景。
2. 请求与 Skill 描述匹配时，模型请求使用该 Skill 并加载完整 `SKILL.md`。部分 Skill 可直接执行；需要额外能力的 Skill 可能会请求授权。编写描述时应包含用户常用的关键词。
3. 模型按 Skill 指令执行，按需加载引用文件或运行脚本。

### 存储位置

存储位置决定 Skill 的可用范围：

| 位置  | 路径                                      | 作用域       | 适用场景                 |
| --- | --------------------------------------- | --------- | -------------------- |
| 用户级 | `~/.qoder/skills/{skill-name}/SKILL.md` | 当前用户的所有项目 | 个人工作流、实验性 Skill、个人工具 |
| 项目级 | `.qoder/skills/{skill-name}/SKILL.md`   | 仅当前项目     | 团队工作流、项目特定知识、共享脚本    |

同名时，项目级 Skill 覆盖用户级 Skill。

### Skill 与 Command 的区别

核心区别：**Skill 支持命令加载和自动触发**，Command 需显式输入 `/command-name`。

| 特性   | Skill                   | Command            |
| ---- | ----------------------- | ------------------ |
| 触发方式 | 模型自动判断或输入 `/skill-name` | 输入 `/command-name` |
| 主要用途 | 专业领域知识、复杂工作流            | 快速执行预设任务           |
| 存储位置 | `skills/` 目录            | `commands/` 目录     |
| 权限确认 | 视 Skill 能力而定，可能需要授权     | 不需要                |

> Skill 内部转换为特殊类型的 Command，两者共享执行机制。

## 使用场景

**适合使用 Skill 的场景**：

* **复杂专业任务**：需要领域知识的工作流（代码审查、PDF 处理、API 设计）
* **标准化流程**：按固定步骤执行的任务（提交规范、部署流程）
* **团队知识共享**：打包最佳实践供团队使用
* **重复性工作**：频繁执行且需要专业指导的任务

**适合使用 Command 的场景**：

* 简单快捷操作
* 需要明确触发的任务
* 无需复杂提示词指导的任务

## 创建 Skill

### 选择存储位置

| 类型  | 路径                                      | 作用域       |
| --- | --------------------------------------- | --------- |
| 用户级 | `~/.qoder/skills/{skill-name}/SKILL.md` | 当前用户的所有项目 |
| 项目级 | `.qoder/skills/{skill-name}/SKILL.md`   | 仅当前项目     |

> 项目级 Skill 覆盖同名的用户级 Skill。

**创建目录**：

```bash theme={null}
# 用户级
mkdir -p ~/.qoder/skills/{skill-name}

# 项目级
mkdir -p .qoder/skills/{skill-name}
```

### 组织目录结构

**目录结构示例**：

```
{skill-name}/
├── SKILL.md              # 必需：主文件
├── REFERENCE.md      # 可选：详细参考文档
├── EXAMPLES.md           # 可选：文档示例
├── scripts/              # 可选：辅助脚本
│   └── helper.py  
└── templates/            # 可选：模板文件
    └── template.txt      
```

在 `SKILL.md` 中引用辅助文件实现渐进式披露：

```markdown theme={null}
For better usage,see [REFERENCE.md]. For examples, see [EXAMPLES.md].

Run the helper script:

python scripts/helper.py input.txt
```

### 编写 SKILL.md

`SKILL.md` 是 Skill 中唯一必需的文件，包含 YAML 元数据和 Markdown 指令：

```markdown theme={null}
---
name: skill-name
description: Skill 功能简述，说明何时使用
---

# Skill Name

## Instructions
提供清晰的分步指导。

## Examples
展示具体用法。
```

**Frontmatter 字段**：

| 字段            | 必需 | 说明              | 限制                    |
| ------------- | -- | --------------- | --------------------- |
| `name`        | 是  | Skill 唯一标识符     | 仅小写字母、数字、连字符，最多 64 字符 |
| `description` | 是  | 功能描述，模型据此判断何时使用 | 最多 1024 字符            |

> **重要**：`description` 决定模型何时使用 Skill，应包含功能说明和使用时机。详见"最佳实践"部分。

## 使用 Skill

### 自动触发

直接描述需求，模型自动判断是否使用 Skill：

```
分析这个日志文件中的错误
```

模型识别并调用 `log-analyzer` Skill。

### 手动触发

输入 `/skill-name` 手动触发：

```
/log-analyzer
```

### 查看可用 Skill

**CLI 中查看**：

```
What Skills are available?
```

**文件系统查看**：

```bash theme={null}
# 列出用户级 Skill
ls ~/.qoder/skills/

# 列出项目级 Skill
ls .qoder/skills/

# 查看 SKILL.md 文件
ls ~/.qoder/skills/*/SKILL.md
ls .qoder/skills/*/SKILL.md
```

## 更新与删除

### 更新 Skill

直接编辑 `SKILL.md`。新会话会在启动时加载更新；如果 Qoder CLI 已在运行，执行 `/skills reload` 刷新已发现的 Skill。

### 删除 Skill

删除 Skill 目录：

```bash theme={null}
# 用户级
rm -rf ~/.qoder/skills/{skill-name}

# 项目级
rm -rf .qoder/skills/{skill-name}
```

> **警告**：删除操作永久移除所有文件，无法恢复。

## 最佳实践

### 保持专注

每个 Skill 专注于一个领域或任务类型。

**推荐**：

* `log-analyzer` - 日志分析
* `security-auditor` - 安全审计
* `database-migrator` - 数据库迁移

**不推荐**：

* `coding-helper` - 功能过于宽泛

### 编写清晰的 description

`description` 应包含：Skill 功能、使用时机和触发关键词。

**对比**：

```yaml theme={null}
# 不推荐：模糊
description: Helps with logs

# 推荐：具体
description: Analyze log files to identify errors, patterns, and performance issues. Use when debugging logs, investigating errors, or monitoring application behavior.
```

### 共享前测试

共享 Skill 前确保：

* 预期场景下能触发
* 指令清晰
* 覆盖常见边界情况

### 记录版本变更

在 SKILL.md 中添加版本历史：

```markdown theme={null}
## 版本历史

- v2.0.0 (2026-10-01): API 重大变更
- v1.1.0 (2026-09-15): 新增功能
- v1.0.0 (2026-09-01): 首次发布
```

## 故障排查

### Skill 未触发

**检查文件位置**：

```bash theme={null}
ls ~/.qoder/skills/*/SKILL.md
ls .qoder/skills/*/SKILL.md
```

确认 SKILL.md 存在且路径正确。

**检查 YAML 格式**：

查看 SKILL.md，验证 frontmatter 无语法错误（缩进、引号匹配）。

**检查 description 具体性**：

使用清晰具体的描述：

```yaml theme={null}
# 推荐：明确用途和触发条件
description: Analyze log files to identify errors, patterns, and performance issues. Use when debugging logs, investigating errors, or monitoring application behavior.

# 不推荐：模糊
description: For logs
```

### Skill 执行出错

**检查依赖**：

CLI 在需要时自动安装依赖（或请求权限）。

**检查脚本权限**：

```bash theme={null}
chmod +x .qoder/skills/my-skill/scripts/*.py
```

### 多个 Skill 冲突

Skill 相似导致混淆时，在 description 中使用不同触发词区分。

## Skill 示例

### 示例 1：简单 Skill

分析日志文件并诊断问题。

**目录结构**：

```
log-analyzer/
└── SKILL.md
```

**SKILL.md**：

```markdown theme={null}
---
name: log-analyzer
description: Analyze log files to identify errors, patterns, and performance issues. Use when debugging logs, investigating errors, or monitoring application behavior.
---

# Log Analyzer

## Instructions

1. Read the log file to understand its format
2. Identify and categorize issues:
   - Error patterns and stack traces
   - Warning messages
   - Performance bottlenecks
   - Unusual patterns or anomalies
3. Provide summary with:
   - Issue severity and frequency
   - Root cause analysis
   - Recommended solutions

## Analysis tips

- Focus on recent critical errors first
- Look for recurring patterns
- Check timestamp correlations across entries
```

### 示例 2：多文件 Skill

数据库迁移与版本管理工具。

**目录结构**：

```
database-migrator/
├── SKILL.md
├── MIGRATION_GUIDE.md
├── ROLLBACK.md
└── scripts/
    ├── generate_migration.py
    ├── validate_schema.py
    └── backup_db.sh
```

**SKILL.md**：

````markdown theme={null}
---
name: database-migrator
description: Generate and manage database migrations, schema changes, and data transformations. Use when creating migrations, modifying database schema, or managing database versions. Requires sqlalchemy and alembic packages.
---

# Database Migrator

## Quick start

Generate a new migration:

```bash
python scripts/generate_migration.py --name add_user_table
```

For detailed migration patterns, see [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md).
For rollback strategies, see [ROLLBACK.md](ROLLBACK.md).

## Workflow

1. **Analyze changes**: Compare current schema with desired state
2. **Generate migration**: Create migration file with up/down operations
3. **Validate**: Run `python scripts/validate_schema.py` to check syntax
4. **Backup**: Execute `scripts/backup_db.sh` before applying
5. **Apply**: Run migration in staging environment first
6. **Verify**: Check data integrity after migration

## Requirements

Install required packages:
```bash
pip install sqlalchemy alembic psycopg2-binary
```

## Safety checks

- Always backup before migrations
- Test rollback procedures
- Validate data integrity after changes
- Use transactions for atomic operations
````
