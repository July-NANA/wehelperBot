import type { PluginRuntime } from "openclaw/plugin-sdk";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import WebSocket from "ws";
import {
  applyStartOverrides,
  missingRequiredFields,
  type WecomKfConfig,
  type WecomKfStartParams,
} from "./config.js";

export type WecomKfStatus = {
  running: boolean;
  tunnelRunning: boolean;
  publicUrl: string | null;
  callbackUrl: string | null;
  servicePid: number | null;
  tunnelPid: number | null;
  lastError: string | null;
  missing: string[];
  listenHost: string;
  listenPort: number;
  device: WecomKfDeviceState;
};

export type WecomKfDeviceState = {
  enabled: boolean;
  baseUrl: string | null;
  deviceId: string;
  connectToken: string | null;
  isBound: boolean;
  shortCode: string | null;
  expiresAt: number | null;
  expiresInSeconds: number | null;
  binding: {
    externalUserid: string | null;
    openKfid: string | null;
    boundAt: number | null;
  } | null;
  polling: boolean;
  wsConnected: boolean;
  wsConnecting: boolean;
  wsLastConnectedAt: number | null;
  wsLastMessageAt: number | null;
  wsLastError: string | null;
  online: boolean;
  lastSeenAt: number | null;
  lastSyncAt: number | null;
  lastError: string | null;
};

type RuntimeParams = {
  logger: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
  runtime: PluginRuntime;
  stateDir: string;
  wehelperDir: string;
};

type RuntimeState = {
  service: ChildProcessWithoutNullStreams | null;
  tunnel: ChildProcessWithoutNullStreams | null;
  publicUrl: string | null;
  lastError: string | null;
  pollTimer: ReturnType<typeof setInterval> | null;
  pollInFlight: boolean;
  ws: WebSocket | null;
  wsStopRequested: boolean;
  wsReconnectTimer: ReturnType<typeof setTimeout> | null;
  pendingResults: Array<{
    request_id: string;
    ok: boolean;
    reply_text?: string;
    error?: string;
  }>;
  localAgentId: string;
  localAgentTimeoutMs: number;
  agentConfigPath: string | null;
  deviceStatus: WecomKfDeviceState;
};

const TRY_CLOUDFLARE_RE = /https:\/\/[\w-]+\.trycloudflare\.com/;
const DEVICE_STATUS_POLL_MS = 15_000;
const DEVICE_WS_RECONNECT_MS = 5_000;

export function createWecomKfRuntime(params: RuntimeParams) {
  const state: RuntimeState = {
    service: null,
    tunnel: null,
    publicUrl: null,
    lastError: null,
    pollTimer: null,
    pollInFlight: false,
    ws: null,
    wsStopRequested: false,
    wsReconnectTimer: null,
    pendingResults: [],
    localAgentId: "main",
    localAgentTimeoutMs: 180_000,
    agentConfigPath: null,
    deviceStatus: {
      enabled: false,
      baseUrl: null,
      deviceId: "",
      connectToken: null,
      isBound: false,
      shortCode: null,
      expiresAt: null,
      expiresInSeconds: null,
      binding: null,
      polling: false,
      wsConnected: false,
      wsConnecting: false,
      wsLastConnectedAt: null,
      wsLastMessageAt: null,
      wsLastError: null,
      online: false,
      lastSeenAt: null,
      lastSyncAt: null,
      lastError: null,
    },
  };

  const ensureStateDir = () => {
    try {
      fs.mkdirSync(params.stateDir, { recursive: true });
    } catch (err) {
      params.logger.warn(`[wecom-kf] failed to ensure state dir: ${String(err)}`);
    }
  };

  const status = (cfg: WecomKfConfig): WecomKfStatus => {
    const running = Boolean(state.service && state.service.exitCode === null);
    const tunnelRunning = Boolean(state.tunnel && state.tunnel.exitCode === null);
    const publicUrl = state.publicUrl;
    return {
      running,
      tunnelRunning,
      publicUrl,
      callbackUrl: publicUrl ? `${publicUrl}/wechat/cs/callback` : null,
      servicePid: state.service?.pid ?? null,
      tunnelPid: state.tunnel?.pid ?? null,
      lastError: state.lastError,
      missing: missingRequiredFields(cfg),
      listenHost: cfg.listenHost,
      listenPort: cfg.listenPort,
      device: { ...state.deviceStatus, binding: state.deviceStatus.binding ?? null },
    };
  };

  const startService = (cfg: WecomKfConfig) => {
    if (state.service && state.service.exitCode === null) {
      return;
    }
    ensureStateDir();

    const env = {
      ...process.env,
      WE_COM_KF_CORP_ID: cfg.corpId,
      WE_COM_KF_TOKEN: cfg.token,
      WE_COM_KF_AES_KEY: cfg.aesKey,
      WE_COM_KF_SECRET: cfg.secret,
      WE_COM_KF_SKIP_HISTORY: cfg.skipHistory ? "1" : "0",
      WE_COM_KF_CURSOR_PATH: path.join(params.stateDir, "wecom_kf_cursor.json"),
      WE_COM_KF_SESSION_MAP_PATH:
        cfg.sessionMapPath || path.join(params.stateDir, "wecom_kf_sessions.json"),
    };

    const args = [
      "-m",
      "uvicorn",
      "wehelper_gateway.main:app",
      "--host",
      cfg.listenHost,
      "--port",
      String(cfg.listenPort),
    ];

    const child = spawn("python", args, {
      cwd: params.wehelperDir,
      env,
    });

    state.service = child;
    state.lastError = null;

    child.stdout.on("data", (chunk) => {
      params.logger.info(`[wecom-kf] ${String(chunk).trim()}`);
    });
    child.stderr.on("data", (chunk) => {
      params.logger.warn(`[wecom-kf] ${String(chunk).trim()}`);
    });
    child.on("exit", (code, signal) => {
      if (code !== 0) {
        state.lastError = `service exited (code=${code ?? "?"}, signal=${signal ?? "?"})`;
        params.logger.error(`[wecom-kf] ${state.lastError}`);
      }
      state.service = null;
    });
  };

  const startTunnel = (cfg: WecomKfConfig, tunnelUrl: string) => {
    if (!cfg.tunnel.autoStart) {
      return;
    }
    if (state.tunnel && state.tunnel.exitCode === null) {
      return;
    }

    const args = [
      "tunnel",
      "--url",
      tunnelUrl,
      "--protocol",
      cfg.tunnel.protocol,
      "--loglevel",
      cfg.tunnel.loglevel,
    ];

    const child = spawn(cfg.tunnel.bin, args, {
      env: process.env,
    });

    state.tunnel = child;

    const handleTunnelLine = (line: string, level: "info" | "warn") => {
      const trimmed = line.trim();
      if (!trimmed) return;
      if (level === "info") {
        params.logger.info(`[wecom-kf] tunnel ${trimmed}`);
      } else {
        params.logger.warn(`[wecom-kf] tunnel ${trimmed}`);
      }
      const match = trimmed.match(TRY_CLOUDFLARE_RE);
      if (match) {
        state.publicUrl = match[0];
        state.lastError = null;
      }
    };

    const handleTunnelChunk = (chunk: Buffer, level: "info" | "warn") => {
      const text = String(chunk);
      for (const line of text.split(/\r?\n/)) {
        handleTunnelLine(line, level);
      }
    };

    child.stdout.on("data", (chunk) => {
      handleTunnelChunk(chunk as Buffer, "info");
    });
    child.stderr.on("data", (chunk) => {
      handleTunnelChunk(chunk as Buffer, "warn");
    });
    child.on("exit", (code, signal) => {
      if (code !== 0) {
        state.lastError = `tunnel exited (code=${code ?? "?"}, signal=${signal ?? "?"})`;
        params.logger.error(`[wecom-kf] ${state.lastError}`);
      }
      state.tunnel = null;
      state.publicUrl = null;
    });
  };

  const stopProcess = (child: ChildProcessWithoutNullStreams | null, name: string) => {
    if (!child || child.exitCode !== null) {
      return;
    }
    try {
      child.kill("SIGTERM");
    } catch (err) {
      params.logger.warn(`[wecom-kf] failed to stop ${name}: ${String(err)}`);
    }
  };

  const resolveServerBaseUrl = (cfg: WecomKfConfig): string | null => {
    const trimmed = cfg.serverBaseUrl.trim();
    if (!trimmed) {
      return null;
    }
    try {
      const parsed = new URL(trimmed);
      parsed.pathname = "/";
      parsed.search = "";
      parsed.hash = "";
      return parsed.toString().replace(/\/$/, "");
    } catch {
      return null;
    }
  };

  const resolveDeviceId = (cfg: WecomKfConfig): string => {
    const configured = cfg.deviceId.trim();
    if (configured) {
      return configured;
    }
    ensureStateDir();
    const pathDeviceId = path.join(params.stateDir, "wecom_kf_device_id.txt");
    try {
      const existing = fs.readFileSync(pathDeviceId, "utf-8").trim();
      if (existing) {
        return existing;
      }
    } catch {
      // ignore
    }
    const generated = `bot-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    try {
      fs.writeFileSync(pathDeviceId, generated, "utf-8");
    } catch (err) {
      params.logger.warn(`[wecom-kf] failed to persist device id: ${String(err)}`);
    }
    return generated;
  };

  const decodeNumber = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };

  const decodeString = (value: unknown): string | null => {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };

  const fetchJson = async (
    method: "GET" | "POST",
    url: string,
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, {
        method,
        headers: {
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText || "request failed"}`);
      }
      const json = (await response.json()) as unknown;
      if (!json || typeof json !== "object" || Array.isArray(json)) {
        throw new Error("invalid response payload");
      }
      return json as Record<string, unknown>;
    } finally {
      clearTimeout(timer);
    }
  };

  const applyDeviceSnapshot = (
    payload: Record<string, unknown>,
    paramsIn: { baseUrl: string; deviceId: string },
  ) => {
    state.deviceStatus.enabled = true;
    state.deviceStatus.baseUrl = paramsIn.baseUrl;
    state.deviceStatus.deviceId = paramsIn.deviceId;
    state.deviceStatus.connectToken =
      decodeString(payload.connect_token) ?? state.deviceStatus.connectToken;
    state.deviceStatus.isBound = payload.is_bound === true;
    state.deviceStatus.shortCode = decodeString(payload.short_code);
    state.deviceStatus.expiresAt = decodeNumber(payload.expires_at);
    state.deviceStatus.expiresInSeconds = decodeNumber(payload.expires_in_seconds);
    state.deviceStatus.online = payload.online === true;
    state.deviceStatus.lastSeenAt = decodeNumber(payload.last_seen_at);
    state.deviceStatus.lastSyncAt = Date.now();
    state.deviceStatus.lastError = null;
    const binding =
      payload.binding && typeof payload.binding === "object" && !Array.isArray(payload.binding)
        ? (payload.binding as Record<string, unknown>)
        : null;
    state.deviceStatus.binding = binding
      ? {
          externalUserid: decodeString(binding.external_userid),
          openKfid: decodeString(binding.open_kfid),
          boundAt: decodeNumber(binding.bound_at),
        }
      : null;
  };

  const resolveWsBaseUrl = (baseUrl: string): string | null => {
    try {
      const parsed = new URL(baseUrl);
      parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
      parsed.pathname = "";
      parsed.search = "";
      parsed.hash = "";
      return parsed.toString().replace(/\/$/, "");
    } catch {
      return null;
    }
  };

  const clearReconnectTimer = () => {
    if (state.wsReconnectTimer != null) {
      clearTimeout(state.wsReconnectTimer);
      state.wsReconnectTimer = null;
    }
  };

  const scheduleReconnect = () => {
    if (state.wsStopRequested || state.wsReconnectTimer != null) {
      return;
    }
    state.wsReconnectTimer = setTimeout(() => {
      state.wsReconnectTimer = null;
      void ensureDeviceSocketConnected();
    }, DEVICE_WS_RECONNECT_MS);
  };

  const closeDeviceSocket = () => {
    clearReconnectTimer();
    const ws = state.ws;
    state.ws = null;
    state.deviceStatus.wsConnecting = false;
    state.deviceStatus.wsConnected = false;
    if (!ws) {
      return;
    }
    try {
      ws.removeAllListeners();
      if (ws.readyState === WebSocket.CONNECTING) {
        ws.terminate();
      } else if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CLOSING) {
        ws.close();
      }
    } catch {
      // ignore
    }
  };

  const extractAgentText = (stdout: string): string => {
    const trimmed = (stdout || "").trim();
    if (!trimmed) {
      return "";
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // Some CLI runs print warnings before JSON payload. Try to recover
      // by parsing the last JSON object segment.
      const start = trimmed.lastIndexOf("\n{");
      const candidate = start >= 0 ? trimmed.slice(start + 1).trim() : "";
      if (candidate.startsWith("{") && candidate.endsWith("}")) {
        try {
          parsed = JSON.parse(candidate);
        } catch {
          return trimmed;
        }
      } else {
        return trimmed;
      }
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return trimmed;
    }
    const record = parsed as {
      payloads?: Array<{ text?: string }>;
      result?: { payloads?: Array<{ text?: string }> };
      summary?: string;
    };
    const payloads = [...(record.payloads ?? []), ...(record.result?.payloads ?? [])].filter(
      Boolean,
    );
    const chunks = payloads
      .map((entry) => (typeof entry.text === "string" ? entry.text.trim() : ""))
      .filter(Boolean);
    const joined = chunks.join("\n").trim();
    if (joined) {
      return joined;
    }
    return typeof record.summary === "string" ? record.summary.trim() : "";
  };

  const resolveLocalOpenclaw = (): { argvPrefix: string[]; cwd: string } | null => {
    const candidates = [
      params.wehelperDir,
      process.cwd(),
      path.resolve(params.wehelperDir, ".."),
      path.resolve(process.cwd(), ".."),
    ];
    const seen = new Set<string>();
    for (const base of candidates) {
      if (!base || seen.has(base)) {
        continue;
      }
      seen.add(base);
      const entry = path.join(base, "openclaw.mjs");
      try {
        if (fs.existsSync(entry)) {
          const nodeExec = process.execPath && process.execPath.trim() ? process.execPath : "node";
          return {
            argvPrefix: [nodeExec, entry],
            cwd: base,
          };
        }
      } catch {
        // ignore
      }
    }
    return null;
  };

  const runLocalAgent = async (message: string, sessionId: string): Promise<string> => {
    const resolveAgentEnv = async (): Promise<NodeJS.ProcessEnv> => {
      const env: NodeJS.ProcessEnv = {};
      const targetPath = path.join(params.stateDir, "wecom_kf_agent_config.json");
      try {
        const full = await params.runtime.config.loadConfig();
        const cloned =
          full && typeof full === "object"
            ? (JSON.parse(JSON.stringify(full)) as Record<string, unknown>)
            : {};
        // Child agent runs must not load plugins, otherwise wecom-kf config
        // warnings/noise can pollute --json output.
        cloned.plugins = { enabled: false };
        if (cloned.meta && typeof cloned.meta === "object" && !Array.isArray(cloned.meta)) {
          const meta = cloned.meta as Record<string, unknown>;
          delete meta.lastTouchedVersion;
          delete meta.lastTouchedAt;
        }
        fs.writeFileSync(targetPath, JSON.stringify(cloned, null, 2), "utf-8");
        state.agentConfigPath = targetPath;
        env.OPENCLAW_CONFIG_PATH = targetPath;
      } catch (err) {
        params.logger.warn(`[wecom-kf] failed to build agent-only config: ${String(err)}`);
      }
      return env;
    };

    const agentEnv = await resolveAgentEnv();
    const resolvedOpenclaw = resolveLocalOpenclaw();
    const argv = [
      ...(resolvedOpenclaw?.argvPrefix ?? ["openclaw"]),
      "agent",
      "--local",
      "--agent",
      state.localAgentId,
      "--session-id",
      sessionId,
      "--message",
      message,
      "--json",
      "--timeout",
      String(Math.ceil(state.localAgentTimeoutMs / 1000)),
    ];
    const result = await params.runtime.system.runCommandWithTimeout(argv, {
      timeoutMs: state.localAgentTimeoutMs,
      cwd: resolvedOpenclaw?.cwd ?? params.wehelperDir,
      env: agentEnv,
    });
    if (result.code !== 0) {
      const detail = result.stderr.trim() || result.stdout.trim() || "openclaw_agent_failed";
      throw new Error(detail);
    }
    const text = extractAgentText(result.stdout);
    return text || "（无输出）";
  };

  const handleInboundMessage = async (
    ws: WebSocket,
    payload: {
      request_id?: unknown;
      open_kfid?: unknown;
      external_userid?: unknown;
      content?: unknown;
    },
  ) => {
    const requestId =
      typeof payload.request_id === "string" && payload.request_id.trim()
        ? payload.request_id.trim()
        : "";
    if (!requestId) {
      return;
    }
    const openKfid = typeof payload.open_kfid === "string" ? payload.open_kfid.trim() : "";
    const externalUserid =
      typeof payload.external_userid === "string" ? payload.external_userid.trim() : "";
    const content = typeof payload.content === "string" ? payload.content : "";
    const sessionId = `wx_${openKfid || "na"}_${externalUserid || "na"}`;

    const sendInboundResult = (payloadIn: {
      request_id: string;
      ok: boolean;
      reply_text?: string;
      error?: string;
    }) => {
      const active = state.ws;
      const packet = JSON.stringify({ type: "inbound_result", ...payloadIn });
      if (active && active.readyState === WebSocket.OPEN) {
        try {
          active.send(packet);
          return;
        } catch {
          // fall through to queue
        }
      }
      state.pendingResults.push(payloadIn);
    };

    try {
      const replyText = await runLocalAgent(content, sessionId);
      sendInboundResult({
        request_id: requestId,
        ok: true,
        reply_text: replyText,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      params.logger.warn(`[wecom-kf] local agent failed: ${message}`);
      sendInboundResult({
        request_id: requestId,
        ok: false,
        error: message || "agent_failed",
      });
    }
  };

  const ensureDeviceSocketConnected = async (): Promise<void> => {
    if (state.wsStopRequested) {
      return;
    }
    const { baseUrl, deviceId, connectToken, isBound } = state.deviceStatus;
    if (!baseUrl || !deviceId || !connectToken || !isBound) {
      return;
    }
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      return;
    }
    if (state.deviceStatus.wsConnecting) {
      return;
    }

    const wsBase = resolveWsBaseUrl(baseUrl);
    if (!wsBase) {
      state.deviceStatus.wsLastError = "invalid serverBaseUrl for websocket";
      return;
    }
    const wsUrl = `${wsBase}/api/device/connect?device_id=${encodeURIComponent(
      deviceId,
    )}&token=${encodeURIComponent(connectToken)}`;

    clearReconnectTimer();
    closeDeviceSocket();
    state.deviceStatus.wsConnecting = true;
    state.deviceStatus.wsLastError = null;
    const ws = new WebSocket(wsUrl);
    state.ws = ws;

    ws.on("open", () => {
      state.deviceStatus.wsConnecting = false;
      state.deviceStatus.wsConnected = true;
      state.deviceStatus.wsLastConnectedAt = Date.now();
      state.deviceStatus.wsLastError = null;
      state.deviceStatus.online = true;
      state.deviceStatus.lastSeenAt = Date.now();
      if (state.pendingResults.length > 0) {
        const queue = [...state.pendingResults];
        state.pendingResults = [];
        for (const item of queue) {
          try {
            ws.send(JSON.stringify({ type: "inbound_result", ...item }));
          } catch (err) {
            state.pendingResults.unshift(item);
            state.deviceStatus.wsLastError = err instanceof Error ? err.message : String(err);
            break;
          }
        }
      }
    });

    ws.on("message", (data) => {
      state.deviceStatus.wsLastMessageAt = Date.now();
      state.deviceStatus.lastSeenAt = Date.now();
      let payload: unknown;
      try {
        payload = JSON.parse(String(data));
      } catch {
        return;
      }
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return;
      }
      const msg = payload as { type?: unknown; ts?: unknown };
      if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
        return;
      }
      if (msg.type === "inbound_message") {
        void handleInboundMessage(ws, payload as Record<string, unknown>);
      }
    });

    ws.on("close", () => {
      if (state.ws === ws) {
        state.ws = null;
      }
      state.deviceStatus.wsConnecting = false;
      state.deviceStatus.wsConnected = false;
      state.deviceStatus.online = false;
      if (!state.wsStopRequested) {
        scheduleReconnect();
      }
    });

    ws.on("error", (err) => {
      state.deviceStatus.wsLastError = err instanceof Error ? err.message : String(err);
    });
  };

  const syncDevice = async (cfg: WecomKfConfig, registerIfNeeded: boolean) => {
    const baseUrl = resolveServerBaseUrl(cfg);
    const deviceId = resolveDeviceId(cfg);
    state.localAgentId = cfg.localAgentId.trim() || "main";
    state.localAgentTimeoutMs = Math.max(30_000, Math.floor(cfg.localAgentTimeoutSeconds * 1000));

    state.deviceStatus.enabled = cfg.enabled;
    state.deviceStatus.deviceId = deviceId;
    state.deviceStatus.baseUrl = baseUrl;
    state.deviceStatus.polling = true;

    if (!cfg.enabled) {
      state.deviceStatus.polling = false;
      state.deviceStatus.lastError = "plugin disabled";
      closeDeviceSocket();
      return;
    }
    if (!baseUrl) {
      state.deviceStatus.polling = false;
      state.deviceStatus.lastError = "serverBaseUrl not configured";
      closeDeviceSocket();
      return;
    }

    if (registerIfNeeded || (!state.deviceStatus.isBound && !state.deviceStatus.shortCode)) {
      const registerPayload = await fetchJson("POST", `${baseUrl}/api/device/register`, {
        device_id: deviceId,
      });
      applyDeviceSnapshot(registerPayload, { baseUrl, deviceId });
    }

    const statusPayload = await fetchJson(
      "GET",
      `${baseUrl}/api/device/status?device_id=${encodeURIComponent(deviceId)}`,
    );
    applyDeviceSnapshot(statusPayload, { baseUrl, deviceId });

    if (!state.deviceStatus.connectToken) {
      const tokenPayload = await fetchJson(
        "GET",
        `${baseUrl}/api/device/connect-token?device_id=${encodeURIComponent(deviceId)}`,
      );
      state.deviceStatus.connectToken = decodeString(tokenPayload.connect_token);
    }

    if (state.deviceStatus.isBound) {
      await ensureDeviceSocketConnected();
    } else {
      closeDeviceSocket();
    }
  };

  const unbindDevice = async (cfg: WecomKfConfig) => {
    const baseUrl = resolveServerBaseUrl(cfg);
    const deviceId = resolveDeviceId(cfg);
    if (!cfg.enabled || !baseUrl) {
      throw new Error("wecom-kf not enabled or serverBaseUrl missing");
    }
    await fetchJson("POST", `${baseUrl}/api/device/unbind`, { device_id: deviceId });
    await syncDevice(cfg, true);
  };

  const pollDevice = async (
    loadConfig: () => Promise<WecomKfConfig>,
    registerIfNeeded: boolean,
  ) => {
    if (state.pollInFlight) {
      return;
    }
    state.pollInFlight = true;
    try {
      const cfg = await loadConfig();
      await syncDevice(cfg, registerIfNeeded);
    } catch (err) {
      state.deviceStatus.lastSyncAt = Date.now();
      state.deviceStatus.lastError = err instanceof Error ? err.message : String(err);
      params.logger.warn(`[wecom-kf] device sync failed: ${state.deviceStatus.lastError}`);
      scheduleReconnect();
    } finally {
      state.pollInFlight = false;
    }
  };

  return {
    async start(baseConfig: WecomKfConfig, overrides?: WecomKfStartParams) {
      const cfg = applyStartOverrides(baseConfig, overrides);
      state.wsStopRequested = false;
      const missing = missingRequiredFields(cfg);
      if (missing.length > 0) {
        state.lastError = `missing: ${missing.join(", ")}`;
        return status(cfg);
      }
      const portOk = await isPortAvailable(cfg.listenHost, cfg.listenPort);
      if (!portOk) {
        state.lastError = `port in use: ${cfg.listenHost}:${cfg.listenPort}`;
        return status(cfg);
      }
      startService(cfg);
      const tunnelUrl = resolveTunnelUrl(cfg);
      startTunnel(cfg, tunnelUrl);
      return status(cfg);
    },
    async stop(baseConfig: WecomKfConfig) {
      state.wsStopRequested = true;
      closeDeviceSocket();
      stopProcess(state.tunnel, "tunnel");
      stopProcess(state.service, "service");
      state.publicUrl = null;
      return status(baseConfig);
    },
    status(baseConfig: WecomKfConfig) {
      return status(baseConfig);
    },
    startDevicePolling(loadConfig: () => Promise<WecomKfConfig>) {
      if (state.pollTimer != null) {
        return;
      }
      state.wsStopRequested = false;
      void pollDevice(loadConfig, true);
      state.pollTimer = setInterval(() => {
        void pollDevice(loadConfig, false);
      }, DEVICE_STATUS_POLL_MS);
    },
    async syncDeviceNow(baseConfig: WecomKfConfig, registerIfNeeded = true) {
      await syncDevice(baseConfig, registerIfNeeded);
      return status(baseConfig);
    },
    async unbindDeviceNow(baseConfig: WecomKfConfig) {
      await unbindDevice(baseConfig);
      return status(baseConfig);
    },
  };
}

function resolveTunnelUrl(cfg: WecomKfConfig): string {
  const url = cfg.tunnel.url?.trim();
  const fallback = `http://${cfg.listenHost}:${cfg.listenPort}`;
  if (!url) {
    return fallback;
  }
  if (url === "http://127.0.0.1:8080" && fallback !== url) {
    return fallback;
  }
  return url;
}

async function isPortAvailable(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen({ host, port });
  });
}
