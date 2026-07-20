#!/usr/bin/env bash
# Point this repo's git at the committed hooks. Run once after cloning.
#   bash .githooks/install.sh
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
git config core.hooksPath .githooks
chmod +x .githooks/* 2>/dev/null || true
echo "core.hooksPath -> .githooks (model-agnostic work-trace enabled)"
echo "Tip: tag the model per commit with  TRACE_MODEL=gpt|grok|claude git commit ..."
