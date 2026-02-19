# lingshi_desktop

灵识 Lingshi 的 Electron 桌面托盘外壳（最小化实现）。

## 功能（Features）

- 托盘常驻启动
- 打开状态页：`http://127.0.0.1:18789/wecom`
- 打开供应商页：`http://127.0.0.1:18789/providers`
- 自动启动/重启网关子进程
- 轮询网关健康状态并在托盘菜单展示

## 本地运行（Run / dev）

```bash
pnpm install
pnpm dev
```

若启动时无法自动发现运行时路径，可设置：

```bash
LINGSHI_NODE_BIN=/Users/<you>/.nvm/versions/node/v22.22.0/bin/node \
LINGSHI_BOT_DIR=/Users/<you>/Documents/lingshi_project/lingshi_bot \
pnpm dev
```

兼容说明：`WEHELPER_NODE_BIN` / `WEHELPER_BOT_DIR` 在 P4 阶段仍可使用，但会输出弃用提示（deprecation warning）。

## 构建（Build）

```bash
pnpm build:mac
pnpm build:win
```
