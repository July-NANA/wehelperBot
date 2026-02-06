Param(
  [string]$Provider = "",
  [ValidateSet("token","api-key","oauth","",IgnoreCase=$true)]
  [string]$Auth = "",
  [string]$ApiKey = "",
  [string]$Token = "",
  [switch]$Force
)

$OpenclawCmd = @()
if ($env:OPENCLAW_BIN -and $env:OPENCLAW_BIN.Trim() -ne "") {
  $OpenclawCmd = $env:OPENCLAW_BIN.Split(" ", [System.StringSplitOptions]::RemoveEmptyEntries)
} elseif (Get-Command openclaw -ErrorAction SilentlyContinue) {
  $OpenclawCmd = @("openclaw")
} elseif (Get-Command pnpm -ErrorAction SilentlyContinue) {
  $OpenclawCmd = @("pnpm","openclaw")
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

function Show-Usage {
@"
Usage: openclaw\scripts\startup\configure_provider.ps1 [-Provider <id>] [-Auth <token|api-key|oauth>] [-ApiKey <key>] [-Token <token>] [-Force]

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
  .\openclaw\scripts\startup\configure_provider.ps1 -Provider anthropic -Auth token -Token "<setup-token>"
  .\openclaw\scripts\startup\configure_provider.ps1 -Provider openai -Auth api-key -ApiKey "<key>"
  .\openclaw\scripts\startup\configure_provider.ps1 -Provider openai-codex -Auth oauth
  .\openclaw\scripts\startup\configure_provider.ps1 -Provider qwen-portal -Auth oauth
"@
}

function Run-Onboard-ApiKey {
  param(
    [string]$Choice,
    [string]$Flag,
    [string]$Key
  )
  if (-not $Key) {
    $Key = Read-Host "请输入 $Choice 的 API key"
  }
  Invoke-Openclaw @("onboard","--non-interactive","--accept-risk","--flow","manual","--mode","local",`
    "--skip-channels","--skip-skills","--skip-health","--skip-ui","--skip-daemon",`
    "--auth-choice",$Choice,$Flag,$Key)
}

function Test-ProviderAuth {
  param([string]$Prov)
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
    $oauthProfiles = $data.auth.oauth.profiles | Where-Object { $_.provider -eq $Prov -and ( $_.type -eq "oauth" -or $_.type -eq "token" ) }
  }
  if ($oauthProfiles.Count -gt 0) {
    $maxExp = ($oauthProfiles | ForEach-Object { $_.expiresAt }) | Measure-Object -Maximum | Select-Object -ExpandProperty Maximum
    if ($maxExp -and $maxExp -gt $nowMs) { return $true }
  }

  $providers = @()
  if ($data.auth -and $data.auth.providers) { $providers = $data.auth.providers }
  $p = $providers | Where-Object { $_.provider -eq $Prov } | Select-Object -First 1
  if ($p -and $p.profiles -and $p.profiles.apiKey) {
    if ($p.profiles.apiKey -gt 0) { return $true }
  }
  return $false
}

if (-not $Provider) {
  Write-Host "选择 provider:"
  Write-Host "  1) anthropic"
  Write-Host "  2) openai (api-key)"
  Write-Host "  3) openai-codex (oauth)"
  Write-Host "  4) qwen-portal (oauth)"
  Write-Host "  5) gemini (api-key)"
  Write-Host "  6) openrouter (api-key)"
  Write-Host "  7) venice (api-key)"
  Write-Host "  8) moonshot (api-key)"
  Write-Host "  9) kimi-code (api-key)"
  Write-Host " 10) zai (api-key)"
  Write-Host " 11) xiaomi (api-key)"
  Write-Host " 12) minimax-api (api-key)"
  Write-Host " 13) minimax-api-lightning (api-key)"
  Write-Host " 14) 自定义 OAuth provider id"
  $choice = Read-Host "输入序号"
  switch ($choice) {
    "1" { $Provider = "anthropic" }
    "2" { $Provider = "openai" }
    "3" { $Provider = "openai-codex" }
    "4" { $Provider = "qwen-portal" }
    "5" { $Provider = "gemini" }
    "6" { $Provider = "openrouter" }
    "7" { $Provider = "venice" }
    "8" { $Provider = "moonshot" }
    "9" { $Provider = "kimi-code" }
    "10" { $Provider = "zai" }
    "11" { $Provider = "xiaomi" }
    "12" { $Provider = "minimax-api" }
    "13" { $Provider = "minimax-api-lightning" }
    "14" { $Provider = Read-Host "输入 OAuth provider id" }
    Default { Write-Error "无效选择"; exit 1 }
  }
}

if (-not $Auth) {
  switch ($Provider) {
    "anthropic" {
      Write-Host "选择认证方式:"
      Write-Host "  1) setup-token"
      Write-Host "  2) api-key"
      $a = Read-Host "输入序号"
      switch ($a) {
        "1" { $Auth = "token" }
        "2" { $Auth = "api-key" }
        Default { Write-Error "无效选择"; exit 1 }
      }
    }
    "openai" { $Auth = "api-key" }
    "openai-codex" { $Auth = "oauth" }
    "qwen-portal" { $Auth = "oauth" }
    Default { $Auth = "api-key" }
  }
}

if (-not $Force) {
  if (Test-ProviderAuth -Prov $Provider) {
    Write-Host "检测到 $Provider 已配置，跳过重新登录。"
    Write-Host "如需强制重新登录，请添加 -Force。"
    Write-Host "注意：此脚本仅配置 provider，不会启动网关。"
    exit 0
  }
}

switch ($Provider) {
  "anthropic" {
    if ($Auth -eq "token") {
      if (-not $Token) {
        $Token = Read-Host "请粘贴 Anthropic setup-token"
      }
      Invoke-Openclaw @("onboard","--non-interactive","--accept-risk","--flow","manual","--mode","local",`
        "--skip-channels","--skip-skills","--skip-health","--skip-ui","--skip-daemon",`
        "--auth-choice","token","--token-provider","anthropic","--token",$Token)
    } else {
      Run-Onboard-ApiKey -Choice "apiKey" -Flag "--anthropic-api-key" -Key $ApiKey
    }
  }
  "openai" { Run-Onboard-ApiKey -Choice "openai-api-key" -Flag "--openai-api-key" -Key $ApiKey }
  "openai-codex" { Invoke-Openclaw @("models","auth","login","--provider","openai-codex") }
  "qwen-portal" {
    Invoke-Openclaw @("plugins","enable","qwen-portal-auth")
    Invoke-Openclaw @("models","auth","login","--provider","qwen-portal","--set-default")
  }
  "gemini" { Run-Onboard-ApiKey -Choice "gemini-api-key" -Flag "--gemini-api-key" -Key $ApiKey }
  "openrouter" { Run-Onboard-ApiKey -Choice "openrouter-api-key" -Flag "--openrouter-api-key" -Key $ApiKey }
  "venice" { Run-Onboard-ApiKey -Choice "venice-api-key" -Flag "--venice-api-key" -Key $ApiKey }
  "moonshot" { Run-Onboard-ApiKey -Choice "moonshot-api-key" -Flag "--moonshot-api-key" -Key $ApiKey }
  "kimi-code" { Run-Onboard-ApiKey -Choice "kimi-code-api-key" -Flag "--kimi-code-api-key" -Key $ApiKey }
  "zai" { Run-Onboard-ApiKey -Choice "zai-api-key" -Flag "--zai-api-key" -Key $ApiKey }
  "xiaomi" { Run-Onboard-ApiKey -Choice "xiaomi-api-key" -Flag "--xiaomi-api-key" -Key $ApiKey }
  "minimax-api" { Run-Onboard-ApiKey -Choice "minimax-api" -Flag "--minimax-api-key" -Key $ApiKey }
  "minimax-api-lightning" { Run-Onboard-ApiKey -Choice "minimax-api-lightning" -Flag "--minimax-api-key" -Key $ApiKey }
  Default {
    if ($Auth -eq "oauth") {
      Invoke-Openclaw @("models","auth","login","--provider",$Provider)
    } else {
      Write-Error "未支持的 provider: $Provider"
      Show-Usage
      exit 1
    }
  }
}

Write-Host "完成。建议运行: openclaw models status"
Write-Host "注意：此脚本仅配置 provider，不会启动网关。"
