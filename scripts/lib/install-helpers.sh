#!/usr/bin/env bash
# install-helpers.sh — shared installer helpers (node resolution + remote check)
#
# Sourced by setup-airein.sh / airein-chores.sh / merge-hooks.sh so installer
# logic lives in ONE place (DRY) and is unit-testable (test/test-install-helpers.js).
# This file only DEFINES functions — no top-level code runs on source, so it is
# safe under `set -e` and re-sourcing.
#
# Why this exists:
#   Bug 2026-07-09 (first real deploy, 192.168.3.14 macOS, nvm node v22):
#   nvm/fnm/volta install node OFF the default PATH. A non-interactive SSH or
#   cron shell does not source the version-manager init script, so
#   `command -v node` returned nothing AND the old hardcoded fallback (homebrew
#   + /usr/local/bin) missed ~/.nvm/... → the installer falsely reported
#   "Node.js 未安装" and aborted. resolve_node_bin fixes that. is_airein_remote_url
#   fixes the sibling bug where setup-airein.sh blindly `git pull`ed any
#   existing ~/.claude/.git (silently fetching a foreign harness repo).
#
# Usage:
#   source "$SCRIPT_DIR/scripts/lib/install-helpers.sh"
#   NODE_BIN="$(resolve_node_bin)"        # empty if not found
#   if is_airein_remote_url "$url"; then ...; fi

# Echo the node binary path, or empty if none found. Never exits non-zero —
# callers decide what an empty result means (setup-airein.sh treats empty as
# "Node.js 未安装"). Resolution order:
#   1. node already on PATH (interactive shells, or already sourced)
#   2. source version-manager init (nvm / fnm) so its shims populate PATH
#   3. scan known install dirs (last resort for shells that can't source)
resolve_node_bin() {
  local found=""
  local candidate

  # 1. Already on PATH.
  found="$(command -v node 2>/dev/null || true)"
  if [ -n "$found" ]; then
    echo "$found"
    return 0
  fi

  # 2. Source version managers so their shims populate PATH. Silenced — init
  #    scripts may print or mutate env; we only care that `node` appears.
  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    # shellcheck source=/dev/null
    . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1 || true
    found="$(command -v node 2>/dev/null || true)"
  fi
  if [ -z "$found" ] && [ -s "$HOME/.fnm/fnm.env" ]; then
    # shellcheck source=/dev/null
    . "$HOME/.fnm/fnm.env" >/dev/null 2>&1 || true
    found="$(command -v node 2>/dev/null || true)"
  fi
  if [ -n "$found" ]; then
    echo "$found"
    return 0
  fi

  # 3. Fallback: scan known install dirs. Step 2 already yields the manager's
  #    default node when the init script is sourceable; this is the safety net
  #    for shells where sourcing isn't viable. First executable match wins —
  #    "any node" beats "false abort" (the original bug).
  for candidate in \
    "$HOME"/.nvm/versions/node/*/bin/node \
    "$HOME"/.fnm/node-versions/*/installation/bin/node \
    "$HOME"/.volta/bin/node \
    "$HOME"/.homebrew/bin/node \
    /opt/homebrew/bin/node \
    /usr/local/bin/node \
    /usr/bin/node
  do
    if [ -x "$candidate" ]; then
      echo "$candidate"
      return 0
    fi
  done

  # Nothing found — empty output, status 0 (caller checks for empty).
  return 0
}

# Return 0 (true) if the given git remote URL points at the airein repo,
# 1 (false) otherwise. Anchored to the exact repo (with or without a trailing
# .git) so SSH and HTTPS clones both match, while sibling repos under the same
# owner (e.g. testfree2023/airein-extras) and bare substring lookalikes are
# rejected. Used by setup-airein.sh to avoid `git pull`ing a foreign
# ~/.claude/.git.
is_airein_remote_url() {
  local url="${1:-}"
  case "$url" in
    *testfree2023/airein.git) return 0 ;; # SSH or HTTPS clone, .git suffix
    *testfree2023/airein) return 0 ;;     # exact repo, no suffix
    *) return 1 ;;
  esac
}
