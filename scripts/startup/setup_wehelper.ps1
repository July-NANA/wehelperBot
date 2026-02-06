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

function Find-OpenclawDir {
  param([string]$StartDir)
  $dir = $StartDir
  for ($i = 0; $i -lt 6; $i++) {
    $candidate = Join-Path $dir "openclaw\package.json"
    if (Test-Path $candidate) {
      return (Split-Path -Parent $candidate)
    }
    $pkg = Join-Path $dir "package.json"
    if (Test-Path $pkg) {
      try {
        $json = Get-Content $pkg -Raw | ConvertFrom-Json
        if ($json.name -eq "openclaw") {
          return $dir
        }
      } catch {
      }
    }
    $parent = Split-Path -Parent $dir
    if ($parent -eq $dir) { break }
    $dir = $parent
  }
  return $null
}

$OpenclawDir = $env:OPENCLAW_ROOT
if (-not $OpenclawDir -or $OpenclawDir.Trim().Length -eq 0) {
  $OpenclawDir = Find-OpenclawDir -StartDir $ScriptDir
}
if (-not $OpenclawDir) {
  Write-Host "无法定位 OpenClaw 目录。请设置 OPENCLAW_ROOT 指向包含 package.json 的 OpenClaw 目录。"
  exit 1
}

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
Require-Command npm "Install Node.js (https://nodejs.org/)"
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Host "pnpm not found. Installing via npm..."
  npm install -g pnpm
}
Require-Command python "Install Python 3 (https://www.python.org/)"

if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  Write-Host "Warning: cloudflared not found. Tunnel auto-start will be unavailable."
  Write-Host "Install (Windows): https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation"
}

Set-Location $OpenclawDir

$OpenclawCmd = @()
if ($env:OPENCLAW_BIN -and $env:OPENCLAW_BIN.Trim() -ne "") {
  $OpenclawCmd = $env:OPENCLAW_BIN.Split(" ", [System.StringSplitOptions]::RemoveEmptyEntries)
} elseif (Get-Command openclaw -ErrorAction SilentlyContinue) {
  $OpenclawCmd = @("openclaw")
} elseif (Get-Command pnpm -ErrorAction SilentlyContinue) {
  $OpenclawCmd = @("pnpm","openclaw","--")
} else {
  Write-Error "未找到 openclaw 或 pnpm，请先安装。"
  exit 1
}

$OpenclawPrefix = @()
if ($OpenclawCmd.Length -gt 1) {
  $OpenclawPrefix = $OpenclawCmd[1..($OpenclawCmd.Length-1)]
}

function Invoke-Openclaw {
  param([string[]]$Args)
  & $OpenclawCmd[0] @OpenclawPrefix @Args
}

if (-not (Test-Path "node_modules")) {
  pnpm install
}

function Test-ProviderConfigured {
  try {
    $jsonText = Invoke-Openclaw @("models","status","--json") 2>$null | Out-String
    if (-not $jsonText -or $jsonText.Trim() -eq "") { return $false }
    $data = $jsonText | ConvertFrom-Json -ErrorAction Stop
  } catch {
    return $false
  }

  $nowMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $oauthProfiles = @()
  if ($data.auth -and $data.auth.oauth -and $data.auth.oauth.profiles) {
    $oauthProfiles = $data.auth.oauth.profiles | Where-Object { $_.type -eq "oauth" -or $_.type -eq "token" }
  }
  if ($oauthProfiles.Count -gt 0) {
    $maxExp = ($oauthProfiles | ForEach-Object { $_.expiresAt }) | Measure-Object -Maximum | Select-Object -ExpandProperty Maximum
    if ($maxExp -and $maxExp -gt $nowMs) { return $true }
  }

  $providers = @()
  if ($data.auth -and $data.auth.providers) { $providers = $data.auth.providers }
  $hasApiKey = $providers | Where-Object { $_.profiles -and $_.profiles.apiKey -and $_.profiles.apiKey -gt 0 } | Select-Object -First 1
  if ($hasApiKey) { return $true }
  return $false
}

if (-not (Test-ProviderConfigured)) {
  Write-Host "未检测到已配置的 provider，将进入配置流程..."
  & (Join-Path $ScriptDir "configure_provider.ps1")
}

if (-not $SkipBuild) {
  pnpm ui:build
  pnpm build
}

$env:OPENCLAW_GATEWAY_TOKEN = $Token
Invoke-Openclaw @("gateway","--port",$Port,"--verbose","--allow-unconfigured","--token",$Token)
