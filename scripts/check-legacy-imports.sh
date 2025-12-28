#!/bin/bash
# Legacy Import Fence
# Phase 7: Block forbidden legacy imports in search/ directory
#
# This script prevents accidental reintroduction of legacy modules
# into the new unified search architecture.

FORBIDDEN_PATTERNS=(
  "from.*intent\.ts"
  "from.*nlu\.service\.ts"
  "from.*chatPipeline\.ts"
  "from.*/dialogue/"
  "from.*/chat/"
)

SEARCH_DIR="server/src/services/search"
EXIT_CODE=0

echo "🔍 Checking for forbidden legacy imports in ${SEARCH_DIR}..."
echo ""

for pattern in "${FORBIDDEN_PATTERNS[@]}"; do
  echo "Checking pattern: ${pattern}"
  
  # Search for pattern in TypeScript files
  matches=$(grep -rn -E "${pattern}" "${SEARCH_DIR}" --include="*.ts" 2>/dev/null || true)
  
  if [ -n "$matches" ]; then
    echo "❌ FORBIDDEN IMPORT FOUND:"
    echo "$matches"
    echo ""
    EXIT_CODE=1
  fi
done

echo ""

if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ No forbidden imports found"
  echo ""
  echo "Legacy isolation maintained:"
  echo "  - intent.ts ✓"
  echo "  - nlu.service.ts ✓"
  echo "  - chatPipeline.ts ✓"
  echo "  - dialogue/* ✓"
  echo "  - chat/* ✓"
else
  echo "❌ Legacy imports detected. Please remove them."
  echo ""
  echo "Forbidden modules:"
  echo "  - intent.ts"
  echo "  - nlu.service.ts"
  echo "  - chatPipeline.ts"
  echo "  - dialogue/*"
  echo "  - chat/*"
  echo ""
  echo "These modules are legacy and must not be used in the unified search architecture."
fi

exit $EXIT_CODE





