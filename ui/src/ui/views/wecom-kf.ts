import { html } from "lit";
import type { WecomKfStatus, WecomKfStartConfig } from "../controllers/wecom-kf.ts";
import { t } from "../i18n.ts";

const DEFAULT_SERVER_BASE_URL = "http://8.148.182.238:8080";

export type WecomKfProps = {
  connected: boolean;
  loading: boolean;
  busy: boolean;
  error: string | null;
  status: WecomKfStatus | null;
  configForm: Record<string, unknown> | null;
  configDirty: boolean;
  skipHistory: boolean;
  onSkipHistoryChange: (next: boolean) => void;
  onConfigPatch: (path: Array<string | number>, value: unknown) => void;
  onConfigSave: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onStart: (config: WecomKfStartConfig) => Promise<void>;
  onStop: () => Promise<void>;
  onUnbind: () => Promise<void>;
  deviceIdLocked: boolean;
};

function getConfigSection(form: Record<string, unknown> | null): Record<string, unknown> {
  if (!form) return {};
  const plugins = form.plugins as Record<string, unknown> | undefined;
  const entries = plugins?.entries as Record<string, unknown> | undefined;
  const wecomEntry = entries?.["wecom-kf"] as Record<string, unknown> | undefined;
  const config = wecomEntry?.config as Record<string, unknown> | undefined;
  return config ?? {};
}

function getString(cfg: Record<string, unknown>, key: string): string {
  const val = cfg[key];
  return typeof val === "string" ? val : "";
}

function getNumber(cfg: Record<string, unknown>, key: string, fallback: number): number {
  const val = cfg[key];
  return typeof val === "number" && Number.isFinite(val) ? val : fallback;
}

function formatDuration(seconds: number | null | undefined): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) {
    return "-";
  }
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function formatTs(msOrSec: number | null | undefined): string {
  if (typeof msOrSec !== "number" || !Number.isFinite(msOrSec) || msOrSec <= 0) {
    return "-";
  }
  const ms = msOrSec > 10_000_000_000 ? msOrSec : msOrSec * 1000;
  return new Date(ms).toLocaleString();
}

export function renderWecomKf(props: WecomKfProps) {
  const cfg = getConfigSection(props.configForm);
  const serverBaseUrl = getString(cfg, "serverBaseUrl") || DEFAULT_SERVER_BASE_URL;
  const deviceId = getString(cfg, "deviceId");
  const skipHistory = props.skipHistory;
  const listenHost = getString(cfg, "listenHost") || "127.0.0.1";
  const listenPort = getNumber(cfg, "listenPort", 8080);

  const status = props.status;
  const publicUrl = status?.publicUrl ?? "";
  const callbackUrl = status?.callbackUrl ?? "";
  const missing = status?.missing ?? [];
  const device = status?.device ?? null;
  const deviceIdLocked = props.deviceIdLocked;

  const startConfig: WecomKfStartConfig = {
    serverBaseUrl,
    deviceId,
    skipHistory,
    listenHost,
    listenPort,
  };

  const wsConnected = device?.wsConnected === true;
  const wsConnecting = device?.wsConnecting === true;
  const routeOnline = device?.online === true;
  const connectionLabel = wsConnected
    ? t("Connected", "已连接")
    : wsConnecting
      ? t("Connecting", "连接中")
      : t("Disconnected", "未连接");
  const connectionDetail = routeOnline
    ? t("Server marks device online", "服务端判定设备在线")
    : t("Server marks device offline", "服务端判定设备离线");

  return html`
    <section class="page">
      <div class="page-title">
        <div>
          <h1>${t("WeCom KF Integration", "微信客服集成")}</h1>
          <p class="muted">
            ${t(
              "Configure server URL and monitor binding state via short code.",
              "配置服务端地址，并通过短码监控绑定状态。",
            )}
          </p>
        </div>
        <div class="row" style="gap: 8px; flex-wrap: wrap;">
          <button class="btn" ?disabled=${props.loading} @click=${() => props.onRefresh()}>
            ${t("Refresh", "刷新")}
          </button>
          <button class="btn" ?disabled=${props.loading} @click=${() => props.onConfigSave()}>
            ${props.configDirty ? t("Save Config", "保存配置") : t("Config Saved", "配置已保存")}
          </button>
        </div>
      </div>

      <div class="card" style="margin-top: 16px;">
        <h2>${t("Gateway Mapping", "网关映射配置")}</h2>
        <div class="row" style="gap: 16px; flex-wrap: wrap;">
          <label class="field" style="min-width: 260px; flex: 1;">
            <span>WEHELPER_SERVER_BASE_URL</span>
            <input
              class="input"
              .value=${serverBaseUrl}
              placeholder="http://8.148.182.238:8080"
              @input=${(ev: Event) =>
                props.onConfigPatch(
                  ["plugins", "entries", "wecom-kf", "config", "serverBaseUrl"],
                  (ev.target as HTMLInputElement).value,
                )}
            />
          </label>
          <label class="field" style="min-width: 260px; flex: 1;">
            <span>WEHELPER_DEVICE_ID</span>
            <input
              class="input"
              .value=${deviceId}
              placeholder="bot-001 (optional)"
              ?disabled=${deviceIdLocked}
              @input=${(ev: Event) =>
                props.onConfigPatch(
                  ["plugins", "entries", "wecom-kf", "config", "deviceId"],
                  (ev.target as HTMLInputElement).value,
                )}
            />
          </label>
        </div>
        ${
          deviceIdLocked
            ? html`<div class="callout warn" style="margin-top: 10px;">
                ${t(
                  "Device ID is locked while bound. Unbind first, then rename.",
                  "设备已绑定时设备名不可修改。请先解绑，再修改设备名。",
                )}
              </div>`
            : ""
        }
        <div class="row" style="gap: 16px; flex-wrap: wrap; margin-top: 12px;">
          <label class="field" style="min-width: 260px; flex: 1;">
            <span>${t("Only Process New Messages", "只处理最新消息")}</span>
            <label class="toggle">
              <input
                type="checkbox"
                .checked=${skipHistory}
                @change=${(ev: Event) =>
                  props.onSkipHistoryChange((ev.target as HTMLInputElement).checked)}
              />
              <span>${skipHistory ? t("Enabled", "已开启") : t("Disabled", "未开启")}</span>
            </label>
          </label>
        </div>
      </div>

      <div class="card" style="margin-top: 16px;">
        <h2>${t("Service Control", "服务控制")}</h2>
        <div class="row" style="gap: 8px; flex-wrap: wrap;">
          <button
            class="btn"
            ?disabled=${props.busy || !props.connected}
            @click=${() => props.onStart(startConfig)}
          >
            ${t("Start", "启动")}
          </button>
          <button class="btn" ?disabled=${props.busy} @click=${() => props.onStop()}>
            ${t("Stop", "停止")}
          </button>
        </div>
        ${
          props.error
            ? html`<div class="callout danger" style="margin-top: 10px;">${props.error}</div>`
            : ""
        }
        ${
          missing.length > 0
            ? html`<div class="callout warn" style="margin-top: 10px;">
                ${t("Missing:", "缺少：")} ${missing.join(", ")}
              </div>`
            : ""
        }
      </div>

      <div class="card" style="margin-top: 16px;">
        <h2>${t("Binding & Link State", "绑定与连接状态")}</h2>
        <div class="muted">
          ${t("Service", "服务")}: ${status?.running ? t("Running", "运行中") : t("Stopped", "已停止")}
          <br />
          ${t("Tunnel", "隧道")}: ${
            status?.tunnelRunning ? t("Running", "运行中") : t("Stopped", "已停止")
          }
        </div>
        <div style="margin-top: 8px;">
          <div>${t("Public URL", "公网地址")}: <span class="mono">${publicUrl || "-"}</span></div>
          <div style="margin-top: 6px;">
            ${t("Callback URL", "回调地址")}: <span class="mono">${callbackUrl || "-"}</span>
          </div>
        </div>
        <div style="margin-top: 10px;">
          <div>${t("Device ID", "设备ID")}: <span class="mono">${device?.deviceId || "-"}</span></div>
          <div style="margin-top: 6px;">
            ${t("Bind State", "绑定状态")}: ${
              device?.isBound ? t("Bound", "已绑定") : t("Unbound", "未绑定")
            }
          </div>
          <div style="margin-top: 6px;">
            ${t("Connection", "连接状态")}: ${connectionLabel}
            <span class="muted">(${connectionDetail})</span>
          </div>
          <div style="margin-top: 6px;">
            ${t("Short Code", "短码")}: <span class="mono">${device?.shortCode || "-"}</span>
          </div>
          <div style="margin-top: 6px;">
            ${t("Code Countdown", "短码倒计时")}: ${formatDuration(device?.expiresInSeconds)}
          </div>
          <div style="margin-top: 6px;">
            ${t("Last Seen", "最近在线")}: ${formatTs(device?.lastSeenAt)}
          </div>
          <div style="margin-top: 6px;">
            ${t("WS Last Connected", "WS最近连接")}: ${formatTs(device?.wsLastConnectedAt)}
          </div>
          <div style="margin-top: 6px;">
            ${t("Bound User", "绑定用户")}: ${device?.binding?.externalUserid || "-"}
          </div>
        </div>
        <div class="row" style="gap: 8px; flex-wrap: wrap; margin-top: 12px;">
          <button class="btn" ?disabled=${props.busy || !device?.isBound} @click=${() => props.onUnbind()}>
            ${t("Unbind", "解绑")}
          </button>
          <button class="btn" ?disabled=${props.loading} @click=${() => props.onRefresh()}>
            ${t("Refresh State", "刷新状态")}
          </button>
        </div>
        ${
          device?.lastError
            ? html`<div class="callout warn" style="margin-top: 10px;">${device.lastError}</div>`
            : ""
        }
        ${
          status?.lastError
            ? html`<div class="callout warn" style="margin-top: 10px;">${status.lastError}</div>`
            : ""
        }
      </div>
    </section>
  `;
}
