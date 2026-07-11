#!/usr/bin/env bash
set -euo pipefail
PATH="/opt/homebrew/bin:/opt/homebrew/opt/node@22/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
PROJECT_DIR="${CPX_VERCEL_PROJECT_DIR:-$HOME/.openclaw/workspace/.tmp/vercel_cpx_editor}"
URL="${1:-}"
BUILD="${CPX_LOCALDB_CLIENT_BUILD:-}"
URL_FILE="$HOME/.openclaw/workspace/kmle-planner-share/.local/cpx-localdb-public-url"
LOCK_DIR="/tmp/openclaw/cpx-localdb-vercel.lock"
if [[ -z "$URL" ]]; then echo "usage: $0 https://...trycloudflare.com" >&2; exit 2; fi
if [[ "$URL" == "https://api.trycloudflare.com" || ! "$URL" =~ ^https://[A-Za-z0-9-]+\.trycloudflare\.com$ ]]; then
  echo "refusing invalid quick tunnel URL: $URL" >&2
  exit 2
fi
if [[ ! -d "$PROJECT_DIR" ]]; then echo "missing project dir: $PROJECT_DIR" >&2; exit 1; fi
mkdir -p "$(dirname "$URL_FILE")" /tmp/openclaw
OLD=""; [[ -f "$URL_FILE" ]] && OLD="$(cat "$URL_FILE" || true)"
if [[ "$OLD" == "$URL" ]]; then
  FOUND=0
  ALL_UPDATED=1
  for NAME in index.html cpx-a4-editor-local.html kuksi_board.html; do
    TARGET="$PROJECT_DIR/$NAME"
    [[ -f "$TARGET" ]] || continue
    FOUND=1
    rg -q "DEFAULT_LOCAL_API_BASE='$URL'" "$TARGET" || ALL_UPDATED=0
  done
  if [[ "$FOUND" == 1 && "$ALL_UPDATED" == 1 ]]; then
    echo "CPX local DB URL unchanged: $URL"
    exit 0
  fi
fi
if ! mkdir "$LOCK_DIR" 2>/dev/null; then echo "another localdb Vercel update is running; skip"; exit 0; fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT
python3 - "$PROJECT_DIR" "$URL" "$BUILD" <<'PY'
from pathlib import Path
import re, sys
project=Path(sys.argv[1]); url=sys.argv[2]; build=sys.argv[3]
targets=[]
for name in ['index.html','cpx-a4-editor-local.html','kuksi_board.html']:
    p=project/name
    try:
        s=p.read_text(encoding='utf-8')
    except FileNotFoundError:
        # The staging directory can be replaced while another verified build is
        # being synchronized. A disappearing optional target must not abort the
        # URL rotation for the editor files that are still present.
        continue
    current_build=re.search(r"CLIENT_BUILD='([^']+)'", s)
    effective_build=build or (current_build.group(1) if current_build else 'a4-localdb-auto-url')
    s=re.sub(r"CLIENT_BUILD='[^']+'", f"CLIENT_BUILD='{effective_build}'", s, count=1)
    s,replaced=re.subn(r"const DEFAULT_LOCAL_API_BASE='[^']*';[^\n]*", f"const DEFAULT_LOCAL_API_BASE='{url}'; // CPX Local DB quick tunnel; updated automatically by cpx_localdb_tunnel_manager.", s, count=1)
    if replaced != 1:
        raise SystemExit(f'missing DEFAULT_LOCAL_API_BASE marker in {p}')
    try:
        p.write_text(s, encoding='utf-8')
    except FileNotFoundError:
        continue
    targets.append(p)
if not targets:
    raise SystemExit(f'no CPX editor HTML targets found in {project}')
PY
cd "$PROJECT_DIR"
echo "Deploying CPX local DB client: $URL build=$BUILD"
npx --yes vercel --prod --yes >/tmp/openclaw/cpx-localdb-vercel-deploy.log 2>&1
cat /tmp/openclaw/cpx-localdb-vercel-deploy.log | tail -50
printf '%s' "$URL" > "$URL_FILE"
chmod 600 "$URL_FILE" 2>/dev/null || true
