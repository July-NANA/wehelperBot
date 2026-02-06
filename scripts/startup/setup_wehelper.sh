#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

PORT=18789
SKIP_BUILD=0
GATEWAY_TOKEN="${OPENCLAW_GATEWAY_TOKEN:-}"

usage() {
  cat <<EOF
Usage: ./openclaw/scripts/startup/setup_wehelper.sh [--port <port>] [--skip-build] [--token <token>]

Options:
  --port <port>     Override default port (18789)
  --skip-build      Skip build steps, only start gateway
  --token <token>   Gateway auth token (or set OPENCLAW_GATEWAY_TOKEN)
  -h, --help        Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)
      PORT="${2:-}"
      shift 2
      ;;
    --skip-build)
      SKIP_BUILD=1
      shift 1
      ;;
    --token)
      GATEWAY_TOKEN="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
 done

if [[ -z "$PORT" ]]; then
  echo "Missing value for --port"
  exit 1
fi

if [[ -z "$GATEWAY_TOKEN" ]]; then
  GATEWAY_TOKEN="$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")"
  echo "Generated gateway token: $GATEWAY_TOKEN"
  echo "Tip: export OPENCLAW_GATEWAY_TOKEN=$GATEWAY_TOKEN"
fi

require_cmd() {
  local cmd="$1"
  local hint="$2"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing dependency: $cmd"
    echo "Fix: $hint"
    exit 1
  fi
}

require_cmd node "Install Node.js (https://nodejs.org/)"
require_cmd pnpm "Install pnpm: npm install -g pnpm"
require_cmd python "Install Python 3 (https://www.python.org/)"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "Warning: cloudflared not found. Tunnel auto-start will be unavailable."
  echo "Install (macOS): brew install cloudflared"
  echo "Install (Linux): https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation"
fi

cd "$ROOT_DIR/openclaw"

if [[ "$SKIP_BUILD" -eq 0 ]]; then
  pnpm install
  pnpm ui:build
  pnpm build
fi

OPENCLAW_GATEWAY_TOKEN="$GATEWAY_TOKEN" pnpm openclaw gateway --port "$PORT" --verbose --allow-unconfigured --token "$GATEWAY_TOKEN"
