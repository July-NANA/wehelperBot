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

OPENCLAW_BIN="${OPENCLAW_BIN:-}"
if [[ -n "$OPENCLAW_BIN" ]]; then
  OPENCLAW_CMD=($OPENCLAW_BIN)
elif command -v openclaw >/dev/null 2>&1; then
  OPENCLAW_CMD=(openclaw)
elif [[ -f "$OPENCLAW_DIR/scripts/run-node.mjs" ]]; then
  OPENCLAW_CMD=(node scripts/run-node.mjs)
elif command -v pnpm >/dev/null 2>&1; then
  OPENCLAW_CMD=(pnpm openclaw --)
else
  echo "未找到 openclaw 或 pnpm，请先安装。" >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  if command -v npm >/dev/null 2>&1; then
    echo "pnpm not found. Installing via npm..."
    npm install -g pnpm
  else
    echo "未找到 pnpm，且 npm 不可用。请先安装 Node.js (包含 npm)。" >&2
    exit 1
  fi
fi

show_usage() {
  cat <<'USAGE'
Usage: openclaw/scripts/startup/configure_provider.sh [--provider <id>] [--auth <token|api-key|oauth>] [--api-key <key>] [--token <token>] [--force]

Providers (common):
  anthropic      (token or api-key)
  openai         (api-key) or openai-codex (oauth)
  qwen-portal    (oauth)
  gemini         (api-key)
  openrouter     (api-key)
  venice         (api-key)
  moonshot       (api-key)
  kimi-code      (api-key)
  zai            (api-key)
  xiaomi         (api-key)
  minimax-api    (api-key)
  minimax-api-lightning (api-key)

Examples:
  ./openclaw/scripts/startup/configure_provider.sh --provider anthropic --auth token --token "<setup-token>"
  ./openclaw/scripts/startup/configure_provider.sh --provider openai --auth api-key --api-key "<key>"
  ./openclaw/scripts/startup/configure_provider.sh --provider openai-codex --auth oauth
  ./openclaw/scripts/startup/configure_provider.sh --provider qwen-portal --auth oauth
USAGE
}

cd "$OPENCLAW_DIR"

provider=""
auth=""
api_key=""
token=""
force="0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --provider)
      provider="${2:-}"; shift 2 ;;
    --auth)
      auth="${2:-}"; shift 2 ;;
    --api-key)
      api_key="${2:-}"; shift 2 ;;
    --token)
      token="${2:-}"; shift 2 ;;
    --force)
      force="1"; shift ;;
    -h|--help)
      show_usage; exit 0 ;;
    *)
      echo "Unknown аргумент: $1" >&2
      show_usage
      exit 1
      ;;
  esac
done

provider_has_auth() {
  local p="$1"
  if ! command -v jq >/dev/null 2>&1; then
    return 1
  fi
  local json
  json="$("${OPENCLAW_CMD[@]}" models status --json 2>/dev/null || true)"
  if [[ -z "$json" ]]; then
    return 1
  fi
  local now_ms
  now_ms=$(( $(date +%s) * 1000 ))
  local oauth_ok api_key_count
  oauth_ok=$(echo "$json" | jq -r --arg p "$p" --argjson now "$now_ms" '
    [.auth.oauth.profiles[]
      | select(.provider == $p and (.type == "oauth" or .type == "token"))
      | (.expiresAt // 0)]
    | max // 0
    | if . > $now then "ok" else "no" end
  ' 2>/dev/null || echo "no")
  api_key_count=$(echo "$json" | jq -r --arg p "$p" '
    [.auth.providers[]
      | select(.provider == $p)
      | (.profiles.apiKey // 0)]
    | max // 0
  ' 2>/dev/null || echo "0")
  if [[ "$oauth_ok" == "ok" ]]; then
    return 0
  fi
  if [[ "$api_key_count" =~ ^[0-9]+$ ]] && [[ "$api_key_count" -gt 0 ]]; then
    return 0
  fi
  return 1
}

if [[ -z "$provider" ]]; then
  echo "选择 provider:"
  echo "  1) anthropic"
  echo "  2) openai (api-key)"
  echo "  3) openai-codex (oauth)"
  echo "  4) qwen-portal (oauth)"
  echo "  5) gemini (api-key)"
  echo "  6) openrouter (api-key)"
  echo "  7) venice (api-key)"
  echo "  8) moonshot (api-key)"
  echo "  9) kimi-code (api-key)"
  echo " 10) zai (api-key)"
  echo " 11) xiaomi (api-key)"
  echo " 12) minimax-api (api-key)"
  echo " 13) minimax-api-lightning (api-key)"
  echo " 14) 自定义 OAuth provider id"
  read -r -p "输入序号: " choice
  case "$choice" in
    1) provider="anthropic" ;;
    2) provider="openai" ;;
    3) provider="openai-codex" ;;
    4) provider="qwen-portal" ;;
    5) provider="gemini" ;;
    6) provider="openrouter" ;;
    7) provider="venice" ;;
    8) provider="moonshot" ;;
    9) provider="kimi-code" ;;
    10) provider="zai" ;;
    11) provider="xiaomi" ;;
    12) provider="minimax-api" ;;
    13) provider="minimax-api-lightning" ;;
    14) read -r -p "输入 OAuth provider id: " provider ;;
    *) echo "无效选择"; exit 1 ;;
  esac
fi

if [[ -z "$auth" ]]; then
  case "$provider" in
    anthropic)
      echo "选择认证方式:"
      echo "  1) setup-token"
      echo "  2) api-key"
      read -r -p "输入序号: " a
      case "$a" in
        1) auth="token" ;;
        2) auth="api-key" ;;
        *) echo "无效选择"; exit 1 ;;
      esac
      ;;
    openai)
      auth="api-key" ;;
    openai-codex|qwen-portal)
      auth="oauth" ;;
    *)
      auth="api-key" ;;
  esac
fi

if [[ "$force" != "1" ]] && provider_has_auth "$provider"; then
  echo "检测到 $provider 已配置，跳过重新登录。"
  echo "如需强制重新登录，请添加 --force。"
  echo "注意：此脚本仅配置 provider，不会启动网关。"
  exit 0
fi

run_onboard_api_key() {
  local choice="$1"
  local flag="$2"
  local key="$3"
  if [[ -z "$key" ]]; then
    read -r -p "请输入 ${choice} 的 API key: " key
  fi
  "${OPENCLAW_CMD[@]}" onboard --non-interactive --accept-risk --flow manual --mode local \
    --skip-channels --skip-skills --skip-health --skip-ui --skip-daemon \
    --auth-choice "$choice" "$flag" "$key"
}

case "$provider" in
  anthropic)
    if [[ "$auth" == "token" ]]; then
      if [[ -z "$token" ]]; then
        read -r -p "请粘贴 Anthropic setup-token: " token
      fi
      "${OPENCLAW_CMD[@]}" onboard --non-interactive --accept-risk --flow manual --mode local \
        --skip-channels --skip-skills --skip-health --skip-ui --skip-daemon \
        --auth-choice token --token-provider anthropic --token "$token"
    else
      run_onboard_api_key "apiKey" "--anthropic-api-key" "$api_key"
    fi
    ;;
  openai)
    run_onboard_api_key "openai-api-key" "--openai-api-key" "$api_key"
    ;;
  openai-codex)
    "${OPENCLAW_CMD[@]}" models auth login --provider openai-codex
    ;;
  qwen-portal)
    "${OPENCLAW_CMD[@]}" plugins enable qwen-portal-auth
    "${OPENCLAW_CMD[@]}" models auth login --provider qwen-portal --set-default
    ;;
  gemini)
    run_onboard_api_key "gemini-api-key" "--gemini-api-key" "$api_key"
    ;;
  openrouter)
    run_onboard_api_key "openrouter-api-key" "--openrouter-api-key" "$api_key"
    ;;
  venice)
    run_onboard_api_key "venice-api-key" "--venice-api-key" "$api_key"
    ;;
  moonshot)
    run_onboard_api_key "moonshot-api-key" "--moonshot-api-key" "$api_key"
    ;;
  kimi-code)
    run_onboard_api_key "kimi-code-api-key" "--kimi-code-api-key" "$api_key"
    ;;
  zai)
    run_onboard_api_key "zai-api-key" "--zai-api-key" "$api_key"
    ;;
  xiaomi)
    run_onboard_api_key "xiaomi-api-key" "--xiaomi-api-key" "$api_key"
    ;;
  minimax-api)
    run_onboard_api_key "minimax-api" "--minimax-api-key" "$api_key"
    ;;
  minimax-api-lightning)
    run_onboard_api_key "minimax-api-lightning" "--minimax-api-key" "$api_key"
    ;;
  *)
    if [[ "$auth" == "oauth" ]]; then
      "${OPENCLAW_CMD[@]}" models auth login --provider "$provider"
    else
      echo "未支持的 provider: $provider" >&2
      show_usage
      exit 1
    fi
    ;;
 esac

echo "完成。建议运行: openclaw models status"
echo "注意：此脚本仅配置 provider，不会启动网关。"
