export type WecomKfTunnelConfig = {
  autoStart: boolean;
  provider: "cloudflared";
  bin: string;
  url: string;
  protocol: string;
  loglevel: string;
};

export type WecomKfConfig = {
  enabled: boolean;
  serverBaseUrl: string;
  deviceId: string;
  localAgentId: string;
  localAgentTimeoutSeconds: number;
  corpId: string;
  token: string;
  aesKey: string;
  secret: string;
  skipHistory: boolean;
  listenHost: string;
  listenPort: number;
  sessionMapPath: string;
  tunnel: WecomKfTunnelConfig;
};

export type WecomKfStartParams = {
  serverBaseUrl?: string;
  deviceId?: string;
  localAgentId?: string;
  localAgentTimeoutSeconds?: number;
  corpId?: string;
  token?: string;
  aesKey?: string;
  secret?: string;
  skipHistory?: boolean;
  listenHost?: string;
  listenPort?: number;
  sessionMapPath?: string;
  tunnel?: Partial<WecomKfTunnelConfig>;
};

const DEFAULT_TUNNEL: WecomKfTunnelConfig = {
  autoStart: true,
  provider: "cloudflared",
  bin: "cloudflared",
  url: "http://127.0.0.1:8080",
  protocol: "http2",
  loglevel: "info",
};

const DEFAULTS: WecomKfConfig = {
  enabled: true,
  serverBaseUrl: "",
  deviceId: "",
  localAgentId: "main",
  localAgentTimeoutSeconds: 180,
  corpId: "",
  token: "",
  aesKey: "",
  secret: "",
  skipHistory: false,
  listenHost: "127.0.0.1",
  listenPort: 8080,
  sessionMapPath: "",
  tunnel: DEFAULT_TUNNEL,
};

function toString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function toNumber(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function resolveTunnel(input: unknown): WecomKfTunnelConfig {
  const raw =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  return {
    autoStart: toBoolean(raw.autoStart, DEFAULT_TUNNEL.autoStart),
    provider: "cloudflared",
    bin: toString(raw.bin) || DEFAULT_TUNNEL.bin,
    url: toString(raw.url) || DEFAULT_TUNNEL.url,
    protocol: toString(raw.protocol) || DEFAULT_TUNNEL.protocol,
    loglevel: toString(raw.loglevel) || DEFAULT_TUNNEL.loglevel,
  };
}

export function resolveWecomKfConfig(value: unknown): WecomKfConfig {
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const listenHost = toString(raw.listenHost) || DEFAULTS.listenHost;
  const listenPort = toNumber(raw.listenPort, DEFAULTS.listenPort);

  return {
    enabled: toBoolean(raw.enabled, DEFAULTS.enabled),
    serverBaseUrl: toString(raw.serverBaseUrl),
    deviceId: toString(raw.deviceId),
    localAgentId: toString(raw.localAgentId) || DEFAULTS.localAgentId,
    localAgentTimeoutSeconds: toNumber(
      raw.localAgentTimeoutSeconds,
      DEFAULTS.localAgentTimeoutSeconds,
    ),
    corpId: toString(raw.corpId),
    token: toString(raw.token),
    aesKey: toString(raw.aesKey),
    secret: toString(raw.secret),
    skipHistory: toBoolean(raw.skipHistory, DEFAULTS.skipHistory),
    listenHost,
    listenPort,
    sessionMapPath: toString(raw.sessionMapPath),
    tunnel: resolveTunnel(raw.tunnel),
  };
}

export function applyStartOverrides(
  base: WecomKfConfig,
  overrides?: WecomKfStartParams,
): WecomKfConfig {
  if (!overrides) {
    return base;
  }
  const tunnel = overrides.tunnel ? { ...base.tunnel, ...overrides.tunnel } : base.tunnel;
  return {
    ...base,
    serverBaseUrl: overrides.serverBaseUrl?.trim() ?? base.serverBaseUrl,
    deviceId: overrides.deviceId?.trim() ?? base.deviceId,
    localAgentId: overrides.localAgentId?.trim() ?? base.localAgentId,
    localAgentTimeoutSeconds: overrides.localAgentTimeoutSeconds ?? base.localAgentTimeoutSeconds,
    corpId: overrides.corpId?.trim() ?? base.corpId,
    token: overrides.token?.trim() ?? base.token,
    aesKey: overrides.aesKey?.trim() ?? base.aesKey,
    secret: overrides.secret?.trim() ?? base.secret,
    skipHistory: overrides.skipHistory ?? base.skipHistory,
    listenHost: overrides.listenHost?.trim() ?? base.listenHost,
    listenPort: overrides.listenPort ?? base.listenPort,
    sessionMapPath: overrides.sessionMapPath?.trim() ?? base.sessionMapPath,
    tunnel,
  };
}

export function missingRequiredFields(cfg: WecomKfConfig): string[] {
  const missing: string[] = [];
  if (!cfg.corpId) missing.push("WE_COM_KF_CORP_ID");
  if (!cfg.token) missing.push("WE_COM_KF_TOKEN");
  if (!cfg.aesKey) missing.push("WE_COM_KF_AES_KEY");
  if (!cfg.secret) missing.push("WE_COM_KF_SECRET");
  return missing;
}
