Param(
  [int]$Port = 18789,
  [switch]$SkipBuild,
  [string]$Token
)

$ErrorActionPreference = "Stop"

function Require-Command {
  param(
    [string]$Cmd,
    [string]$Hint
  )
  if (-not (Get-Command $Cmd -ErrorAction SilentlyContinue)) {
    Write-Host "Missing dependency: $Cmd"
    Write-Host "Fix: $Hint"
    exit 1
  }
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Resolve-Path (Join-Path $ScriptDir "..\..\..")

if (-not $Token -or $Token.Trim().Length -eq 0) {
  if ($env:OPENCLAW_GATEWAY_TOKEN) {
    $Token = $env:OPENCLAW_GATEWAY_TOKEN
  } else {
    $bytes = New-Object byte[] 16
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $Token = ($bytes | ForEach-Object { $_.ToString("x2") }) -join ""
    Write-Host "Generated gateway token: $Token"
    Write-Host "Tip: set OPENCLAW_GATEWAY_TOKEN=$Token"
  }
}

Require-Command node "Install Node.js (https://nodejs.org/)"
Require-Command pnpm "Install pnpm: npm install -g pnpm"
Require-Command python "Install Python 3 (https://www.python.org/)"

if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  Write-Host "Warning: cloudflared not found. Tunnel auto-start will be unavailable."
  Write-Host "Install (Windows): https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation"
}

Set-Location (Join-Path $RootDir "openclaw")

if (-not $SkipBuild) {
  pnpm install
  pnpm ui:build
  pnpm build
}

$env:OPENCLAW_GATEWAY_TOKEN = $Token
pnpm openclaw gateway --port $Port --verbose --allow-unconfigured --token $Token
