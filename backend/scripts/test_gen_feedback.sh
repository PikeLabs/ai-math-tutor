#!/usr/bin/env bash
set -euo pipefail

# Adjust if your repo root is different
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export PYTHONPATH="$REPO_ROOT:${PYTHONPATH:-}"
export OPENAI_API_KEY="${OPENAI_API_KEY:-test-key}"

python3 "$REPO_ROOT/scripts/test_gen_feedback.py"
