#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

find_openclaw_dir() {
  local dir="$SCRIPT_DIR"
  local i
  for i in 1 2 3 4 5 6; do
    if [[ -f "$dir/openclaw/package.json" ]]; then
      echo "$dir/openclaw"
      return 0
    fi
    if [[ -f "$dir/package.json" ]] && grep -q '"name"[[:space:]]*:[[:space:]]*"openclaw"' "$dir/package.json"; then
      echo "$dir"
      return 0
    fi
    dir="$(cd "$dir/.." && pwd)"
  done
  return 1
}

OPENCLAW_DIR="${OPENCLAW_ROOT:-}"
if [[ -z "$OPENCLAW_DIR" ]]; then
  OPENCLAW_DIR="$(find_openclaw_dir || true)"
fi
if [[ -z "$OPENCLAW_DIR" ]]; then
  echo "无法定位 OpenClaw 目录。请设置 OPENCLAW_ROOT 指向包含 package.json 的 OpenClaw 目录。" >&2
  exit 1
fi

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
require_cmd npm "Install Node.js (https://nodejs.org/)"
if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm not found. Installing via npm..."
  npm install -g pnpm
fi
require_cmd python "Install Python 3 (https://www.python.org/)"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "Warning: cloudflared not found. Tunnel auto-start will be unavailable."
  echo "Install (macOS): brew install cloudflared"
  echo "Install (Linux): https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation"
fi

cd "$OPENCLAW_DIR"

OPENCLAW_CMD=()
if [[ -n "${OPENCLAW_BIN:-}" ]]; then
  OPENCLAW_CMD=($OPENCLAW_BIN)
elif [[ -f "$OPENCLAW_DIR/scripts/run-node.mjs" ]]; then
  OPENCLAW_CMD=(node scripts/run-node.mjs)
elif command -v openclaw >/dev/null 2>&1; then
  OPENCLAW_CMD=(openclaw)
elif command -v pnpm >/dev/null 2>&1; then
  OPENCLAW_CMD=(pnpm openclaw --)
else
  echo "未找到 openclaw 或 pnpm，请先安装。" >&2
  exit 1
fi

if [[ ! -d "node_modules" ]]; then
  pnpm install
fi

provider_configured() {
  local json
  json="$("${OPENCLAW_CMD[@]}" models status --json 2>/dev/null || true)"
  if [[ -z "$json" ]]; then
    return 1
  fi
  node -e '
    const fs = require("fs");
    try {
      const data = JSON.parse(fs.readFileSync(0,"utf8"));
      const oauth = (data.auth && data.auth.oauth && data.auth.oauth.profiles) || [];
      const providers = (data.auth && data.auth.providers) || [];
      const oauthOk = oauth.some(p => (p.type === "oauth" || p.type === "token") && (p.expiresAt || 0) > Date.now());
      const apiKeyOk = providers.some(p => (p.profiles && p.profiles.apiKey || 0) > 0);
      process.exit(oauthOk || apiKeyOk ? 0 : 1);
    } catch {
      process.exit(1);
    }
  ' <<<"$json"
}

if ! provider_configured; then
  echo "未检测到已配置的 provider，将进入配置流程..."
  "$SCRIPT_DIR/configure_provider.sh"
fi

if [[ "$SKIP_BUILD" -eq 0 ]]; then
  pnpm ui:build
  pnpm build
fi

OPENCLAW_GATEWAY_TOKEN="$GATEWAY_TOKEN" "${OPENCLAW_CMD[@]}" gateway --port "$PORT" --verbose --allow-unconfigured --token "$GATEWAY_TOKEN"
