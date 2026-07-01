---
description: "Prepare OMQ context for a manual Qoder CLI /compact handoff."
argument-hint: "[optional compaction note]"
---

# OMQ Manual Context Compaction Helper

This command intentionally uses the plugin-scoped name `/oh-my-qoder:compact` instead of the bare `/compact` command. Bare `/compact` is reserved for Qoder CLI's native compaction command and must not be shadowed by OMQ.

OMQ cannot invoke Qoder CLI's built-in `/compact` from a plugin command: `/compact` is a native slash command, not a prompt skill, and a prompt-skill call for `compact` is not a supported handoff. This helper is instruction-only and must not claim that OMQ triggers compaction itself.

## Dispatch

1. Treat this as a request to prepare for manual Qoder CLI conversation compaction. Do not create a separate OMQ summarizer and do not replace existing auto-compress behavior.
2. Preserve any user note for the compaction request:

```text
$ARGUMENTS
```

3. Tell the user to run Qoder CLI's built-in bare `/compact` command directly. If the note above is non-empty, tell them to include it with `/compact`.
4. Before handing off, remind the user that Qoder CLI's normal `PreCompact` lifecycle should run OMQ's existing pre-compact hooks (`pre-compact`, project memory, and wiki preservation) when the native compaction occurs.
5. Do not invoke a `compact` skill, do not attempt to call `/compact` on the user's behalf, and do not manually summarize the session.

## User-facing handoff

Use this wording, adapting only the note text:

```text
OMQ prepared the compaction context, but plugin commands cannot trigger Qoder CLI's native /compact directly. Run this as a bare Qoder CLI command now:

/compact $ARGUMENTS

Bare /compact remains Qoder CLI's native command; OMQ does not shadow or invoke it.
```
