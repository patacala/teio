#!/usr/bin/env bash
# Export a clean zip of the project for sharing.
# Includes only git-tracked, non-gitignored files (so node_modules, .env*,
# dist/build/.next/.turbo caches, and .git history are excluded automatically
# because .gitignore already covers them).
#
# Usage:
#   ./scripts/export-zip.sh [ref] [output-dir]
#   ref         git ref to export (default: HEAD, i.e. current working tree's commit)
#   output-dir  where to write the zip (default: ./exports)

set -euo pipefail

REF="${1:-HEAD}"
OUT_DIR="${2:-exports}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
PROJECT_NAME="$(basename "$REPO_ROOT")"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
ZIP_PATH="${REPO_ROOT}/${OUT_DIR}/${PROJECT_NAME}-${TIMESTAMP}.zip"

mkdir -p "${REPO_ROOT}/${OUT_DIR}"

cd "$REPO_ROOT"
git archive --format=zip --output="$ZIP_PATH" "$REF"

# Explicit extra excludes not covered by .gitignore (e.g. if ever committed by mistake).
EXTRA_EXCLUDES=("AGENTS.md")
for pattern in "${EXTRA_EXCLUDES[@]}"; do
  zip -q -d "$ZIP_PATH" "$pattern" 2>/dev/null || true
done

echo "Created: $ZIP_PATH"
