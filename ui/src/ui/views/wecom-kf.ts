import { html } from "lit";
import type { WecomKfStatus, WecomKfStartConfig } from "../controllers/wecom-kf.ts";
import { tr } from "../i18n.ts";

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
    ? tr("wecom.connection.connected")
    : wsConnecting
      ? tr("wecom.connection.connecting")
      : tr("wecom.connection.disconnected");
  const connectionDetail = routeOnline
    ? tr("wecom.connection.serverOnline")
    : tr("wecom.connection.serverOffline");

  return html`
    <section class="page">
      <div class="page-title">
        <div>
          <h1>${tr("wecom.title")}</h1>
          <p class="muted">
            ${tr("wecom.subtitle")}
          </p>
        </div>
        <div class="row" style="gap: 8px; flex-wrap: wrap;">
          <button class="btn" ?disabled=${props.loading} @click=${() => props.onRefresh()}>
            ${tr("common.refresh")}
          </button>
          <button class="btn" ?disabled=${props.loading} @click=${() => props.onConfigSave()}>
            ${props.configDirty ? tr("common.saveConfig") : tr("common.configSaved")}
          </button>
        </div>
      </div>

      <div class="card" style="margin-top: 16px;">
        <h2>${tr("wecom.gatewayMapping")}</h2>
        <div class="row" style="gap: 16px; flex-wrap: wrap;">
          <label class="field" style="min-width: 260px; flex: 1;">
            <span>LINGSHI_SERVER_BASE_URL</span>
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
            <span>LINGSHI_DEVICE_ID</span>
            <input
              class="input"
              .value=${deviceId}
              placeholder=${tr("wecom.deviceIdPlaceholder")}
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
                ${tr("wecom.deviceIdLocked")}
              </div>`
            : ""
        }
        <div class="row" style="gap: 16px; flex-wrap: wrap; margin-top: 12px;">
          <label class="field" style="min-width: 260px; flex: 1;">
            <span>${tr("wecom.onlyProcessNewMessages")}</span>
            <label class="toggle">
              <input
                type="checkbox"
                .checked=${skipHistory}
                @change=${(ev: Event) =>
                  props.onSkipHistoryChange((ev.target as HTMLInputElement).checked)}
              />
              <span>${skipHistory ? tr("common.enabled") : tr("common.disabled")}</span>
            </label>
          </label>
        </div>
      </div>

      <div class="card" style="margin-top: 16px;">
        <h2>${tr("wecom.serviceControl")}</h2>
        <div class="row" style="gap: 8px; flex-wrap: wrap;">
          <button
            class="btn"
            ?disabled=${props.busy || !props.connected}
            @click=${() => props.onStart(startConfig)}
          >
            ${tr("common.start")}
          </button>
          <button class="btn" ?disabled=${props.busy} @click=${() => props.onStop()}>
            ${tr("common.stop")}
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
                ${tr("wecom.missing")} ${missing.join(", ")}
              </div>`
            : ""
        }
      </div>

      <div class="card" style="margin-top: 16px;">
        <h2>${tr("wecom.bindingLinkState")}</h2>
        <div class="muted">
          ${tr("wecom.service")}: ${status?.running ? tr("wecom.running") : tr("wecom.stopped")}
          <br />
          ${tr("wecom.tunnel")}: ${
            status?.tunnelRunning ? tr("wecom.running") : tr("wecom.stopped")
          }
        </div>
        <div style="margin-top: 8px;">
          <div>${tr("wecom.publicUrl")}: <span class="mono">${publicUrl || "-"}</span></div>
          <div style="margin-top: 6px;">
            ${tr("wecom.callbackUrl")}: <span class="mono">${callbackUrl || "-"}</span>
          </div>
        </div>
        <div style="margin-top: 10px;">
          <div>${tr("wecom.deviceId")}: <span class="mono">${device?.deviceId || "-"}</span></div>
          <div style="margin-top: 6px;">
            ${tr("wecom.bindState")}: ${device?.isBound ? tr("wecom.bound") : tr("wecom.unbound")}
          </div>
          <div style="margin-top: 6px;">
            ${tr("wecom.connection")}: ${connectionLabel}
            <span class="muted">(${connectionDetail})</span>
          </div>
          <div style="margin-top: 6px;">
            ${tr("wecom.shortCode")}: <span class="mono">${device?.shortCode || "-"}</span>
          </div>
          <div style="margin-top: 6px;">
            ${tr("wecom.codeCountdown")}: ${formatDuration(device?.expiresInSeconds)}
          </div>
          <div style="margin-top: 6px;">
            ${tr("wecom.lastSeen")}: ${formatTs(device?.lastSeenAt)}
          </div>
          <div style="margin-top: 6px;">
            ${tr("wecom.wsLastConnected")}: ${formatTs(device?.wsLastConnectedAt)}
          </div>
          <div style="margin-top: 6px;">
            ${tr("wecom.boundUser")}: ${device?.binding?.externalUserid || "-"}
          </div>
        </div>
        <div class="row" style="gap: 8px; flex-wrap: wrap; margin-top: 12px;">
          <button class="btn" ?disabled=${props.busy || !device?.isBound} @click=${() => props.onUnbind()}>
            ${tr("wecom.unbind")}
          </button>
          <button class="btn" ?disabled=${props.loading} @click=${() => props.onRefresh()}>
            ${tr("wecom.refreshState")}
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
