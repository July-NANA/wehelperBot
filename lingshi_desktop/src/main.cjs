const { app, BrowserWindow, Menu, Tray, nativeImage, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { pathToFileURL } = require("url");
const { spawn, execSync } = require("child_process");
const net = require("net");

const warnedLegacyEnv = new Set();
function readCompatEnv(primary, legacy, fallback = "") {
  const primaryValue = process.env[primary];
  if (primaryValue != null && String(primaryValue).length > 0) {
    return primaryValue;
  }
  const legacyValue = process.env[legacy];
  if (legacyValue != null && String(legacyValue).length > 0) {
    if (!warnedLegacyEnv.has(legacy)) {
      warnedLegacyEnv.add(legacy);
      console.warn(`[deprecation] ${legacy} is deprecated, please use ${primary}.`);
    }
    return legacyValue;
  }
  return fallback;
}

const requestedGatewayPort = Number.parseInt(
  readCompatEnv("LINGSHI_GATEWAY_PORT", "WEHELPER_GATEWAY_PORT", ""),
  10,
);
const GATEWAY_TOKEN = readCompatEnv(
  "LINGSHI_DESKTOP_TOKEN",
  "WEHELPER_DESKTOP_TOKEN",
  "desktop-token",
);
const UI_LOCALE = readCompatEnv("LINGSHI_UI_LOCALE", "WEHELPER_UI_LOCALE", "zh-CN");
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
let gatewayStartedAtMs = 0;
let pendingUiOpenTimer = null;

function gatewayBaseUrl() {
  if (!gatewayPort) {
    return null;
  }
  return `http://127.0.0.1:${gatewayPort}`;
}

function gatewayWsUrl() {
  if (!gatewayPort) {
    return null;
  }
  return `ws://127.0.0.1:${gatewayPort}`;
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

function buildDesktopBootstrap() {
  const wsUrl = gatewayWsUrl();
  if (!wsUrl) {
    return null;
  }
  return {
    gatewayUrl: wsUrl,
    token: GATEWAY_TOKEN || "",
    startupLock: true,
    basePath: "/",
    locale: UI_LOCALE || "zh-CN",
  };
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
  const bundledNode = path.join(
    process.resourcesPath || "",
    "runtime",
    process.platform === "win32" ? "node.exe" : "node",
  );
  if (isExecutable(bundledNode)) {
    return bundledNode;
  }

  const pathFromEnv = readCompatEnv("LINGSHI_NODE_BIN", "WEHELPER_NODE_BIN", "");
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

function resolveLingshiBotDir() {
  const envPath = readCompatEnv("LINGSHI_BOT_DIR", "WEHELPER_BOT_DIR", "");
  const candidates = [
    path.join(process.resourcesPath || "", "lingshi_bot"),
    path.join(process.resourcesPath || "", "wehelperBot"),
    envPath,
    path.join(PROJECT_ROOT, "lingshi_bot"),
    path.join(PROJECT_ROOT, "wehelperBot"),
    path.resolve(process.cwd(), "../lingshi_bot"),
    path.resolve(process.cwd(), "../wehelperBot"),
    path.join(os.homedir(), "Documents", "lingshi_project", "lingshi_bot"),
    path.join(os.homedir(), "Documents", "wehelper_project", "wehelperBot"),
  ];
  return firstExistingDir(candidates);
}

function resolveGatewayRuntime() {
  const nodeBin = resolveNodeBin();
  const botDir = resolveLingshiBotDir();
  if (!nodeBin || !botDir) {
    return null;
  }
  return { nodeBin, botDir };
}

function resolveLocalControlUiIndex() {
  const botDir = resolveLingshiBotDir();
  const envPath = readCompatEnv("LINGSHI_CONTROL_UI_INDEX", "WEHELPER_CONTROL_UI_INDEX", "");
  const candidates = [
    envPath,
    botDir ? path.join(botDir, "dist", "control-ui", "index.html") : null,
    path.join(PROJECT_ROOT, "lingshi_bot", "dist", "control-ui", "index.html"),
    path.join(PROJECT_ROOT, "wehelperBot", "dist", "control-ui", "index.html"),
    path.resolve(process.cwd(), "../lingshi_bot/dist/control-ui/index.html"),
    path.resolve(process.cwd(), "../wehelperBot/dist/control-ui/index.html"),
    path.join(process.resourcesPath || "", "lingshi_bot", "dist", "control-ui", "index.html"),
    path.join(process.resourcesPath || "", "wehelperBot", "dist", "control-ui", "index.html"),
    path.join(
      os.homedir(),
      "Documents",
      "lingshi_project",
      "lingshi_bot",
      "dist",
      "control-ui",
      "index.html",
    ),
    path.join(
      os.homedir(),
      "Documents",
      "wehelper_project",
      "wehelperBot",
      "dist",
      "control-ui",
      "index.html",
    ),
  ];
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

function tabFromTargetPath(targetPath) {
  switch (targetPath) {
    case "/wecom":
      return "wecom";
    case "/providers":
      return "providers";
    case "/chat":
    default:
      return "chat";
  }
}

function applyWindowTab(tab) {
  if (!statusWindow || statusWindow.isDestroyed()) {
    return;
  }
  const allowed = new Set(["chat", "wecom", "providers"]);
  const nextTab = allowed.has(tab) ? tab : "chat";
  statusWindow.webContents
    .executeJavaScript(
      `(() => {
        const app = document.querySelector("openclaw-app");
        if (!app || typeof app.setTab !== "function") return false;
        app.setTab(${JSON.stringify(nextTab)});
        return true;
      })();`,
      true,
    )
    .catch(() => {});
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

function createStatusWindow(targetPath, resolvedIndexPath) {
  const tab = tabFromTargetPath(targetPath);
  const controlUiIndex = resolvedIndexPath || resolveLocalControlUiIndex();
  if (!controlUiIndex) {
    dialog.showErrorBox(
      "控制台资源缺失",
      "未找到本地 Control UI 资源（dist/control-ui/index.html）。\n请先在 lingshi_bot 目录执行：pnpm ui:build",
    );
    return;
  }

  const bootstrap = buildDesktopBootstrap();
  const bootstrapArg = bootstrap
    ? `--lingshi-desktop-bootstrap=${encodeURIComponent(JSON.stringify(bootstrap))}`
    : null;
  const webPrefs = {
    preload: path.join(__dirname, "preload.cjs"),
    contextIsolation: true,
    sandbox: true,
  };
  if (bootstrapArg) {
    webPrefs.additionalArguments = [bootstrapArg];
  }

  if (statusWindow && !statusWindow.isDestroyed()) {
    applyWindowTab(tab);
    statusWindow.show();
    statusWindow.focus();
    return;
  }

  statusWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: "灵识 Lingshi 控制台",
    autoHideMenuBar: true,
    webPreferences: webPrefs,
  });

  statusWindow.loadURL(pathToFileURL(controlUiIndex).toString()).catch(() => {});
  statusWindow.webContents.once("did-finish-load", () => {
    applyWindowTab(tab);
  });
  statusWindow.on("closed", () => {
    statusWindow = null;
  });
}

function openStatusWindowWhenUiReady(targetPath, opts = {}) {
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? Math.max(0, opts.timeoutMs) : 12_000;
  const pollMs = Number.isFinite(opts.pollMs) ? Math.max(100, opts.pollMs) : 300;
  const deadline = Date.now() + timeoutMs;

  if (pendingUiOpenTimer) {
    clearTimeout(pendingUiOpenTimer);
    pendingUiOpenTimer = null;
  }

  const tryOpen = () => {
    const controlUiIndex = resolveLocalControlUiIndex();
    if (controlUiIndex) {
      createStatusWindow(targetPath, controlUiIndex);
      return;
    }
    if (Date.now() >= deadline) {
      createStatusWindow(targetPath);
      return;
    }
    pendingUiOpenTimer = setTimeout(tryOpen, pollMs);
  };

  tryOpen();
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

function gatewayLogFilePath() {
  return path.join(app.getPath("userData"), "gateway.log");
}

function appendGatewayLog(line) {
  try {
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.appendFileSync(gatewayLogFilePath(), `${new Date().toISOString()} ${line}\n`, "utf-8");
  } catch {
    // ignore
  }
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
      "未找到内置运行时（Node / lingshi_bot）。\n请重新安装桌面端，或设置 LINGSHI_NODE_BIN 与 LINGSHI_BOT_DIR 后重试。",
    );
    return false;
  }

  gatewayProcess = spawn(runtime.nodeBin, gatewayArgs(), {
    cwd: runtime.botDir,
    env: { ...process.env },
    detached: false,
    stdio: process.platform === "win32" ? ["ignore", "pipe", "pipe"] : "inherit",
    windowsHide: process.platform === "win32",
  });
  gatewayStartedAtMs = Date.now();
  appendGatewayLog(
    `[spawn] node=${runtime.nodeBin} cwd=${runtime.botDir} args=${gatewayArgs().join(" ")}`,
  );

  if (process.platform === "win32" && gatewayProcess.stdout && gatewayProcess.stderr) {
    gatewayProcess.stdout.on("data", (chunk) => {
      appendGatewayLog(`[stdout] ${String(chunk).trimEnd()}`);
    });
    gatewayProcess.stderr.on("data", (chunk) => {
      appendGatewayLog(`[stderr] ${String(chunk).trimEnd()}`);
    });
  }

  gatewayProcess.on("exit", (code, signal) => {
    appendGatewayLog(`[exit] code=${code ?? "?"} signal=${signal ?? "?"}`);
    gatewayProcess = null;
    gatewayHealthy = false;
    clearRuntimeState();
    updateTrayMenu();
    if (!quitting && Date.now() - gatewayStartedAtMs < 30_000) {
      dialog.showErrorBox(
        "网关启动失败",
        `网关进程异常退出 (code=${code ?? "?"}, signal=${signal ?? "?"})。\n日志：${gatewayLogFilePath()}`,
      );
    }
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
    if (pendingUiOpenTimer) {
      clearTimeout(pendingUiOpenTimer);
      pendingUiOpenTimer = null;
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
  tray.setToolTip(`lingshi_desktop - ${statusText}`);

  const template = [
    { label: statusText, enabled: false },
    { label: runtimeText, enabled: false },
    { type: "separator" },
    {
      label: "打开状态页",
      click: () => openStatusWindowWhenUiReady("/wecom"),
    },
    {
      label: "打开供应商页",
      click: () => openStatusWindowWhenUiReady("/providers"),
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
    // Keep tray icon at menu-bar scale even if source PNG is large.
    icon = icon.resize({ width: 18, height: 18, quality: "best" });
    icon.setTemplateImage(true);
  } else {
    icon = icon.resize({ width: 16, height: 16, quality: "best" });
  }

  tray = new Tray(icon);
  tray.on("double-click", () => openStatusWindowWhenUiReady("/chat"));
  updateTrayMenu();
}

app.whenReady().then(async () => {
  gatewayPort = await resolveGatewayPort();
  const started = startGateway();
  createTray();
  openStatusWindowWhenUiReady("/chat");
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
