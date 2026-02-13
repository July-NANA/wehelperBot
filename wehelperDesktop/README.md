# wehelperDesktop

Electron minimal tray shell for wehelper.

## Features

- Tray resident startup
- Open status page: `http://127.0.0.1:18789/wecom`
- Open supplier page: `http://127.0.0.1:18789/providers`
- Start/restart gateway child process automatically
- Poll gateway health and show status in tray menu

## Run (dev)

```bash
pnpm install
pnpm dev
```

If startup cannot find runtime paths, set:

```bash
WEHELPER_NODE_BIN=/Users/<you>/.nvm/versions/node/v22.22.0/bin/node \
WEHELPER_BOT_DIR=/Users/<you>/Documents/wehelper_project/wehelperBot \
pnpm dev
```

## Build

```bash
pnpm build:mac
pnpm build:win
```
