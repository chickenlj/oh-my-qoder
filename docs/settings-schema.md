# Settings Schema

This page documents OMQ-owned configuration keys in the standard OMQ config files:

- Project: `.qoder/omq.jsonc`
- User: `~/.config/qoder-omq/config.jsonc`

Project config overrides user config.

## `omq.companyContext` / `companyContext`

Issue #2692 and the PR #2694 follow-up review refer to this setting as `omq.companyContext`.
In the current OMQ config surface, the same block is written as the top-level
`companyContext` object inside the OMQ config files above.

```jsonc
{
  "companyContext": {
    "tool": "mcp__vendor__get_company_context",
    "onError": "warn"
  }
}
```

### Fields

| Field | Type | Required | Default | Meaning |
|-------|------|----------|---------|---------|
| `tool` | `string` | No | none | Full MCP tool name to call, for example `mcp__vendor__get_company_context` |
| `onError` | `"warn" \| "silent" \| "fail"` | No | `"warn"` | How prompt workflows react when the configured company-context tool call fails |

### Behavior

- If `companyContext` is omitted, the feature is off and workflows continue normally.
- If `tool` is configured, supported workflow prompts may call that MCP tool at their documented stage.
- `onError: "warn"` notes the failure and continues.
- `onError: "silent"` continues without an extra note.
- `onError: "fail"` stops and surfaces the tool-call error.

This remains a prompt-level workflow contract, not runtime enforcement. For the
full interface, trust boundary, trigger stages, and residual risk, see
[`company-context-interface.md`](./company-context-interface.md).
