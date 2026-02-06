import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
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
};

type RuntimeParams = {
  logger: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
  stateDir: string;
  wehelperDir: string;
};

type RuntimeState = {
  service: ChildProcessWithoutNullStreams | null;
  tunnel: ChildProcessWithoutNullStreams | null;
  publicUrl: string | null;
  lastError: string | null;
};

const TRY_CLOUDFLARE_RE = /https:\/\/[\w-]+\.trycloudflare\.com/;

export function createWecomKfRuntime(params: RuntimeParams) {
  const state: RuntimeState = {
    service: null,
    tunnel: null,
    publicUrl: null,
    lastError: null,
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

  return {
    async start(baseConfig: WecomKfConfig, overrides?: WecomKfStartParams) {
      const cfg = applyStartOverrides(baseConfig, overrides);
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
      stopProcess(state.tunnel, "tunnel");
      stopProcess(state.service, "service");
      state.publicUrl = null;
      return status(baseConfig);
    },
    status(baseConfig: WecomKfConfig) {
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
