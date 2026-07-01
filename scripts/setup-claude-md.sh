#!/usr/bin/env bash
# setup-claude-md.sh - Unified OMQ instruction-file download/merge script
# Usage: setup-claude-md.sh <local|global> [overwrite|preserve]
#
# Source content lives in docs/CLAUDE.md (carries OMQ markers); it is installed
# to the host instruction file AGENTS.md (the file qodercli loads).
# Handles: version extraction, backup, download, marker stripping, merge, version reporting.
# For global mode, defaults to overwrite; preserve mode keeps the user's base
# AGENTS.md and writes OMQ content to a companion file (AGENTS-omq.md) for `omq` launch.

set -euo pipefail

MODE="${1:?Usage: setup-claude-md.sh <local|global> [overwrite|preserve]}"
INSTALL_STYLE="${2:-overwrite}"
DOWNLOAD_URL="https://raw.githubusercontent.com/chickenlj/oh-my-qoder/main/docs/CLAUDE.md"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
. "$SCRIPT_DIR/lib/config-dir.sh"

# Resolve active plugin root from installed_plugins.json.
# Handles stale QODER_PLUGIN_ROOT when a session was started before a plugin
# update (e.g. 4.8.2 session invoking setup after updating to 4.9.0).
# Same pattern as run.cjs resolveTarget() fallback.
resolve_active_plugin_root() {
  is_valid_plugin_root() {
    local candidate="$1"
    [ -d "$candidate" ] && [ -f "${candidate}/docs/CLAUDE.md" ]
  }

  list_cache_versions() {
    local base="$1"
    ls -1 "$base" | grep -E '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$'
  }

  local config_dir
  config_dir="$(resolve_claude_config_dir)"
  local installed_plugins="${config_dir}/plugins/installed_plugins.json"
  local cache_base
  cache_base="$(dirname "$SCRIPT_PLUGIN_ROOT")"

  if [ -f "$installed_plugins" ] && command -v jq >/dev/null 2>&1; then
    local active_path
    active_path=$(jq -r '
      (.plugins // .)
      | to_entries[]
      | select(.key | startswith("oh-my-qoder"))
      | .value[0].installPath // empty
    ' "$installed_plugins" 2>/dev/null)

    if [ -n "$active_path" ] && is_valid_plugin_root "$active_path"; then
      # Guard against stale installed_plugins.json after plugin update:
      # if cache contains a newer valid version, prefer it.
      if [ -d "$cache_base" ]; then
        local active_version latest_cache_version preferred_version
        active_version="$(basename "$active_path")"
        latest_cache_version=$(list_cache_versions "$cache_base" | while IFS= read -r v; do
          if is_valid_plugin_root "${cache_base}/${v}"; then
            echo "$v"
          fi
        done | sort -t. -k1,1nr -k2,2nr -k3,3nr | head -1)

        if [ -n "$latest_cache_version" ] && [ -d "${cache_base}/${latest_cache_version}" ]; then
          preferred_version=$(printf '%s\n%s\n' "$active_version" "$latest_cache_version" | grep -E '^[0-9]+\.[0-9]+\.[0-9]+' | sort -t. -k1,1nr -k2,2nr -k3,3nr | head -1)
          if [ "$preferred_version" = "$latest_cache_version" ] && [ "$latest_cache_version" != "$active_version" ]; then
            echo "${cache_base}/${latest_cache_version}"
            return 0
          fi
        fi
      fi

      echo "$active_path"
      return 0
    fi
  fi

  # Fallback: scan sibling version directories for the latest (mirrors run.cjs)
  if [ -d "$cache_base" ]; then
    local latest
    latest=$(list_cache_versions "$cache_base" | while IFS= read -r v; do
      if is_valid_plugin_root "${cache_base}/${v}"; then
        echo "$v"
      fi
    done | sort -t. -k1,1nr -k2,2nr -k3,3nr | head -1)
    if [ -n "$latest" ] && is_valid_plugin_root "${cache_base}/${latest}"; then
      echo "${cache_base}/${latest}"
      return 0
    fi
  fi

  echo "$SCRIPT_PLUGIN_ROOT"
}

ACTIVE_PLUGIN_ROOT="$(resolve_active_plugin_root)"
CANONICAL_CLAUDE_MD="${ACTIVE_PLUGIN_ROOT}/docs/CLAUDE.md"
CANONICAL_OMQ_REFERENCE_SKILL="${ACTIVE_PLUGIN_ROOT}/skills/omq-reference/SKILL.md"

ensure_local_omq_git_exclude() {
  local exclude_path

  if ! exclude_path=$(git rev-parse --git-path info/exclude 2>/dev/null); then
    echo "Skipped OMQ git exclude setup (not a git repository)"
    return 0
  fi

  mkdir -p "$(dirname "$exclude_path")"

  local block_start="# BEGIN OMQ local artifacts"

  if [ -f "$exclude_path" ] && grep -Fq "$block_start" "$exclude_path"; then
    if grep -Fxq ".omx/" "$exclude_path"; then
      echo "OMQ git exclude already configured"
      return 0
    fi

    if [ -s "$exclude_path" ]; then
      printf '\n' >> "$exclude_path"
    fi
    printf '.omx/\n' >> "$exclude_path"
    echo "Updated OMQ git exclude for local OMX artifacts"
    return 0
  fi

  if [ -f "$exclude_path" ] && [ -s "$exclude_path" ]; then
    printf '\n' >> "$exclude_path"
  fi

  cat >> "$exclude_path" <<'EOF'
# BEGIN OMQ local artifacts
!.omq/
.omq/*
!.omq/skills/
!.omq/skills/**
.omx/
# END OMQ local artifacts
EOF

  echo "Configured git exclude for local OMQ/OMX artifacts (preserving .omq/skills/)"
}

# Determine target path
CONFIG_DIR="$(resolve_claude_config_dir)"
if [ "$MODE" = "local" ]; then
  mkdir -p .qoder/skills/omq-reference
  TARGET_PATH=".qoder/AGENTS.md"
  SKILL_TARGET_PATH=".qoder/skills/omq-reference/SKILL.md"
elif [ "$MODE" = "global" ]; then
  mkdir -p "$CONFIG_DIR/skills/omq-reference"
  TARGET_PATH="$CONFIG_DIR/AGENTS.md"
  SKILL_TARGET_PATH="$CONFIG_DIR/skills/omq-reference/SKILL.md"
else
  echo "ERROR: Invalid mode '$MODE'. Use 'local' or 'global'." >&2
  exit 1
fi

if [ "$INSTALL_STYLE" != "overwrite" ] && [ "$INSTALL_STYLE" != "preserve" ]; then
  echo "ERROR: Invalid install style '$INSTALL_STYLE'. Use 'overwrite' or 'preserve'." >&2
  exit 1
fi


install_omq_reference_skill() {
  local source_label=""
  local temp_skill
  temp_skill=$(mktemp /tmp/omq-reference-skill-XXXXXX.md)

  if [ -f "$CANONICAL_OMQ_REFERENCE_SKILL" ]; then
    cp "$CANONICAL_OMQ_REFERENCE_SKILL" "$temp_skill"
    source_label="$CANONICAL_OMQ_REFERENCE_SKILL"
  elif [ -n "${QODER_PLUGIN_ROOT:-}" ] && [ -f "${QODER_PLUGIN_ROOT}/skills/omq-reference/SKILL.md" ]; then
    cp "${QODER_PLUGIN_ROOT}/skills/omq-reference/SKILL.md" "$temp_skill"
    source_label="${QODER_PLUGIN_ROOT}/skills/omq-reference/SKILL.md"
  else
    rm -f "$temp_skill"
    echo "Skipped omq-reference skill install (canonical skill source unavailable)"
    return 0
  fi

  if [ ! -s "$temp_skill" ]; then
    rm -f "$temp_skill"
    echo "Skipped omq-reference skill install (empty canonical skill source: $source_label)"
    return 0
  fi

  mkdir -p "$(dirname "$SKILL_TARGET_PATH")"
  cp "$temp_skill" "$SKILL_TARGET_PATH"
  rm -f "$temp_skill"
  echo "Installed omq-reference skill to $SKILL_TARGET_PATH"
}

# Extract old version before download
OLD_VERSION=$(grep -m1 'OMQ:VERSION:' "$TARGET_PATH" 2>/dev/null | sed -E 's/.*OMQ:VERSION:([^ ]+).*/\1/' || true)
if [ -z "$OLD_VERSION" ]; then
  OLD_VERSION=$(omq --version 2>/dev/null | head -1 || true)
fi
if [ -z "$OLD_VERSION" ]; then
  OLD_VERSION="none"
fi

# Backup existing
BACKUP_DATE=""
if [ -f "$TARGET_PATH" ]; then
  BACKUP_DATE=$(date +%Y-%m-%d_%H%M%S)
  BACKUP_PATH="${TARGET_PATH}.backup.${BACKUP_DATE}"
  cp "$TARGET_PATH" "$BACKUP_PATH"
  echo "Backed up existing AGENTS.md to $BACKUP_PATH"
fi

# Load canonical OMQ content to temp file
TEMP_OMQ=$(mktemp /tmp/omq-claude-XXXXXX.md)
trap 'rm -f "$TEMP_OMQ"' EXIT

OMQ_IMPORT_START='<!-- OMQ:IMPORT:START -->'
OMQ_IMPORT_END='<!-- OMQ:IMPORT:END -->'
COMPANION_FILENAME='AGENTS-omq.md'

write_wrapped_omq_file() {
  local destination="$1"
  mkdir -p "$(dirname "$destination")"
  {
    echo '<!-- OMQ:START -->'
    cat "$TEMP_OMQ"
    echo '<!-- OMQ:END -->'
  } > "$destination"
}

ensure_managed_companion_import() {
  local target_path="$1"
  local companion_name="$2"
  local import_block
  import_block=$(cat <<EOF
$OMQ_IMPORT_START
@${companion_name}
$OMQ_IMPORT_END
EOF
)

  if grep -Fq "$OMQ_IMPORT_START" "$target_path"; then
    perl -0pe 's/^<!-- OMQ:IMPORT:START -->\R[\s\S]*?^<!-- OMQ:IMPORT:END -->(?:\R)?//msg' "$target_path" > "${target_path}.importless"
    mv "${target_path}.importless" "$target_path"
  fi

  if [ -s "$target_path" ]; then
    printf '\n\n%s\n' "$import_block" >> "$target_path"
  else
    printf '%s\n' "$import_block" > "$target_path"
  fi
}

ensure_not_symlink_path() {
  local target_path="$1"
  local label="$2"

  if [ -L "$target_path" ]; then
    echo "ERROR: Refusing to write $label because the destination is a symlink: $target_path" >&2
    exit 1
  fi
}

VALIDATION_PATH="$TARGET_PATH"

SOURCE_LABEL=""
if [ -f "$CANONICAL_CLAUDE_MD" ]; then
  cp "$CANONICAL_CLAUDE_MD" "$TEMP_OMQ"
  SOURCE_LABEL="$CANONICAL_CLAUDE_MD"
elif [ -n "${QODER_PLUGIN_ROOT:-}" ] && [ -f "${QODER_PLUGIN_ROOT}/docs/CLAUDE.md" ]; then
  cp "${QODER_PLUGIN_ROOT}/docs/CLAUDE.md" "$TEMP_OMQ"
  SOURCE_LABEL="${QODER_PLUGIN_ROOT}/docs/CLAUDE.md"
else
  curl -fsSL "$DOWNLOAD_URL" -o "$TEMP_OMQ"
  SOURCE_LABEL="$DOWNLOAD_URL"
fi

if [ ! -s "$TEMP_OMQ" ]; then
  echo "ERROR: Failed to download CLAUDE.md. Aborting."
  echo "FALLBACK: Manually download from: $DOWNLOAD_URL"
  rm -f "$TEMP_OMQ"
  exit 1
fi

if ! grep -q '<!-- OMQ:START -->' "$TEMP_OMQ" || ! grep -q '<!-- OMQ:END -->' "$TEMP_OMQ"; then
  echo "ERROR: Canonical CLAUDE.md source is missing required OMQ markers: $SOURCE_LABEL" >&2
  echo "Refusing to install a summarized or malformed CLAUDE.md." >&2
  exit 1
fi

# Strip existing markers from downloaded content (idempotency)
# Use awk for cross-platform compatibility (GNU/BSD)
if grep -q '<!-- OMQ:START -->' "$TEMP_OMQ"; then
  awk '/<!-- OMQ:END -->/{p=0} p; /<!-- OMQ:START -->/{p=1}' "$TEMP_OMQ" > "${TEMP_OMQ}.clean"
  mv "${TEMP_OMQ}.clean" "$TEMP_OMQ"
fi

if [ ! -f "$TARGET_PATH" ]; then
  # Fresh install: wrap in markers
  write_wrapped_omq_file "$TARGET_PATH"
  rm -f "$TEMP_OMQ"
  echo "Installed AGENTS.md (fresh)"
else
  # Merge: preserve user content outside OMQ markers
  if grep -q '<!-- OMQ:START -->' "$TARGET_PATH"; then
    # Has markers: remove ALL complete OMQ blocks, preserve only real user text
    # Use perl -0 for a global multiline regex replace (portable across GNU/BSD environments)
    perl -0pe 's/^<!-- OMQ:START -->\R[\s\S]*?^<!-- OMQ:END -->(?:\R)?//msg; s/^<!-- User customizations(?: \([^)]+\))? -->\R?//mg; s/\A(?:[ \t]*\R)+//; s/(?:\R[ \t]*)+\z//;' \
      "$TARGET_PATH" > "${TARGET_PATH}.preserved"

    if grep -Eq '^<!-- OMQ:(START|END) -->$' "${TARGET_PATH}.preserved"; then
      # Corrupted/unmatched markers remain: preserve the whole original file for manual recovery
      OLD_CONTENT=$(cat "$TARGET_PATH")
      {
        echo '<!-- OMQ:START -->'
        cat "$TEMP_OMQ"
        echo '<!-- OMQ:END -->'
        echo ""
        echo "<!-- User customizations (recovered from corrupted markers) -->"
        printf '%s\n' "$OLD_CONTENT"
      } > "${TARGET_PATH}.tmp"
    else
      PRESERVED_CONTENT=$(cat "${TARGET_PATH}.preserved")
      {
        echo '<!-- OMQ:START -->'
        cat "$TEMP_OMQ"
        echo '<!-- OMQ:END -->'
        if printf '%s' "$PRESERVED_CONTENT" | grep -q '[^[:space:]]'; then
          echo ""
          echo "<!-- User customizations -->"
          printf '%s\n' "$PRESERVED_CONTENT"
        fi
      } > "${TARGET_PATH}.tmp"
    fi

    mv "${TARGET_PATH}.tmp" "$TARGET_PATH"
    rm -f "${TARGET_PATH}.preserved"
    echo "Updated OMQ section (user customizations preserved)"
  elif [ "$MODE" = "global" ] && [ "$INSTALL_STYLE" = "preserve" ]; then
    COMPANION_TARGET_PATH="$CONFIG_DIR/$COMPANION_FILENAME"
    ensure_not_symlink_path "$COMPANION_TARGET_PATH" "OMQ companion AGENTS.md"
    ensure_not_symlink_path "$TARGET_PATH" "base AGENTS.md import block"
    if [ -f "$COMPANION_TARGET_PATH" ] && [ -n "$BACKUP_DATE" ]; then
      cp "$COMPANION_TARGET_PATH" "${COMPANION_TARGET_PATH}.backup.${BACKUP_DATE}"
      echo "Backed up existing companion AGENTS.md to ${COMPANION_TARGET_PATH}.backup.${BACKUP_DATE}"
    fi
    write_wrapped_omq_file "$COMPANION_TARGET_PATH"
    ensure_managed_companion_import "$TARGET_PATH" "$COMPANION_FILENAME"
    VALIDATION_PATH="$COMPANION_TARGET_PATH"
    echo "Installed OMQ companion file and preserved existing AGENTS.md"
  else
    # No markers: wrap new content in markers, append old content as user section
    # Strip any preserve-mode import block left by a prior preserve install
    if grep -Fq "$OMQ_IMPORT_START" "$TARGET_PATH"; then
      perl -0pe 's/^<!-- OMQ:IMPORT:START -->\R[\s\S]*?^<!-- OMQ:IMPORT:END -->(?:\R)?//msg' "$TARGET_PATH" > "${TARGET_PATH}.importless"
      mv "${TARGET_PATH}.importless" "$TARGET_PATH"
    fi
    OLD_CONTENT=$(cat "$TARGET_PATH")
    {
      echo '<!-- OMQ:START -->'
      cat "$TEMP_OMQ"
      echo '<!-- OMQ:END -->'
      echo ""
      echo "<!-- User customizations (migrated from previous AGENTS.md) -->"
      printf '%s\n' "$OLD_CONTENT"
    } > "${TARGET_PATH}.tmp"
    mv "${TARGET_PATH}.tmp" "$TARGET_PATH"
    echo "Migrated existing AGENTS.md (added OMQ markers, preserved old content)"
  fi
  rm -f "$TEMP_OMQ"

  # Clean up orphaned companion file from a prior preserve-mode install.
  # If left behind, prepareOmcLaunchConfigDir reads stale companion content
  # instead of the freshly-updated AGENTS.md during omq launches.
  if [ "$MODE" = "global" ] && [ "$INSTALL_STYLE" = "overwrite" ]; then
    COMPANION_TARGET_PATH="$CONFIG_DIR/$COMPANION_FILENAME"
    if [ -f "$COMPANION_TARGET_PATH" ]; then
      if [ -n "$BACKUP_DATE" ]; then
        cp "$COMPANION_TARGET_PATH" "${COMPANION_TARGET_PATH}.backup.${BACKUP_DATE}"
      fi
      rm -f "$COMPANION_TARGET_PATH"
      echo "Removed orphaned companion file from prior preserve-mode install"
    fi
  fi
fi

if ! grep -q '<!-- OMQ:START -->' "$VALIDATION_PATH" || ! grep -q '<!-- OMQ:END -->' "$VALIDATION_PATH"; then
  echo "ERROR: Installed AGENTS.md is missing required OMQ markers: $VALIDATION_PATH" >&2
  exit 1
fi

install_omq_reference_skill

if [ "$MODE" = "local" ]; then
  ensure_local_omq_git_exclude
fi

# Extract new version and report
NEW_VERSION=$(grep -m1 'OMQ:VERSION:' "$VALIDATION_PATH" 2>/dev/null | sed -E 's/.*OMQ:VERSION:([^ ]+).*/\1/' || true)
if [ -z "$NEW_VERSION" ]; then
  NEW_VERSION=$(omq --version 2>/dev/null | head -1 || true)
fi
if [ -z "$NEW_VERSION" ]; then
  NEW_VERSION="unknown"
fi
if [ "$OLD_VERSION" = "none" ]; then
  echo "Installed AGENTS.md: $NEW_VERSION"
elif [ "$OLD_VERSION" = "$NEW_VERSION" ]; then
  echo "AGENTS.md unchanged: $NEW_VERSION"
else
  echo "Updated AGENTS.md: $OLD_VERSION -> $NEW_VERSION"
fi

# Legacy hooks cleanup (global mode only)
if [ "$MODE" = "global" ]; then
  rm -f "$CONFIG_DIR/hooks/keyword-detector.sh"
  rm -f "$CONFIG_DIR/hooks/stop-continuation.sh"
  rm -f "$CONFIG_DIR/hooks/persistent-mode.sh"
  rm -f "$CONFIG_DIR/hooks/session-start.sh"
  echo "Legacy hooks cleaned"

  # Check for manual hook entries in settings.json
  SETTINGS_FILE="$CONFIG_DIR/settings.json"
  if [ -f "$SETTINGS_FILE" ]; then
    if jq -e '.hooks' "$SETTINGS_FILE" > /dev/null 2>&1; then
      echo ""
      echo "NOTE: Found legacy hooks in settings.json. These should be removed since"
      echo "the plugin now provides hooks automatically. Remove the \"hooks\" section"
      echo "from $SETTINGS_FILE to prevent duplicate hook execution."
    fi
  fi
fi

# Verify plugin installation
if [ -f "$CONFIG_DIR/settings.json" ] && grep -q "oh-my-qoder" "$CONFIG_DIR/settings.json"; then
  echo "Plugin verified"
else
  echo "Plugin NOT found - run: claude /install-plugin oh-my-qoder"
fi
