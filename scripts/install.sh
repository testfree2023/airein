#!/usr/bin/env bash
# Remote one-liner bootstrap: clone airein then airein setup --yes
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/testfree2023/airein/main/scripts/install.sh | bash
#   curl -fsSL .../install.sh | bash -s -- --hosts claude-code
# Env:
#   AIREIN_REPO_URL  (default: https://github.com/testfree2023/airein.git)
#   AIREIN_BRANCH    (default: main)

set -euo pipefail

REPO_URL="${AIREIN_REPO_URL:-https://github.com/testfree2023/airein.git}"
BRANCH="${AIREIN_BRANCH:-main}"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: required command not found: $1" >&2
    exit 1
  fi
}

need git
need node
need bash
need mktemp

TMP="$(mktemp -d "${TMPDIR:-/tmp}/airein-install.XXXXXX")"
cleanup() {
  cd "$HOME" >/dev/null 2>&1 || cd / >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

echo "-> cloning ${REPO_URL} (branch ${BRANCH}) ..."
git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$TMP/airein"

echo "-> running airein setup --yes ..."
bash "$TMP/airein/airein" setup --yes "$@"

echo ""
echo "OK install finished. Verify with:"
echo "   bash ~/.airein/scripts/update/verify-airein.sh --full"
echo "Uninstall: airein uninstall"