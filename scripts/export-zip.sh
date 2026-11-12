#!/usr/bin/env bash
# Export a clean zip of the project for sharing.
# Includes only git-tracked files from the given ref (so node_modules, .env*,
# dist/build/.next/.turbo caches, and .git history stay out when gitignored).
#
# Also strips, even if they were committed:
#   - Markdown (*.md)
#   - skills (.agents/skills, .claude/skills, .atl)
#   - knowledge graphs (graphify-out)
#   - workflows (.github/workflows and any workflows/ tree)
#   - env files other than .env.example, and private keys
#
# Usage:
#   ./scripts/export-zip.sh [ref] [output-dir]
#   ref         git ref to export (default: HEAD)
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

REMOVE_LIST="$(mktemp)"
trap 'rm -f "$REMOVE_LIST"' EXIT

python3 - "$ZIP_PATH" >"$REMOVE_LIST" <<'PY'
import re, sys, zipfile

exclude = re.compile(
    r"(?:"
    r"\.md$"
    r"|(?:^|/)skills(?:/|$)"
    r"|(?:^|/)\.atl(?:/|$)"
    r"|(?:^|/)graphify-out(?:/|$)"
    r"|(?:^|/)\.github/workflows(?:/|$)"
    r"|(?:^|/)workflows(?:/|$)"
    r"|(?:^|/)\.env(?:$|\.(?!example$))"
    r"|\.pem$"
    r"|(?:^|/)credentials\.json$"
    r"|(?:^|/)serviceAccount.*\.json$"
    r")",
    re.IGNORECASE,
)

with zipfile.ZipFile(sys.argv[1]) as archive:
    names = [name for name in archive.namelist() if exclude.search(name)]

sys.stdout.write("\n".join(names))
if names:
    sys.stdout.write("\n")
PY

if [[ -s "$REMOVE_LIST" ]]; then
  zip -q -d "$ZIP_PATH" -@ <"$REMOVE_LIST"
fi

python3 - "$ZIP_PATH" <<'PY'
import os, re, sys, zipfile

# Live credential shapes. Short fixtures and "your-*" placeholders are ignored.
patterns = {
    "stripe_live": re.compile(r"sk_live_[A-Za-z0-9]{16,}"),
    "openai": re.compile(r"sk-(?!your-)[A-Za-z0-9]{20,}"),
    "webhook": re.compile(r"whsec_[A-Za-z0-9]{16,}"),
    "slack": re.compile(r"xox[baprs]-(?!your-)[A-Za-z0-9-]{20,}"),
    "aws_access_key": re.compile(r"AKIA[0-9A-Z]{16}"),
    "github_token": re.compile(r"(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}"),
    "jwt": re.compile(r"eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}"),
    "sendgrid": re.compile(r"SG\.(?!your-)[A-Za-z0-9_-]{20,}"),
    "private_key": re.compile(r"-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----"),
}

allowed = re.compile(
    r"your-|example|placeholder|sk_test_|sk_live_secret|xxxxxxxx",
    re.IGNORECASE,
)

hits = []
zip_path = sys.argv[1]
with zipfile.ZipFile(zip_path) as archive:
    for info in archive.infolist():
        if info.is_dir() or info.file_size > 2_000_000:
            continue
        data = archive.read(info.filename)
        if b"\0" in data[:4096]:
            continue
        text = data.decode("utf-8", "ignore")
        for kind, pattern in patterns.items():
            for match in pattern.finditer(text):
                snippet = match.group(0)
                if allowed.search(snippet):
                    continue
                hits.append(f"{info.filename}: {kind}")

if hits:
    print("Refusing export: real-looking secrets found:", file=sys.stderr)
    for hit in hits:
        print(f"  {hit}", file=sys.stderr)
    os.remove(zip_path)
    sys.exit(1)
PY

REMOVED="$(grep -c . "$REMOVE_LIST" || true)"
echo "Removed ${REMOVED} paths (md, skills, graphs, workflows, env/keys)."
echo "Created: $ZIP_PATH"
