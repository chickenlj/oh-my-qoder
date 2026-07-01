---
description: ""
---

# OMQ trace

This compatibility command keeps `/oh-my-qoder:trace` available without loading the full `trace` skill description in every Qoder CLI session.

## Dispatch

1. Read the full bundled skill instructions from the active OMQ plugin/install: `skills/trace/SKILL.md`.
2. Follow that SKILL.md exactly, treating the user's arguments as:

```text
$ARGUMENTS
```

If the file is not directly readable from the current working directory, locate it under the active `QODER_PLUGIN_ROOT`/`OMQ_PLUGIN_ROOT`, package root, or installed OMQ plugin directory, then continue.
