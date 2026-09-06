#!/usr/bin/env bash
# Everything. One command, no arguments, no setup beyond a clone.
set -euo pipefail
cd "$(dirname "$0")/.."

blue() { printf "\n\033[1m%s\033[0m\n" "$1"; }

blue "python"
python3 -m pytest tests/ -q

blue "javascript"
node tests/js/run.js

blue "syntax"
for f in docs/*.js templates/assets/*.js; do node --check "$f"; done
python3 -m compileall -q tripkit
echo "  all scripts parse"

if [ "${TRIPKIT_LIVE:-}" = "1" ]; then
  blue "live services (opt in)"
  python3 -m pytest tests/test_live.py -q
else
  printf "\n\033[2m  live tests skipped, set TRIPKIT_LIVE=1 to run them\033[0m\n"
fi

printf "\n\033[32m  everything passed\033[0m\n\n"
