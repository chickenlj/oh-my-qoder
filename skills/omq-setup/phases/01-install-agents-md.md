# Phase 1: Install AGENTS.md

## Determine Configuration Target

If `--local` flag was passed, set `CONFIG_TARGET=local`.
If `--global` flag was passed, set `CONFIG_TARGET=global`.

Otherwise (initial setup wizard), use AskUserQuestion to prompt:

**Question:** "Where should I configure oh-my-qoder?"

**Options:**
1. **Local (this project)** - Creates `.qoder/AGENTS.md` in current project directory. Best for project-specific configurations.
2. **Global (all projects)** - Creates `~/.qoder/AGENTS.md` for all Qoder CLI sessions. Best for consistent behavior everywhere.

Set `CONFIG_TARGET` to `local` or `global` based on user's choice.

If `CONFIG_TARGET=global` and `~/.qoder/AGENTS.md` already exists without OMQ markers, ask a second explicit question before running setup:

**Question:** "Global setup will change your base Qoder config. Which behavior do you want?"

**Options (default first):**
1. **Overwrite base AGENTS.md (Recommended)** - plain `qodercli` and `omq` both use OMQ globally.
2. **Keep base AGENTS.md; use OMQ only through `omq`** - preserve the user's base file, install OMQ into `AGENTS-omq.md`, and let `omq` force-load that companion config at launch.

Set `GLOBAL_INSTALL_STYLE=overwrite` or `preserve` based on the user's choice. If you did not ask this question, default `GLOBAL_INSTALL_STYLE=overwrite`.

## Download and Install AGENTS.md

**MANDATORY**: Always run this command. Do NOT skip. Do NOT use the Write tool. Let the setup script choose the safest canonical source (bundled instruction source first, GitHub fallback only if needed).

```bash
bash "${OMQ_SETUP_PLUGIN_ROOT:-${QODER_PLUGIN_ROOT}}/scripts/setup-agents-md.sh" <CONFIG_TARGET> [GLOBAL_INSTALL_STYLE]
```

Replace `<CONFIG_TARGET>` with `local` or `global`. For local installs, omit the optional style argument. For global installs, pass `overwrite` or `preserve` when you know the user's choice; otherwise let the script default to `overwrite`.

The script must install the canonical bundled instruction content and preserve the required
`<!-- OMQ:START -->` / `<!-- OMQ:END -->` markers. Do **not** hand-write, summarize, or
partially reconstruct AGENTS.md.

After running the script, verify the target file contains both markers. If marker validation
fails, stop and report the failure instead of writing AGENTS.md manually.

For `local` installs inside a git repository, the script also seeds `.git/info/exclude` with an OMC block that re-includes `.omq/`, ignores local `.omq/*` artifacts by default, and preserves `.omq/skills/` for project skills you intend to commit.

**FALLBACK** if curl fails:
Tell user to manually download from:
https://raw.githubusercontent.com/chickenlj/oh-my-qoder/main/docs/CLAUDE.md

**Note**: The downloaded AGENTS.md includes Context Persistence instructions with `<remember>` tags for surviving conversation compaction.

**Note**: Preserve mode installs OMQ into a companion `AGENTS-omq.md` with a small managed import block, and `omq` launch force-loads that companion config without changing plain `qodercli`.

## Report Success

If `CONFIG_TARGET` is `local`:
```
OMQ Project Configuration Complete
- AGENTS.md: Updated with latest configuration from GitHub at ./.qoder/AGENTS.md
- Git excludes: Added local `.omq/*` ignore rules to `.git/info/exclude` (keeps `.omq/skills/` trackable for committed project skills)
- Backup: Previous AGENTS.md backed up (if existed)
- Scope: PROJECT - applies only to this project
- Hooks: Provided by plugin (no manual installation needed)
- Agents: 28+ available (base + tiered variants)
- Model routing: Haiku/Sonnet/Opus based on task complexity

Note: This configuration is project-specific and won't affect other projects or global settings.
```

If `CONFIG_TARGET` is `global`:
```
OMQ Global Configuration Complete
- AGENTS.md: Updated at ~/.qoder/AGENTS.md, or preserved with explicit preserve mode
- Companion: May install ~/.qoder/AGENTS-omq.md when preserve mode is chosen
- Backup: Previous AGENTS.md backed up (if existed)
- Scope: GLOBAL - applies to all Qoder CLI sessions
- Hooks: Provided by plugin (no manual installation needed)
- Agents: 28+ available (base + tiered variants)
- Model routing: Haiku/Sonnet/Opus based on task complexity

Note: Hooks are now managed by the plugin system automatically. No manual hook installation required.
```

## Save Progress

```bash
bash "${OMQ_SETUP_PLUGIN_ROOT:-${QODER_PLUGIN_ROOT}}/scripts/setup-progress.sh" save 2 <CONFIG_TARGET>
```

## Early Exit for Flag Mode

If `--local` or `--global` flag was used, clear state and **STOP HERE**:
```bash
bash "${OMQ_SETUP_PLUGIN_ROOT:-${QODER_PLUGIN_ROOT}}/scripts/setup-progress.sh" clear
```
Do not continue to Phase 2 or other phases.
