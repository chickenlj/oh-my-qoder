> ## Documentation Index
> Fetch the complete documentation index at: https://docs.qoder.com/llms.txt
> Use this file to discover all available pages before exploring further.

# 插件

插件（Plugin）是 Qoder CLI 中将命令、子 Agent、Skill、Hook、MCP server 等扩展能力打包成一个目录，便于安装、启用与共享的机制。一个插件目录可以包含一个或多个扩展资源，安装后这些资源会被 CLI 自动发现并加载。

## 快速开始

下面创建一个仅包含一个 Skill 的最小插件，并以本地目录形式安装。

### 1. 创建插件目录

```bash theme={null}
mkdir -p ~/my-plugin/.qoder-plugin
mkdir -p ~/my-plugin/skills/hello
```

### 2. 编写 manifest

推荐每个插件都声明 `plugin.json`，至少包含 `name` 字段，以获得稳定的元信息（详见后文 [manifest 字段](#manifest-字段)）：

`~/my-plugin/.qoder-plugin/plugin.json`：

```json theme={null}
{
  "name": "my-plugin",
  "version": "0.1.0",
  "description": "我的第一个插件"
}
```

### 3. 添加一个 Skill

`~/my-plugin/skills/hello/SKILL.md`：

```markdown theme={null}
---
name: hello
description: 打个招呼。当用户说"打招呼"时使用。
---

# Hello Skill

向用户友好地打个招呼。
```

### 4. 安装

```bash theme={null}
qodercli plugins install ~/my-plugin
```

输出 `Plugin "my-plugin@local" installed successfully. Run /plugins reload to apply.` 后，重启 CLI 或在 TUI 中执行 `/plugins reload`，即可使用插件提供的 Skill。

## 插件目录结构

`.qoder-plugin/plugin.json` 是 Qoder 推荐的 manifest 位置；如未声明，CLI 会按约定加载并把目录名作为插件名。约定目录**有则加载，无则忽略**。

```
my-plugin/
├── .qoder-plugin/
│   └── plugin.json        # 推荐：manifest（声明 name/version 等元信息）
├── commands/              # 自定义命令（.md 文件或子目录）
├── agents/                # 自定义子 Agent
├── skills/                # 自定义 Skill
├── hooks/
│   └── hooks.json         # Hook 配置
├── output-styles/         # 输出样式
├── bin/                   # 插件可执行文件
└── .mcp.json              # 插件附带的 MCP server 声明
```

约定目录的行为说明：

| 目录 / 文件            | 用途                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------- |
| `commands/`        | 注册自定义斜杠命令，结构与 `~/.qoder/commands/` 一致                                                 |
| `agents/`          | 注册自定义子 Agent                                                                          |
| `skills/`          | 注册 Skill，结构与 `~/.qoder/skills/` 一致                                                    |
| `hooks/hooks.json` | 提供 Hook 配置；使用 `{ "hooks": ... }` 包裹格式，其中 `hooks` 字段的值与 `settings.json` 的 `hooks` 字段一致 |
| `output-styles/`   | 提供自定义输出样式                                                                             |
| `bin/`             | 插件提供的可执行文件                                                                            |
| `.mcp.json`        | 插件附带的 MCP server 声明                                                                   |

## manifest 字段

`plugin.json` 仅 `name` 必填，其余字段均可省略。

| 字段            | 必填 | 说明                                           |
| ------------- | -- | -------------------------------------------- |
| `name`        | 是  | 插件唯一标识；不能包含空格，建议使用 kebab-case（如 `my-plugin`） |
| `version`     | 否  | 语义化版本号（如 `1.0.0`）                            |
| `description` | 否  | 简短描述                                         |
| `author`      | 否  | 作者信息                                         |
| `homepage`    | 否  | 文档或主页 URL                                    |
| `repository`  | 否  | 源码仓库 URL                                     |
| `license`     | 否  | SPDX license 标识（如 `MIT`）                     |
| `keywords`    | 否  | 用于发现和分类的标签数组                                 |

> 进阶：manifest 还支持显式声明 `commands` / `agents` / `skills` / `hooks` / `outputStyles` 等字段，用于覆盖默认的目录约定或使用内联内容（注意 manifest 字段使用驼峰命名 `outputStyles`，对应的约定目录仍是 `output-styles/`）。如不显式声明，CLI 会按上一节的目录约定自动发现。

## 安装作用域

插件可以安装到三个作用域：

| 作用域       | 说明                                                       | 适用场景        |
| --------- | -------------------------------------------------------- | ----------- |
| `user`    | 全局可用，对当前用户的所有项目生效（默认）                                    | 个人常用插件      |
| `project` | 仅在当前项目生效，配置写入项目级 `settings.json`，可提交 git 与团队共享           | 团队共享的项目专属插件 |
| `local`   | 仅在当前项目生效，配置写入项目级 `settings.local.json`，建议加到 `.gitignore` | 本地实验性插件     |

## 命令

插件相关命令位于 `qodercli plugins` 子命令组下，别名为 `plugin`。

### 安装：`plugins install`

从本地目录路径安装插件：

```bash theme={null}
qodercli plugins install ~/my-plugin
qodercli plugins install ./relative/path/to/plugin
qodercli plugins install /abs/path/to/plugin --scope project
```

| 参数 / 选项               | 说明                                 |
| --------------------- | ---------------------------------- |
| `<plugin>`            | 本地插件目录路径（绝对路径、相对路径或 `~/...` 均可）    |
| `-s, --scope <scope>` | 安装作用域：`user`（默认）、`project`、`local` |

安装后建议重启 CLI 或在 TUI 中执行 `/plugins reload` 让变更生效。

### 卸载：`plugins uninstall`

```bash theme={null}
qodercli plugins uninstall my-plugin
qodercli plugins uninstall my-plugin --scope project --keep-data
```

别名：`remove` / `rm`。

| 参数 / 选项               | 说明                                    |
| --------------------- | ------------------------------------- |
| `<plugin>`            | 已安装插件名                                |
| `-s, --scope <scope>` | 卸载来源的作用域：`user`（默认）、`project`、`local` |
| `--keep-data`         | 保留插件的数据目录                             |

### 启用 / 禁用：`plugins enable` / `plugins disable`

```bash theme={null}
qodercli plugins enable my-plugin
qodercli plugins disable my-plugin
qodercli plugins enable my-plugin --scope project
qodercli plugins disable --all
```

| 参数 / 选项               | 说明                            |
| --------------------- | ----------------------------- |
| `<plugin>`            | 已安装插件名                        |
| `-s, --scope <scope>` | 写入哪个作用域；不填则自动选择               |
| `-a, --all`           | （仅 `disable`）一键禁用作用域内所有已启用的插件 |

启用 / 禁用通过修改对应作用域 `settings.json` 中的 `enabledPlugins` 字段实现。被禁用的插件不会在新会话中加载。

### 列出：`plugins list`

```bash theme={null}
qodercli plugins list
qodercli plugins list --json
qodercli plugins list --plugin-dir ./local-plugins ./more-plugins
```

| 选项                             | 说明                             |
| ------------------------------ | ------------------------------ |
| `--json`                       | 以 JSON 输出                      |
| `-o, --output-format <format>` | `text` 或 `json`（与 `--json` 等价） |
| `--plugin-dir <dirs...>`       | 额外扫描这些目录中的插件并合并到列表中（不会自动安装）    |

### 校验：`plugins validate`

校验本地插件目录的结构是否符合约定，常用于开发期：

```bash theme={null}
qodercli plugins validate ~/my-plugin
```

校验会列出发现的命令、Skill、Hook 等组件，并在目录下完全没有任何约定子目录时打印一条提示。注意：`validate` 本身不会因此失败，但 `plugins install` 安装本地插件时要求至少包含一个可识别的组件或资源（约定目录或 manifest 中显式声明的资源均可）。

> **建议**：始终在 `.qoder-plugin/plugin.json` 中声明 `name`、`version` 等元信息。这是 Qoder 推荐的插件组织方式——否则插件在 `plugins list`、`enabledPlugins` 配置等位置只能用目录名作为标识，不利于跨环境识别和共享。

## 配置 `enabledPlugins`

启用 / 禁用状态保存在 `settings.json` 的 `enabledPlugins` 字段中：

```json theme={null}
{
  "enabledPlugins": {
    "my-plugin@local": true,
    "another-plugin@local": false
  }
}
```

* 值为 `true`：启用该插件
* 值为 `false`：显式禁用该插件

> 配置 key 必须与已安装的插件 ID 完全匹配（本地安装的插件 ID 形如 `name@local`）。可通过 `plugins list` 查看每个插件的标识。

通过 `plugins enable` / `plugins disable` 修改该字段比手工编辑更可靠，因为命令会处理作用域选择、依赖关系等细节。

## 编写插件 Hook

插件可以在 `hooks/hooks.json` 中声明自身的 Hook。文件使用**包裹格式**：顶层是一个对象，其中 `hooks` 字段的值与 `settings.json` 的 `hooks` 字段一致：

```json theme={null}
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "$QODER_PLUGIN_ROOT/scripts/check.sh"
          }
        ]
      }
    ]
  }
}
```

> 这一点与 `settings.json` 不同：`settings.json` 直接写 `hooks` 字段；插件的 `hooks/hooks.json` 需要外层多一层 `{ "hooks": ... }` 包裹。

插件提供的 Hook 在执行时会额外得到两个环境变量：

| 环境变量                | 说明                           |
| ------------------- | ---------------------------- |
| `QODER_PLUGIN_ROOT` | 当前插件的安装根目录                   |
| `QODER_PLUGIN_DATA` | 当前插件的数据目录（独立于安装目录，便于跨升级保留状态） |

更多 Hook 编写细节见[钩子](./hooks)。
