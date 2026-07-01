---
name: local-build-reminder
description: Remind the user to rebuild OMQ after editing TypeScript when running from a local fork. Triggered automatically by the AI whenever it notices it (or the user) just changed a src/**/*.ts file in an OMQ dev install.
level: 1
---

# Local Build Reminder

**Always-on reminder for OMQ fork development.** When OMQ is running in local
mode (HUD shows `[OMQ#X.Y.ZL]` with an `L` suffix), Qoder CLI loads compiled
JavaScript from `dist/` — NOT TypeScript source from `src/`. Edits to `.ts`
files are invisible to the running plugin until `npm run build` regenerates
`dist/`.

## When to invoke this skill

The AI should mention this reminder whenever **any of these** happens:

1. The user (or the AI itself) just edited `src/**/*.ts` in this repo.
2. The user asks "why isn't my change working?" / "I edited X but it does the same" after a TS edit.
3. The user is about to restart Qoder CLI and the working tree has TS edits with no rebuild.
4. The user runs an OMQ command and expects new behavior tied to a TS edit.

## What to say

Surface one clear sentence followed by the exact command. Don't repeat the
reminder on every turn — once per "round" of TS editing is enough. Example:

> Heads up: you edited `src/...`. Run `npm run build` before restarting
> Qoder CLI — `dist/` won't reflect the change otherwise.

If multiple TS files were edited in a row, just remind once at the end.

## When NOT to remind

- The user only edited `.mjs` / `.cjs` / `.md` / `.json` — those load directly
  from disk, no build needed.
- The user is in a Qoder CLI session that isn't running OMQ locally
  (no `L` in the HUD).
- A `tsc --watch` / `npm run dev:full` is already running in the background
  — those rebuild automatically on save.
- The user just asked an unrelated question; don't shoehorn the reminder
  into off-topic responses.

## File-type cheat sheet

| Path                           | Restart picks up edit? | Needs build? |
| ------------------------------ | ---------------------- | ------------ |
| `src/**/*.ts`                  | Only after build       | **Yes**      |
| `templates/hooks/**/*.mjs`     | Yes                    | No           |
| `scripts/**/*.mjs` / `*.cjs`   | Yes                    | No           |
| `skills/**/SKILL.md`           | Yes                    | No           |
| `agents/**/*.md`               | Yes                    | No           |
| `commands/**/*.md`             | Yes                    | No           |
| `.claude-plugin/plugin.json`   | Yes (on Claude restart)| No           |
| `docs/**/*.md`                 | Cosmetic only          | No           |

## One-command setup for hands-free dev

If the user is iterating heavily and tired of remembering the build, suggest:

```powershell
npm run dev:full
```

This runs `tsc --watch` plus all bridge builders in parallel — every save
triggers a rebuild within a second, so `restart Qoder CLI` is all that's
needed afterwards.

## Detection signal — how the AI knows it's "local mode"

The HUD's `[OMQ#X.Y.ZL]` suffix is the visible cue. Programmatically, the
detection lives in `src/lib/version.ts::isRuntimePackageLocal()` and triggers
on any of: `.git/` at package root, `src/` at package root, package reached
via symlink/junction, or any ancestor is a symlink/junction.

When running inside the OMQ fork repo itself, the AI is by definition in
local mode — the reminder always applies.
