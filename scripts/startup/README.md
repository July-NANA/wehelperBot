# 启动脚本说明（Wehelper / OpenClaw）

本目录提供 4 个脚本：

- `setup_wehelper.(sh|ps1)`：一键安装/构建并前台启动网关
- `configure_provider.(sh|ps1)`：仅配置模型 Provider（API Key 或 OAuth），不启动网关

适用场景：

- **已配置 Provider**：直接运行 `setup_wehelper` 启动即可
- **未配置 Provider**：先运行 `configure_provider` 完成授权，再启动

---

## 一、快速开始（已配置 Provider）

### macOS / Linux

```bash
./openclaw/scripts/startup/setup_wehelper.sh
```

### Windows (PowerShell)

```powershell
.\openclaw\scripts\startup\setup_wehelper.ps1
```

启动后会打印网关 token，例如：

```
Generated gateway token: <TOKEN>
Tip: export OPENCLAW_GATEWAY_TOKEN=<TOKEN>
```

浏览器访问：

```
http://127.0.0.1:18789/
```

如提示 `token mismatch`，在控制台 UI 设置里粘贴 `<TOKEN>` 即可。

---

## 二、首次使用（未配置 Provider）

先配置 Provider，再启动网关。

### 1) 配置 Provider

#### macOS / Linux

```bash
./openclaw/scripts/startup/configure_provider.sh
```

#### Windows (PowerShell)

```powershell
.\openclaw\scripts\startup\configure_provider.ps1
```

说明：

- 默认进入交互式选择 Provider
- 若已配置过，会提示并直接退出（除非使用 `--force` / `-Force`）

### 2) 启动网关

```bash
./openclaw/scripts/startup/setup_wehelper.sh
```

或（Windows）：

```powershell
.\openclaw\scripts\startup\setup_wehelper.ps1
```

---

## 三、setup_wehelper 详细说明（启动脚本）

### macOS / Linux

```bash
./openclaw/scripts/startup/setup_wehelper.sh [--port <port>] [--skip-build] [--token <token>]
```

参数：

- `--port <port>`：覆盖默认端口（默认 18789）
- `--skip-build`：跳过构建步骤（仅启动）
- `--token <token>`：指定网关 token（或设置 `OPENCLAW_GATEWAY_TOKEN`）

依赖检查：

- 必需：`node`、`pnpm`、`python`
- 可选：`cloudflared`（缺失仅提示，不阻断）

### Windows (PowerShell)

```powershell
.\openclaw\scripts\startup\setup_wehelper.ps1 -Port 18789 -Token "<token>" [-SkipBuild]
```

---

## 四、configure_provider 详细说明（仅配置 Provider）

### macOS / Linux

```bash
./openclaw/scripts/startup/configure_provider.sh \
  [--provider <id>] [--auth <token|api-key|oauth>] \
  [--api-key <key>] [--token <token>] [--force]
```

### Windows (PowerShell)

```powershell
.\openclaw\scripts\startup\configure_provider.ps1 \
  -Provider <id> -Auth <token|api-key|oauth> \
  -ApiKey <key> -Token <token> [-Force]
```

说明：

- 不带参数时进入交互选择
- 支持 OAuth 和 API Key 两类方式
- 已配置时默认不重复执行，`--force` / `-Force` 可强制重配
- 优先使用系统 `openclaw`，若不可用会自动退回 `pnpm openclaw`

示例：

```bash
./openclaw/scripts/startup/configure_provider.sh --provider openai --auth api-key --api-key "<key>"
./openclaw/scripts/startup/configure_provider.sh --provider qwen-portal --auth oauth
```

---

## 五、常见问题

### 1) 打开 UI 但无回复

- 绝大多数是 **Provider 未配置或授权失效**
- 先运行 `configure_provider` 配置，再重启网关

### 2) token mismatch

- UI 右上角设置里粘贴脚本输出的 `<TOKEN>`
- 或使用 `--token` / `OPENCLAW_GATEWAY_TOKEN` 固定 token

### 3) 重新配置 Provider

- 使用 `configure_provider` + `--force` / `-Force`

---

## 六、推荐验证流程

1. 配置 Provider（若已配置可跳过）
2. 启动网关
3. 浏览器打开控制台并发送一条消息
4. 能有回复即验证成功
