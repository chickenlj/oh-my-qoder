---
description: ""
---

# OMQ self-improve

This compatibility command keeps `/oh-my-qoder:self-improve` available without loading the full `self-improve` skill description in every Qoder CLI session.

## Dispatch

1. Read the full bundled skill instructions from the active OMQ plugin/install: `skills/self-improve/SKILL.md`.
2. Follow that SKILL.md exactly, treating the user's arguments as:

```text
$ARGUMENTS
```

If the file is not directly readable from the current working directory, locate it under the active `QODER_PLUGIN_ROOT`/`OMQ_PLUGIN_ROOT`, package root, or installed OMQ plugin directory, then continue.
