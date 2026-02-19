import { html, nothing } from "lit";
import type { GoogleChatStatus } from "../types.ts";
import type { ChannelsProps } from "./channels.types.ts";
import { formatAgo } from "../format.ts";
import { t } from "../i18n.ts";
import { renderChannelConfigSection } from "./channels.config.ts";

export function renderGoogleChatCard(params: {
  props: ChannelsProps;
  googleChat?: GoogleChatStatus | null;
  accountCountLabel: unknown;
}) {
  const { props, googleChat, accountCountLabel } = params;

  return html`
    <div class="card">
      <div class="card-title">Google Chat</div>
      <div class="card-sub">${t("Chat API webhook status and channel configuration.", "Chat API Webhook 状态与通道配置。")}</div>
      ${accountCountLabel}

      <div class="status-list" style="margin-top: 16px;">
        <div>
          <span class="label">${t("Configured", "已配置")}</span>
          <span>${googleChat ? (googleChat.configured ? t("Yes", "是") : t("No", "否")) : t("n/a", "暂无")}</span>
        </div>
        <div>
          <span class="label">${t("Running", "运行中")}</span>
          <span>${googleChat ? (googleChat.running ? t("Yes", "是") : t("No", "否")) : t("n/a", "暂无")}</span>
        </div>
        <div>
          <span class="label">${t("Credential", "凭据")}</span>
          <span>${googleChat?.credentialSource ?? t("n/a", "暂无")}</span>
        </div>
        <div>
          <span class="label">${t("Audience", "受众")}</span>
          <span>
            ${
              googleChat?.audienceType
                ? `${googleChat.audienceType}${googleChat.audience ? ` · ${googleChat.audience}` : ""}`
                : t("n/a", "暂无")
            }
          </span>
        </div>
        <div>
          <span class="label">${t("Last start", "最近启动")}</span>
          <span>${googleChat?.lastStartAt ? formatAgo(googleChat.lastStartAt) : t("n/a", "暂无")}</span>
        </div>
        <div>
          <span class="label">${t("Last probe", "最近探测")}</span>
          <span>${googleChat?.lastProbeAt ? formatAgo(googleChat.lastProbeAt) : t("n/a", "暂无")}</span>
        </div>
      </div>

      ${
        googleChat?.lastError
          ? html`<div class="callout danger" style="margin-top: 12px;">
            ${googleChat.lastError}
          </div>`
          : nothing
      }

      ${
        googleChat?.probe
          ? html`<div class="callout" style="margin-top: 12px;">
            ${t("Probe", "探测")} ${googleChat.probe.ok ? t("ok", "成功") : t("failed", "失败")} ·
            ${googleChat.probe.status ?? ""} ${googleChat.probe.error ?? ""}
          </div>`
          : nothing
      }

      ${renderChannelConfigSection({ channelId: "googlechat", props })}

      <div class="row" style="margin-top: 12px;">
        <button class="btn" @click=${() => props.onRefresh(true)}>
          ${t("Probe", "探测")}
        </button>
      </div>
    </div>
  `;
}
