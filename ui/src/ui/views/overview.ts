import { html } from "lit";
import type { GatewayHelloOk } from "../gateway.ts";
import type { UiSettings } from "../storage.ts";
import { formatAgo, formatDurationMs } from "../format.ts";
import { t } from "../i18n.ts";
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
  const uptime = snapshot?.uptimeMs ? formatDurationMs(snapshot.uptimeMs) : t("n/a", "暂无");
  const tick = snapshot?.policy?.tickIntervalMs
    ? `${snapshot.policy.tickIntervalMs}ms`
    : t("n/a", "暂无");
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
          This gateway requires auth. Add a token or password, then click Connect.
          <div style="margin-top: 6px">
            <span class="mono">openclaw dashboard --no-open</span> → tokenized URL<br />
            <span class="mono">openclaw doctor --generate-gateway-token</span> → set token
          </div>
          <div style="margin-top: 6px">
            <a
              class="session-link"
              href="https://docs.openclaw.ai/web/dashboard"
              target="_blank"
              rel="noreferrer"
              title="Control UI auth docs (opens in new tab)"
              >Docs: Control UI auth</a
            >
          </div>
        </div>
      `;
    }
    return html`
      <div class="muted" style="margin-top: 8px">
        Auth failed. Re-copy a tokenized URL with
        <span class="mono">openclaw dashboard --no-open</span>, or update the token, then click Connect.
        <div style="margin-top: 6px">
          <a
            class="session-link"
            href="https://docs.openclaw.ai/web/dashboard"
            target="_blank"
            rel="noreferrer"
            title="Control UI auth docs (opens in new tab)"
            >Docs: Control UI auth</a
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
        This page is HTTP, so the browser blocks device identity. Use HTTPS (Tailscale Serve) or open
        <span class="mono">http://127.0.0.1:18789</span> on the gateway host.
        <div style="margin-top: 6px">
          If you must stay on HTTP, set
          <span class="mono">gateway.controlUi.allowInsecureAuth: true</span> (token-only).
        </div>
        <div style="margin-top: 6px">
          <a
            class="session-link"
            href="https://docs.openclaw.ai/gateway/tailscale"
            target="_blank"
            rel="noreferrer"
            title="Tailscale Serve docs (opens in new tab)"
            >Docs: Tailscale Serve</a
          >
          <span class="muted"> · </span>
          <a
            class="session-link"
            href="https://docs.openclaw.ai/web/control-ui#insecure-http"
            target="_blank"
            rel="noreferrer"
            title="Insecure HTTP docs (opens in new tab)"
            >Docs: Insecure HTTP</a
          >
        </div>
      </div>
    `;
  })();

  return html`
    <section class="grid grid-cols-2">
      <div class="card">
        <div class="card-title">Gateway Access</div>
        <div class="card-sub">Where the dashboard connects and how it authenticates.</div>
        <div class="form-grid" style="margin-top: 16px;">
          <label class="field">
            <span>WebSocket URL</span>
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
            <span>Gateway Token</span>
            <input
              .value=${props.settings.token}
              @input=${(e: Event) => {
                const v = (e.target as HTMLInputElement).value;
                props.onSettingsChange({ ...props.settings, token: v });
              }}
              placeholder="WEHELPER_GATEWAY_TOKEN"
            />
          </label>
          <label class="field">
            <span>${t("Password (not stored)", "密码（不保存）")}</span>
            <input
              type="password"
              .value=${props.password}
              @input=${(e: Event) => {
                const v = (e.target as HTMLInputElement).value;
                props.onPasswordChange(v);
              }}
              placeholder=${t("system or shared password", "系统密码或共享密码")}
            />
          </label>
          <label class="field">
            <span>${t("Default Session Key", "默认会话 Key")}</span>
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
          <button class="btn" @click=${() => props.onConnect()}>${t("Connect", "连接")}</button>
          <button class="btn" @click=${() => props.onRefresh()}>${t("Refresh", "刷新")}</button>
          <span class="muted">${t("Click Connect to apply connection changes.", "点击“连接”应用连接更改。")}</span>
        </div>
      </div>

      <div class="card">
        <div class="card-title">${t("Snapshot", "快照")}</div>
        <div class="card-sub">${t("Latest gateway handshake information.", "最新的网关握手信息。")}</div>
        <div class="stat-grid" style="margin-top: 16px;">
          <div class="stat">
            <div class="stat-label">${t("Status", "状态")}</div>
            <div class="stat-value ${props.connected ? "ok" : "warn"}">
              ${props.connected ? t("Connected", "已连接") : t("Disconnected", "未连接")}
            </div>
          </div>
          <div class="stat">
            <div class="stat-label">${t("Uptime", "运行时长")}</div>
            <div class="stat-value">${uptime}</div>
          </div>
          <div class="stat">
            <div class="stat-label">${t("Tick Interval", "心跳间隔")}</div>
            <div class="stat-value">${tick}</div>
          </div>
          <div class="stat">
            <div class="stat-label">${t("Last Channels Refresh", "通道最后刷新")}</div>
            <div class="stat-value">
              ${props.lastChannelsRefresh ? formatAgo(props.lastChannelsRefresh) : t("n/a", "暂无")}
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
                  ${t(
                    "Use Channels to link WhatsApp, Telegram, Discord, Signal, or iMessage.",
                    "使用“通道”连接 WhatsApp、Telegram、Discord、Signal 或 iMessage。",
                  )}
                </div>
              `
        }
      </div>
    </section>

    <section class="grid grid-cols-3" style="margin-top: 18px;">
      <div class="card stat-card">
        <div class="stat-label">${t("Instances", "实例")}</div>
        <div class="stat-value">${props.presenceCount}</div>
        <div class="muted">${t("Presence beacons in the last 5 minutes.", "最近 5 分钟的在线信标。")}</div>
      </div>
      <div class="card stat-card">
        <div class="stat-label">${t("Sessions", "会话")}</div>
        <div class="stat-value">${props.sessionsCount ?? t("n/a", "暂无")}</div>
        <div class="muted">${t("Recent session keys tracked by the gateway.", "网关追踪的最近会话。")}</div>
      </div>
      <div class="card stat-card">
        <div class="stat-label">${t("Cron", "定时任务")}</div>
        <div class="stat-value">
          ${
            props.cronEnabled == null
              ? t("n/a", "暂无")
              : props.cronEnabled
                ? t("Enabled", "已启用")
                : t("Disabled", "已禁用")
          }
        </div>
        <div class="muted">${t("Next wake", "下次唤醒")} ${formatNextRun(props.cronNext)}</div>
      </div>
    </section>

    <section class="card" style="margin-top: 18px;">
      <div class="card-title">${t("Notes", "提示")}</div>
      <div class="card-sub">${t("Quick reminders for remote control setups.", "远程控制的快速提醒。")}</div>
      <div class="note-grid" style="margin-top: 14px;">
        <div>
          <div class="note-title">${t("Tailscale serve", "Tailscale Serve")}</div>
          <div class="muted">
            ${t(
              "Prefer serve mode to keep the gateway on loopback with tailnet auth.",
              "建议使用 serve 模式保持网关在 loopback 并通过 tailnet 认证。",
            )}
          </div>
        </div>
        <div>
          <div class="note-title">${t("Session hygiene", "会话卫生")}</div>
          <div class="muted">${t("Use /new or sessions.patch to reset context.", "使用 /new 或 sessions.patch 重置上下文。")}</div>
        </div>
        <div>
          <div class="note-title">${t("Cron reminders", "定时提醒")}</div>
          <div class="muted">${t("Use isolated sessions for recurring runs.", "定时任务建议使用独立会话。")}</div>
        </div>
      </div>
    </section>
  `;
}
