const { app, BrowserWindow, Menu, Tray, nativeImage, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn, execSync } = require("child_process");
const net = require("net");

const requestedGatewayPort = Number.parseInt(process.env.WEHELPER_GATEWAY_PORT || "", 10);
const GATEWAY_TOKEN = process.env.WEHELPER_DESKTOP_TOKEN || "desktop-token";
const UI_LOCALE = process.env.WEHELPER_UI_LOCALE || "zh-CN";
const PROJECT_ROOT = path.resolve(__dirname, "../..");
let resolvedGateway = null;
let gatewayPort = null;

let tray = null;
let statusWindow = null;
let gatewayProcess = null;
let healthTimer = null;
let gatewayHealthy = false;
let quitting = false;
let shutdownPromise = null;

function gatewayBaseUrl() {
  if (!gatewayPort) {
    return null;
  }
  return `http://127.0.0.1:${gatewayPort}`;
}

function dashboardUrl(targetPath) {
  const baseUrl = gatewayBaseUrl();
  if (!baseUrl) {
    return null;
  }
  const url = new URL(`${baseUrl}${targetPath}`);
  if (GATEWAY_TOKEN) {
    url.searchParams.set("token", GATEWAY_TOKEN);
  }
  if (UI_LOCALE) {
    url.searchParams.set("locale", UI_LOCALE);
  }
  return url.toString();
}

function isExecutable(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function firstExistingDir(candidates) {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }
  return null;
}

function resolveNvmNodeCandidates() {
  const nvmNodeRoot = path.join(os.homedir(), ".nvm", "versions", "node");
  if (!fs.existsSync(nvmNodeRoot)) {
    return [];
  }
  const entries = fs
    .readdirSync(nvmNodeRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();
  return entries.map((version) => path.join(nvmNodeRoot, version, "bin", "node"));
}

function resolveNodeBin() {
  const pathFromEnv = process.env.WEHELPER_NODE_BIN;
  if (pathFromEnv && isExecutable(pathFromEnv)) {
    return pathFromEnv;
  }
  const staticCandidates = [
    "/opt/homebrew/bin/node",
    "/usr/local/bin/node",
    "/usr/bin/node",
    path.join(os.homedir(), ".local", "bin", "node"),
  ];
  const dynamicCandidates = resolveNvmNodeCandidates();
  const allCandidates = [...dynamicCandidates, ...staticCandidates];
  for (const candidate of allCandidates) {
    if (isExecutable(candidate)) {
      return candidate;
    }
  }
  return null;
}

function resolveWehelperBotDir() {
  const envPath = process.env.WEHELPER_BOT_DIR;
  const candidates = [
    envPath,
    path.join(PROJECT_ROOT, "wehelperBot"),
    path.resolve(process.cwd(), "../wehelperBot"),
    path.join(process.resourcesPath || "", "wehelperBot"),
    path.join(os.homedir(), "Documents", "wehelper_project", "wehelperBot"),
  ];
  return firstExistingDir(candidates);
}

function resolveGatewayRuntime() {
  const nodeBin = resolveNodeBin();
  const botDir = resolveWehelperBotDir();
  if (!nodeBin || !botDir) {
    return null;
  }
  return { nodeBin, botDir };
}

function gatewayArgs() {
  if (!gatewayPort) {
    throw new Error("gateway_port_not_resolved");
  }
  return [
    "openclaw.mjs",
    "gateway",
    "--port",
    String(gatewayPort),
    "--allow-unconfigured",
    "--token",
    GATEWAY_TOKEN,
  ];
}

function createStatusWindow(targetPath) {
  const url = dashboardUrl(targetPath);
  if (!url) {
    dialog.showErrorBox("网关未启动", "网关端口尚未分配，请先启动网关。");
    return;
  }
  if (statusWindow && !statusWindow.isDestroyed()) {
    statusWindow.loadURL(url).catch(() => {});
    statusWindow.show();
    statusWindow.focus();
    return;
  }

  statusWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: "wehelper 控制台",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
    },
  });

  statusWindow.loadURL(url).catch(() => {});
  statusWindow.on("closed", () => {
    statusWindow = null;
  });
}

function killProcessTree(child, signal) {
  if (!child || child.exitCode != null) {
    return;
  }
  try {
    if (process.platform === "win32") {
      const sig = signal === "SIGKILL" ? "/F" : "";
      spawn("taskkill", ["/PID", String(child.pid), "/T", sig].filter(Boolean), {
        stdio: "ignore",
      });
      return;
    }
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // ignore
    }
  }
}

function stopGateway() {
  if (!gatewayProcess) {
    return;
  }
  const child = gatewayProcess;
  gatewayProcess = null;
  killProcessTree(child, "SIGTERM");
  setTimeout(() => {
    if (child.exitCode == null) {
      killProcessTree(child, "SIGKILL");
    }
  }, 2000);
}

function listGatewayListenerPids() {
  if (!gatewayPort) {
    return [];
  }
  try {
    const output = execSync(`lsof -ti tcp:${gatewayPort} -sTCP:LISTEN`, {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    if (!output) {
      return [];
    }
    return output
      .split(/\s+/)
      .map((v) => Number.parseInt(v, 10))
      .filter((v) => Number.isInteger(v) && v > 0);
  } catch {
    return [];
  }
}

function killGatewayByPortSync() {
  if (process.platform === "win32") {
    return;
  }
  const pids = listGatewayListenerPids();
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // ignore
    }
  }
  const left = listGatewayListenerPids();
  for (const pid of left) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // ignore
    }
  }
}

function runtimeFilePath() {
  return path.join(app.getPath("userData"), "runtime.json");
}

function writeRuntimeState() {
  try {
    const runtime = {
      gateway: {
        port: gatewayPort,
        token: GATEWAY_TOKEN,
        pid: gatewayProcess?.pid ?? null,
      },
      updatedAt: Date.now(),
    };
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.writeFileSync(runtimeFilePath(), JSON.stringify(runtime, null, 2), "utf-8");
  } catch {
    // ignore
  }
}

function clearRuntimeState() {
  try {
    fs.unlinkSync(runtimeFilePath());
  } catch {
    // ignore
  }
}

function probePortAvailable(port) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once("error", () => resolve(false));
    tester.once("listening", () => {
      tester.close(() => resolve(true));
    });
    tester.listen(port, "127.0.0.1");
  });
}

function allocateEphemeralPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = addr && typeof addr === "object" ? addr.port : null;
      server.close(() => {
        if (typeof port === "number" && port > 0) {
          resolve(port);
          return;
        }
        reject(new Error("allocate_ephemeral_port_failed"));
      });
    });
  });
}

async function resolveGatewayPort() {
  if (Number.isInteger(requestedGatewayPort) && requestedGatewayPort > 0) {
    const ok = await probePortAvailable(requestedGatewayPort);
    if (ok) {
      return requestedGatewayPort;
    }
  }
  return allocateEphemeralPort();
}

function startGateway() {
  if (gatewayProcess) {
    return true;
  }
  if (!gatewayPort) {
    return false;
  }
  const runtime = resolveGatewayRuntime();
  resolvedGateway = runtime;
  if (!runtime) {
    dialog.showErrorBox(
      "网关启动失败",
      "未找到 Node.js 或 wehelperBot 目录。\n请设置 WEHELPER_NODE_BIN 与 WEHELPER_BOT_DIR 后重试。",
    );
    return false;
  }

  gatewayProcess = spawn(runtime.nodeBin, gatewayArgs(), {
    cwd: runtime.botDir,
    env: { ...process.env },
    detached: false,
    stdio: "inherit",
  });

  gatewayProcess.on("exit", () => {
    gatewayProcess = null;
    gatewayHealthy = false;
    clearRuntimeState();
    updateTrayMenu();
  });
  gatewayProcess.on("error", (error) => {
    gatewayProcess = null;
    gatewayHealthy = false;
    updateTrayMenu();
    dialog.showErrorBox("网关启动失败", String(error?.message || error));
  });
  writeRuntimeState();
  return true;
}

function closeStatusWindow() {
  if (statusWindow && !statusWindow.isDestroyed()) {
    statusWindow.removeAllListeners("closed");
    statusWindow.close();
  }
  statusWindow = null;
}

async function shutdownDesktop() {
  if (shutdownPromise) {
    return shutdownPromise;
  }
  shutdownPromise = Promise.resolve().then(() => {
    quitting = true;
    if (healthTimer) {
      clearInterval(healthTimer);
      healthTimer = null;
    }
    closeStatusWindow();
    if (tray) {
      tray.destroy();
      tray = null;
    }
    stopGateway();
    // Final synchronous fallback: ensure gateway listener is gone before app exits.
    killGatewayByPortSync();
    clearRuntimeState();
  });
  return shutdownPromise;
}

async function probeHealth() {
  const baseUrl = gatewayBaseUrl();
  if (!baseUrl) {
    gatewayHealthy = false;
    updateTrayMenu();
    return;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(`${baseUrl}/health`, { signal: controller.signal });
    gatewayHealthy = response.ok;
  } catch {
    gatewayHealthy = false;
  } finally {
    clearTimeout(timer);
    updateTrayMenu();
  }
}

function updateTrayMenu() {
  if (!tray) {
    return;
  }
  const statusText = gatewayHealthy ? "网关状态：在线" : "网关状态：离线";
  const portText = gatewayPort ? `端口: ${gatewayPort}` : "端口: 未分配";
  const runtimeText = resolvedGateway
    ? `${portText}\nNode: ${resolvedGateway.nodeBin}\nBot: ${resolvedGateway.botDir}`
    : "Node/Bot: 未解析";
  tray.setToolTip(`wehelperDesktop - ${statusText}`);

  const template = [
    { label: statusText, enabled: false },
    { label: runtimeText, enabled: false },
    { type: "separator" },
    {
      label: "打开状态页",
      click: () => createStatusWindow("/wecom"),
    },
    {
      label: "打开供应商页",
      click: () => createStatusWindow("/providers"),
    },
    { type: "separator" },
    {
      label: "重启网关",
      click: async () => {
        stopGateway();
        if (!gatewayPort) {
          gatewayPort = await resolveGatewayPort();
        }
        startGateway();
        setTimeout(() => {
          probeHealth();
        }, 600);
      },
    },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ];

  tray.setContextMenu(Menu.buildFromTemplate(template));
}

function createTray() {
  const iconPath = path.join(__dirname, "../assets/trayTemplate.png");
  let icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    icon = nativeImage.createEmpty();
  }
  if (process.platform === "darwin") {
    icon.setTemplateImage(true);
  }

  tray = new Tray(icon);
  tray.on("double-click", () => createStatusWindow("/wecom"));
  updateTrayMenu();
}

app.whenReady().then(async () => {
  gatewayPort = await resolveGatewayPort();
  const started = startGateway();
  createTray();
  if (started) {
    probeHealth();
    healthTimer = setInterval(probeHealth, 8000);
  } else {
    updateTrayMenu();
  }
});

app.on("window-all-closed", (event) => {
  if (!quitting) {
    event.preventDefault();
  }
});

app.on("before-quit", (event) => {
  if (!quitting || !shutdownPromise) {
    event.preventDefault();
    void shutdownDesktop().then(() => {
      // Give SIGTERM/SIGKILL timers a short drain window before force-exit.
      setTimeout(() => {
        app.exit(0);
      }, 500);
    });
  }
});

app.on("will-quit", () => {
  void shutdownDesktop();
});
