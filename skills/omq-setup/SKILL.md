---
name: omq-setup
description: Install or refresh oh-my-qoder for plugin, npm, and local-dev setups from the canonical setup flow
level: 2
---

# OMQ Setup

This is the **only command you need to learn**. After running this, everything else is automatic.

**When this skill is invoked, immediately execute the workflow below. Do not only restate or summarize these instructions back to the user.**

Note: All `~/.qoder/...` paths in this guide respect `CLAUDE_CONFIG_DIR` when that environment variable is set.

## Best-Fit Use

Choose this setup flow when the user wants to **install, refresh, or repair OMQ itself**.

- Marketplace/plugin install users should land here after `/plugin install oh-my-qoder`
- npm users should land here after `npm i -g oh-my-qoder@latest`
- local-dev and worktree users should land here after updating the checked-out repo and rerunning setup

## Flag Parsing

Check for flags in the user's invocation:
- `--help` → Show Help Text (below) and stop
- `--local` → Phase 1 only (target=local), then stop
- `--global` → Phase 1 only (target=global), then stop
- `--force` → Skip Pre-Setup Check, run full setup (Phase 1 → 2 → 3 → 4)
- No flags → Run Pre-Setup Check, then full setup if needed

## Help Text

When user runs with `--help`, display this and stop:

```
OMQ Setup - Configure oh-my-qoder

USAGE:
  /oh-my-qoder:omq-setup           Run initial setup wizard (or update if already configured)
  /oh-my-qoder:omq-setup --local   Configure local project (.qoder/AGENTS.md)
  /oh-my-qoder:omq-setup --global  Configure global settings (~/.qoder/AGENTS.md)
  /oh-my-qoder:omq-setup --force   Force full setup wizard even if already configured
  /oh-my-qoder:omq-setup --help    Show this help

MODES:
  Initial Setup (no flags)
    - Interactive wizard for first-time setup
    - Configures AGENTS.md (local or global)
    - Sets up HUD statusline
    - Checks for updates
    - Offers MCP server configuration
    - Configures team mode defaults (agent count, type, model)
    - If already configured, offers quick update option

  Local Configuration (--local)
    - Downloads fresh AGENTS.md to ./.qoder/
    - Backs up existing AGENTS.md to .qoder/AGENTS.md.backup.YYYY-MM-DD
    - Project-specific settings
    - Use this to update project config after OMQ upgrades

  Global Configuration (--global)
    - Downloads fresh AGENTS.md to ~/.qoder/
    - Backs up existing AGENTS.md to ~/.qoder/AGENTS.md.backup.YYYY-MM-DD
    - Default: explicitly overwrites ~/.qoder/AGENTS.md so plain `qodercli` also uses OMQ
    - Optional preserve mode keeps the user's base `AGENTS.md` and installs OMQ into `AGENTS-omq.md` for `omq` launches
    - Applies to all Qoder CLI sessions
    - Cleans up legacy hooks
    - Use this to update global config after OMQ upgrades

  Force Full Setup (--force)
    - Bypasses the "already configured" check
    - Runs the complete setup wizard from scratch
    - Use when you want to reconfigure preferences

EXAMPLES:
  /oh-my-qoder:omq-setup           # First time setup (or update AGENTS.md if configured)
  /oh-my-qoder:omq-setup --local   # Update this project
  /oh-my-qoder:omq-setup --global  # Update all projects
  /oh-my-qoder:omq-setup --force   # Re-run full setup wizard

For more info: https://github.com/chickenlj/oh-my-qoder
```


## Active Plugin Root Resolution

Before running setup shell commands or reading phase files, resolve the current OMQ plugin root. This prevents an already-running Qoder CLI session from continuing to use a stale `QODER_PLUGIN_ROOT` after `/plugin marketplace update omq` installs a newer cache version.

```bash
OMQ_SETUP_PLUGIN_ROOT=$(node -e "const f=require('fs'),p=require('path'),h=require('os').homedir(),d=(process.env.CLAUDE_CONFIG_DIR||p.join(h,'.qoder')).replace(/[\\/]+$/,''),b=p.join(d,'plugins','cache','omq','oh-my-qoder'),valid=r=>f.existsSync(p.join(r,'skills','omq-setup','SKILL.md'))||f.existsSync(p.join(r,'hooks','hooks.json'))||f.existsSync(p.join(r,'docs','CLAUDE.md'));try{const vs=f.readdirSync(b,{withFileTypes:true}).filter(e=>(e.isDirectory()||e.isSymbolicLink())&&/^\d+\.\d+\.\d+/.test(e.name)).map(e=>e.name).sort((a,c)=>c.localeCompare(a,void 0,{numeric:true}));const hit=vs.map(v=>p.join(b,v)).find(valid);if(hit)console.log(hit);else if(process.env.QODER_PLUGIN_ROOT)console.log(process.env.QODER_PLUGIN_ROOT)}catch{if(process.env.QODER_PLUGIN_ROOT)console.log(process.env.QODER_PLUGIN_ROOT)}")
export OMQ_SETUP_PLUGIN_ROOT
```

Use `${OMQ_SETUP_PLUGIN_ROOT:-${QODER_PLUGIN_ROOT}}` for all setup script and phase paths, then immediately repair stale cache references before any prompts or phase work:

```bash
node "${OMQ_SETUP_PLUGIN_ROOT:-${QODER_PLUGIN_ROOT}}/scripts/repair-plugin-cache.mjs"
```

## Pre-Setup Check: Already Configured?

**CRITICAL**: Before doing anything else, check if setup has already been completed. This prevents users from having to re-run the full setup wizard after every update.

```bash
# Check if setup was already completed
CONFIG_FILE="${CLAUDE_CONFIG_DIR:-$HOME/.qoder}/.omq-config.json"

if [ -f "$CONFIG_FILE" ]; then
  SETUP_COMPLETED=$(jq -r '.setupCompleted // empty' "$CONFIG_FILE" 2>/dev/null)
  SETUP_VERSION=$(jq -r '.setupVersion // empty' "$CONFIG_FILE" 2>/dev/null)

  if [ -n "$SETUP_COMPLETED" ] && [ "$SETUP_COMPLETED" != "null" ]; then
    echo "OMQ setup was already completed on: $SETUP_COMPLETED"
    [ -n "$SETUP_VERSION" ] && echo "Setup version: $SETUP_VERSION"
    ALREADY_CONFIGURED="true"
  fi
fi
```

### If Already Configured (and no --force flag)

If `ALREADY_CONFIGURED` is true AND the user did NOT pass `--force`, `--local`, or `--global` flags:

Use AskUserQuestion to prompt:

**Question:** "OMQ is already configured. What would you like to do?"

**Options:**
1. **Update AGENTS.md only** - Download latest AGENTS.md without re-running full setup
2. **Run full setup again** - Go through the complete setup wizard
3. **Cancel** - Exit without changes

**If user chooses "Update AGENTS.md only":**
- Detect if local (.qoder/AGENTS.md) or global (~/.qoder/AGENTS.md) config exists
- If local exists, run: `bash "${OMQ_SETUP_PLUGIN_ROOT:-${QODER_PLUGIN_ROOT}}/scripts/setup-claude-md.sh" local`
- If only global exists, run: `bash "${OMQ_SETUP_PLUGIN_ROOT:-${QODER_PLUGIN_ROOT}}/scripts/setup-claude-md.sh" global`
- Skip all other steps
- Report success and exit

**If user chooses "Run full setup again":**
- Continue with Resume Detection below

**If user chooses "Cancel":**
- Exit without any changes

### Force Flag Override

If user passes `--force` flag, skip this check and proceed directly to setup.

## Resume Detection

Before starting any phase, check for existing state:

```bash
bash "${OMQ_SETUP_PLUGIN_ROOT:-${QODER_PLUGIN_ROOT}}/scripts/setup-progress.sh" resume
```

If state exists (output is not "fresh"), use AskUserQuestion to prompt:

**Question:** "Found a previous setup session. Would you like to resume or start fresh?"

**Options:**
1. **Resume from step $LAST_STEP** - Continue where you left off
2. **Start fresh** - Begin from the beginning (clears saved state)

If user chooses "Start fresh":
```bash
bash "${OMQ_SETUP_PLUGIN_ROOT:-${QODER_PLUGIN_ROOT}}/scripts/setup-progress.sh" clear
```

## Phase Execution

### For `--local` or `--global` flags:
Read the file at `${OMQ_SETUP_PLUGIN_ROOT:-${QODER_PLUGIN_ROOT}}/skills/omq-setup/phases/01-install-claude-md.md` and follow its instructions.
(The phase file handles early exit for flag mode.)

### For full setup (default or --force):
Execute phases sequentially. For each phase, read the corresponding file and follow its instructions:

1. **Phase 1 - Install AGENTS.md**: Read `${OMQ_SETUP_PLUGIN_ROOT:-${QODER_PLUGIN_ROOT}}/skills/omq-setup/phases/01-install-claude-md.md` and follow its instructions.

2. **Phase 2 - Environment Configuration**: Read `${OMQ_SETUP_PLUGIN_ROOT:-${QODER_PLUGIN_ROOT}}/skills/omq-setup/phases/02-configure.md` and follow its instructions. Phase 2 must delegate HUD/statusLine setup to the `hud` skill; do not generate or patch `statusLine` paths inline here.

3. **Phase 3 - Integration Setup**: Read `${OMQ_SETUP_PLUGIN_ROOT:-${QODER_PLUGIN_ROOT}}/skills/omq-setup/phases/03-integrations.md` and follow its instructions.

4. **Phase 4 - Completion**: Read `${OMQ_SETUP_PLUGIN_ROOT:-${QODER_PLUGIN_ROOT}}/skills/omq-setup/phases/04-welcome.md` and follow its instructions.

## Graceful Interrupt Handling

**IMPORTANT**: This setup process saves progress after each phase via `${OMQ_SETUP_PLUGIN_ROOT:-${QODER_PLUGIN_ROOT}}/scripts/setup-progress.sh`. If interrupted (Ctrl+C or connection loss), the setup can resume from where it left off.

## Keeping Up to Date

After installing oh-my-qoder updates (via npm or plugin update):

**Automatic**: Just run `/oh-my-qoder:omq-setup` - it will detect you've already configured and offer a quick "Update AGENTS.md only" option that skips the full wizard.

**Manual options**:
- `/oh-my-qoder:omq-setup --local` to update project config only
- `/oh-my-qoder:omq-setup --global` to update global config only
- `/oh-my-qoder:omq-setup --force` to re-run the full wizard (reconfigure preferences)

This ensures you have the newest features and agent configurations without the token cost of repeating the full setup.
