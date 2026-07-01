#!/usr/bin/env sh

resolve_claude_config_dir() {
  configured="${QODER_CONFIG_DIR:-$HOME/.qoder}"
  configured="${configured%/}"
  case "$configured" in
    \~)
      printf '%s\n' "$HOME"
      ;;
    \~/*)
      configured="${configured#\~/}"
      printf '%s/%s\n' "$HOME" "$configured"
      ;;
    *)
      printf '%s\n' "$configured"
      ;;
  esac
}
