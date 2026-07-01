> ## Documentation Index
> Fetch the complete documentation index at: https://docs.qoder.com/llms.txt
> Use this file to discover all available pages before exploring further.

# 快速开始

Qoder Agent SDK 让你用 TypeScript 调用 Qoder AI 的能力——读写文件、搜索代码、执行命令等——只需几行代码就能把 AI Agent 嵌入到你的应用或脚本里。

<div id="前置条件" />

## 前置条件

* Node.js 18+

<div id="安装" />

## 安装

```bash theme={null}
npm install @qoder-ai/qoder-agent-sdk
```

<div id="认证" />

## 认证

SDK 通过 Personal Access Token (PAT) 认证身份，适用于脚本、CI 流水线和第三方集成场景。

到 [qoder.com/account/integrations](https://qoder.com/account/integrations) 生成 PAT（生成后立即复制，页面关闭后无法再次查看）。详细步骤、自定义环境变量、复用本机 `qodercli` 登录态等，见 [SDK 认证](/zh/cli/sdk/authentication)。

拿到 PAT 后，推荐先设置环境变量：

```bash theme={null}
export QODER_PERSONAL_ACCESS_TOKEN="<your-qoder-personal-access-token>"
node agent.mjs
```

然后用 `accessTokenFromEnv()` 配置认证：

```js theme={null}
import { accessTokenFromEnv, query } from '@qoder-ai/qoder-agent-sdk';

const stream = query({
  prompt: 'Hello',
  options: {
    auth: accessTokenFromEnv(),
  },
});
```

SDK 会在启动 qodercli 前读取该环境变量，并把解析后的 access token 写入一次性的 auth payload。通常不需要再通过 `env` 选项传 PAT；如果显式提供了 `options.env`，SDK 会优先从其中读取同名变量。

> **安全提示**：不要把 PAT 硬编码在代码仓库中。推荐通过环境变量或密钥管理服务注入。

<div id="示例" />

## 示例

创建 `agent.mjs`：

```js theme={null}
import { accessTokenFromEnv, query } from '@qoder-ai/qoder-agent-sdk';

for await (const message of query({
  prompt: 'Analyze the codebase, find functions without test coverage, and write unit tests for them.',
  options: {
    auth: accessTokenFromEnv(),
    allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'],
    permissionMode: 'acceptEdits',  // Auto-approve file edits
  },
})) {
  if (message.type === 'assistant') {
    for (const block of message.message.content) {
      if (block.type === 'text') {
        console.log(block.text);              // AI text response
      } else if (block.type === 'tool_use') {
        console.log(`Tool: ${block.name}`);   // Tool being called
      }
    }
  } else if (message.type === 'result') {
    console.log(`Done: ${message.subtype}`);  // Final result
  }
}
```

```bash theme={null}
node agent.mjs
```

Agent 会自主浏览项目、找到缺少测试覆盖的函数、生成测试文件并运行验证。

<div id="下一步" />

## 下一步

* [SDK 认证](/zh/cli/sdk/authentication) — PAT、环境变量和认证错误处理
* [多轮对话](/zh/cli/sdk/multi-turn-conversation) — 多消息会话、管理会话生命周期
* [流式输出](/zh/cli/sdk/streaming-output) — 实时接收增量内容、打字机效果
* [SDK References](/zh/cli/sdk/references) — 完整 API 参考
