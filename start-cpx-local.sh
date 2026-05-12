#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export CPX_LOCAL_PORT="${CPX_LOCAL_PORT:-8797}"
export CPX_LOCAL_HOST="${CPX_LOCAL_HOST:-127.0.0.1}"
if [[ -z "${CPX_BOARD_PASSWORD:-}" && -z "${CPX_LOCAL_PASSWORD:-}" ]]; then
  echo "Set CPX_BOARD_PASSWORD before starting, e.g. CPX_BOARD_PASSWORD='...' ./start-cpx-local.sh" >&2
  exit 1
fi
exec node cpx-local-server.js
