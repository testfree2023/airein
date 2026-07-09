#!/usr/bin/env bash
#
# Run all integration tests for the airein project.
#
# Usage:
#   bash test/run-all.sh           # run all tests
#   bash test/run-all.sh quality   # run only test-quality-config.js
#   bash test/run-all.sh chain     # run only test-skill-chain.js
#
# Exit code: number of total failed assertions (0 = all pass).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Files to skip (non-suite files that match test-*.js glob)
SKIP_FILES="test-runner.js test-helpers.js"

# If a filter is given, only run matching test files
FILTER="${1:-}"

case "$FILTER" in
  quality)    FILES=("$SCRIPT_DIR/test-quality-config.js") ;;
  chain)      FILES=("$SCRIPT_DIR/test-skill-chain.js") ;;
  anti|f2)    FILES=("$SCRIPT_DIR/test-anti-rationalization.js") ;;
  flow|f3f4)  FILES=("$SCRIPT_DIR/test-flow-control.js") ;;
  json)       FILES=("$SCRIPT_DIR/test-json-validity.js") ;;
  js|syntax)  FILES=("$SCRIPT_DIR/test-js-syntax.js") ;;
  guard)      FILES=("$SCRIPT_DIR/test-test-guard.js") ;;
  clean|super) FILES=("$SCRIPT_DIR/test-no-superpowers.js") ;;
  "")         FILES=(); for f in "$SCRIPT_DIR"/test-*.js; do
                skip=false
                for s in $SKIP_FILES; do
                  [ "$(basename "$f")" = "$s" ] && skip=true && break
                done
                $skip || FILES+=("$f")
              done ;;
  *)          echo "Unknown filter: $FILTER"; echo "Options: quality chain anti flow json js guard clean"; exit 1 ;;
esac

TOTAL_FAILED=0

echo "══════════════════════════════════════════════════"
echo "  Airein Integration Tests"
echo "  Root: $ROOT_DIR"
echo "  Tests: ${#FILES[@]} file(s)"
echo "══════════════════════════════════════════════════"

for f in "${FILES[@]}"; do
  echo ""
  echo "── $(basename "$f") ──"
  node "$f" || TOTAL_FAILED=$((TOTAL_FAILED + $?))
done

echo ""
echo "══════════════════════════════════════════════════"
if [ "$TOTAL_FAILED" -eq 0 ]; then
  echo "  All suites passed ✓"
else
  echo "  Total failures: $TOTAL_FAILED"
fi
echo "══════════════════════════════════════════════════"

exit "$TOTAL_FAILED"
