---
name: setup
description: Use first for install/update routing — sends setup, doctor, or MCP requests to the correct OMQ setup flow
level: 2
---

# Setup

Use `/oh-my-qoder:setup` as the unified setup/configuration entrypoint.

## Usage

```bash
/oh-my-qoder:setup                # full setup wizard
/oh-my-qoder:setup doctor         # installation diagnostics
/oh-my-qoder:setup mcp            # MCP server configuration
/oh-my-qoder:setup wizard --local # explicit wizard path
```

## Routing

Process the request by the **first argument only** so install/setup questions land on the right flow immediately:

- No argument, `wizard`, `local`, `global`, or `--force` -> route to `/oh-my-qoder:omq-setup` with the same remaining args
- `doctor` -> route to `/oh-my-qoder:omq-doctor` with everything after the `doctor` token
- `mcp` -> route to `/oh-my-qoder:mcp-setup` with everything after the `mcp` token

Examples:

```bash
/oh-my-qoder:setup --local          # => /oh-my-qoder:omq-setup --local
/oh-my-qoder:setup doctor --json    # => /oh-my-qoder:omq-doctor --json
/oh-my-qoder:setup mcp github       # => /oh-my-qoder:mcp-setup github
```

## Notes

- `/oh-my-qoder:omq-setup`, `/oh-my-qoder:omq-doctor`, and `/oh-my-qoder:mcp-setup` remain valid compatibility entrypoints.
- Prefer `/oh-my-qoder:setup` in new documentation and user guidance.

Task: {{ARGUMENTS}}
