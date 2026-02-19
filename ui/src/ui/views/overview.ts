import { html } from "lit";
import type { GatewayHelloOk } from "../gateway.ts";
import type { UiSettings } from "../storage.ts";
import { formatAgo, formatDurationMs } from "../format.ts";
import { tr } from "../i18n.ts";
import { formatNextRun } from "../presenter.ts";

export type OverviewProps = {
  connected: boolean;
  hello: GatewayHelloOk | null;
  settings: UiSettings;
  password: string;
  lastError: string | null;
  presenceCount: number;
  sessionsCount: number | null;
  cronEnabled: boolean | null;
  cronNext: number | null;
  lastChannelsRefresh: number | null;
  onSettingsChange: (next: UiSettings) => void;
  onPasswordChange: (next: string) => void;
  onSessionKeyChange: (next: string) => void;
  onConnect: () => void;
  onRefresh: () => void;
};

export function renderOverview(props: OverviewProps) {
  const snapshot = props.hello?.snapshot as
    | { uptimeMs?: number; policy?: { tickIntervalMs?: number } }
    | undefined;
  const uptime = snapshot?.uptimeMs ? formatDurationMs(snapshot.uptimeMs) : tr("common.na");
  const tick = snapshot?.policy?.tickIntervalMs
    ? `${snapshot.policy.tickIntervalMs}ms`
    : tr("common.na");
  const authHint = (() => {
    if (props.connected || !props.lastError) {
      return null;
    }
    const lower = props.lastError.toLowerCase();
    const authFailed = lower.includes("unauthorized") || lower.includes("connect failed");
    if (!authFailed) {
      return null;
    }
    const hasToken = Boolean(props.settings.token.trim());
    const hasPassword = Boolean(props.password.trim());
    if (!hasToken && !hasPassword) {
      return html`
        <div class="muted" style="margin-top: 8px">
          ${tr("overview.auth.required")}
          <div style="margin-top: 6px">
            <span class="mono">${tr("overview.auth.howToGetTokenizedUrl")}</span><br />
            <span class="mono">${tr("overview.auth.howToSetToken")}</span>
          </div>
          <div style="margin-top: 6px">
            <a
              class="session-link"
              href="https://docs.openclaw.ai/web/dashboard"
              target="_blank"
              rel="noreferrer"
              title=${tr("overview.auth.docs.openInNewTab")}
              >${tr("overview.auth.docs")}</a
            >
          </div>
        </div>
      `;
    }
    return html`
      <div class="muted" style="margin-top: 8px">
        ${tr("overview.auth.failed")}
        <span class="mono">openclaw dashboard --no-open</span>${tr("overview.auth.failed.suffix")}
        <div style="margin-top: 6px">
          <a
            class="session-link"
            href="https://docs.openclaw.ai/web/dashboard"
            target="_blank"
            rel="noreferrer"
            title=${tr("overview.auth.docs.openInNewTab")}
            >${tr("overview.auth.docs")}</a
          >
        </div>
      </div>
    `;
  })();
  const insecureContextHint = (() => {
    if (props.connected || !props.lastError) {
      return null;
    }
    const isSecureContext = typeof window !== "undefined" ? window.isSecureContext : true;
    if (isSecureContext) {
      return null;
    }
    const lower = props.lastError.toLowerCase();
    if (!lower.includes("secure context") && !lower.includes("device identity required")) {
      return null;
    }
    return html`
      <div class="muted" style="margin-top: 8px">
        ${tr("overview.http.insecure")}
        <span class="mono">http://127.0.0.1:18789</span> ${tr("overview.http.onGatewayHost")}
        <div style="margin-top: 6px">
          ${tr("overview.http.allowInsecure")}
          <span class="mono">${tr("gateway.controlUi.allowInsecureAuth: true", "gateway.controlUi.allowInsecureAuth: true")}</span>
          ${tr("overview.http.allowInsecure.suffix")}
        </div>
        <div style="margin-top: 6px">
          <a
            class="session-link"
            href="https://docs.openclaw.ai/gateway/tailscale"
            target="_blank"
            rel="noreferrer"
            title=${tr("overview.http.docs.tailscale.openInNewTab")}
            >${tr("overview.http.docs.tailscale")}</a
          >
          <span class="muted"> · </span>
          <a
            class="session-link"
            href="https://docs.openclaw.ai/web/control-ui#insecure-http"
            target="_blank"
            rel="noreferrer"
            title=${tr("overview.http.docs.insecure.openInNewTab")}
            >${tr("overview.http.docs.insecure")}</a
          >
        </div>
      </div>
    `;
  })();

  return html`
    <section class="grid grid-cols-2">
      <div class="card">
        <div class="card-title">${tr("overview.gatewayAccess.title")}</div>
        <div class="card-sub">${tr("overview.gatewayAccess.subtitle")}</div>
        <div class="form-grid" style="margin-top: 16px;">
          <label class="field">
            <span>${tr("overview.websocketUrl")}</span>
            <input
              .value=${props.settings.gatewayUrl}
              @input=${(e: Event) => {
                const v = (e.target as HTMLInputElement).value;
                props.onSettingsChange({ ...props.settings, gatewayUrl: v });
              }}
              placeholder="ws://100.x.y.z:18789"
            />
          </label>
          <label class="field">
            <span>${tr("overview.gatewayToken")}</span>
            <input
              .value=${props.settings.token}
              @input=${(e: Event) => {
                const v = (e.target as HTMLInputElement).value;
                props.onSettingsChange({ ...props.settings, token: v });
              }}
              placeholder="LINGSHI_GATEWAY_TOKEN"
            />
          </label>
          <label class="field">
            <span>${tr("overview.password")}</span>
            <input
              type="password"
              .value=${props.password}
              @input=${(e: Event) => {
                const v = (e.target as HTMLInputElement).value;
                props.onPasswordChange(v);
              }}
              placeholder=${tr("overview.password.placeholder")}
            />
          </label>
          <label class="field">
            <span>${tr("overview.defaultSessionKey")}</span>
            <input
              .value=${props.settings.sessionKey}
              @input=${(e: Event) => {
                const v = (e.target as HTMLInputElement).value;
                props.onSessionKeyChange(v);
              }}
            />
          </label>
        </div>
        <div class="row" style="margin-top: 14px;">
          <button class="btn" @click=${() => props.onConnect()}>${tr("common.connect")}</button>
          <button class="btn" @click=${() => props.onRefresh()}>${tr("common.refresh")}</button>
          <span class="muted">${tr("overview.connectHint")}</span>
        </div>
      </div>

      <div class="card">
        <div class="card-title">${tr("overview.snapshot.title")}</div>
        <div class="card-sub">${tr("overview.snapshot.subtitle")}</div>
        <div class="stat-grid" style="margin-top: 16px;">
          <div class="stat">
            <div class="stat-label">${tr("overview.status")}</div>
            <div class="stat-value ${props.connected ? "ok" : "warn"}">
              ${props.connected ? tr("overview.connected") : tr("overview.disconnected")}
            </div>
          </div>
          <div class="stat">
            <div class="stat-label">${tr("overview.uptime")}</div>
            <div class="stat-value">${uptime}</div>
          </div>
          <div class="stat">
            <div class="stat-label">${tr("overview.tickInterval")}</div>
            <div class="stat-value">${tick}</div>
          </div>
          <div class="stat">
            <div class="stat-label">${tr("overview.lastChannelsRefresh")}</div>
            <div class="stat-value">
              ${props.lastChannelsRefresh ? formatAgo(props.lastChannelsRefresh) : tr("common.na")}
            </div>
          </div>
        </div>
        ${
          props.lastError
            ? html`<div class="callout danger" style="margin-top: 14px;">
              <div>${props.lastError}</div>
              ${authHint ?? ""}
              ${insecureContextHint ?? ""}
            </div>`
            : html`
                <div class="callout" style="margin-top: 14px">
                  ${tr("overview.channelsHint")}
                </div>
              `
        }
      </div>
    </section>

    <section class="grid grid-cols-3" style="margin-top: 18px;">
      <div class="card stat-card">
        <div class="stat-label">${tr("overview.instances")}</div>
        <div class="stat-value">${props.presenceCount}</div>
        <div class="muted">${tr("overview.presenceHint")}</div>
      </div>
      <div class="card stat-card">
        <div class="stat-label">${tr("overview.sessions")}</div>
        <div class="stat-value">${props.sessionsCount ?? tr("common.na")}</div>
        <div class="muted">${tr("overview.sessionsHint")}</div>
      </div>
      <div class="card stat-card">
        <div class="stat-label">${tr("overview.cron")}</div>
        <div class="stat-value">
          ${
            props.cronEnabled == null
              ? tr("common.na")
              : props.cronEnabled
                ? tr("common.enabled")
                : tr("common.disabled")
          }
        </div>
        <div class="muted">${tr("overview.nextWake")} ${formatNextRun(props.cronNext)}</div>
      </div>
    </section>

    <section class="card" style="margin-top: 18px;">
      <div class="card-title">${tr("overview.notes")}</div>
      <div class="card-sub">${tr("overview.notes.subtitle")}</div>
      <div class="note-grid" style="margin-top: 14px;">
        <div>
          <div class="note-title">${tr("overview.notes.tailscale")}</div>
          <div class="muted">${tr("overview.notes.tailscaleHint")}</div>
        </div>
        <div>
          <div class="note-title">${tr("overview.notes.sessionHygiene")}</div>
          <div class="muted">${tr("overview.notes.sessionHygieneHint")}</div>
        </div>
        <div>
          <div class="note-title">${tr("overview.notes.cronReminders")}</div>
          <div class="muted">${tr("overview.notes.cronRemindersHint")}</div>
        </div>
      </div>
    </section>
  `;
}
