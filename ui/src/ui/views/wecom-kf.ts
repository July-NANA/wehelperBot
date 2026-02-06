import { html } from "lit";
import type { WecomKfStatus, WecomKfStartConfig } from "../controllers/wecom-kf.ts";
import { t } from "../i18n.ts";

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

export function renderWecomKf(props: WecomKfProps) {
  const cfg = getConfigSection(props.configForm);
  const corpId = getString(cfg, "corpId");
  const token = getString(cfg, "token");
  const aesKey = getString(cfg, "aesKey");
  const secret = getString(cfg, "secret");
  const skipHistory = props.skipHistory;
  const listenHost = getString(cfg, "listenHost") || "127.0.0.1";
  const listenPort = getNumber(cfg, "listenPort", 8080);

  const status = props.status;
  const publicUrl = status?.publicUrl ?? "";
  const callbackUrl = status?.callbackUrl ?? "";
  const missing = status?.missing ?? [];

  const startConfig: WecomKfStartConfig = {
    corpId,
    token,
    aesKey,
    secret,
    skipHistory,
    listenHost,
    listenPort,
  };

  return html`
    <section class="page">
      <div class="page-title">
        <div>
          <h1>${t("WeCom KF Integration", "微信客服集成")}</h1>
          <p class="muted">
            ${t(
              "Fill the four WeCom variables, start the callback service, and copy the public URL.",
              "填写四个变量，启动回调服务并复制公网地址。",
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
        <h2>${t("WeCom Variables", "微信客服变量")}</h2>
        <div class="row" style="gap: 16px; flex-wrap: wrap;">
          <label class="field" style="min-width: 260px; flex: 1;">
            <span>WE_COM_KF_CORP_ID</span>
            <input
              class="input"
              .value=${corpId}
              @input=${(ev: Event) =>
                props.onConfigPatch(
                  ["plugins", "entries", "wecom-kf", "config", "corpId"],
                  (ev.target as HTMLInputElement).value,
                )}
            />
          </label>
          <label class="field" style="min-width: 260px; flex: 1;">
            <span>WE_COM_KF_TOKEN</span>
            <input
              class="input"
              type="password"
              .value=${token}
              @input=${(ev: Event) =>
                props.onConfigPatch(
                  ["plugins", "entries", "wecom-kf", "config", "token"],
                  (ev.target as HTMLInputElement).value,
                )}
            />
          </label>
        </div>
        <div class="row" style="gap: 16px; flex-wrap: wrap; margin-top: 12px;">
          <label class="field" style="min-width: 260px; flex: 1;">
            <span>WE_COM_KF_AES_KEY</span>
            <input
              class="input"
              type="password"
              .value=${aesKey}
              @input=${(ev: Event) =>
                props.onConfigPatch(
                  ["plugins", "entries", "wecom-kf", "config", "aesKey"],
                  (ev.target as HTMLInputElement).value,
                )}
            />
          </label>
          <label class="field" style="min-width: 260px; flex: 1;">
            <span>WE_COM_KF_SECRET</span>
            <input
              class="input"
              type="password"
              .value=${secret}
              @input=${(ev: Event) =>
                props.onConfigPatch(
                  ["plugins", "entries", "wecom-kf", "config", "secret"],
                  (ev.target as HTMLInputElement).value,
                )}
            />
          </label>
        </div>
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
        <h2>${t("Status", "状态")}</h2>
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
        ${
          status?.lastError
            ? html`<div class="callout warn" style="margin-top: 10px;">${status.lastError}</div>`
            : ""
        }
      </div>
    </section>
  `;
}
