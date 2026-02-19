import { html, nothing } from "lit";
import type { WhatsAppStatus } from "../types.ts";
import type { ChannelsProps } from "./channels.types.ts";
import { formatAgo } from "../format.ts";
import { t } from "../i18n.ts";
import { renderChannelConfigSection } from "./channels.config.ts";
import { formatDuration } from "./channels.shared.ts";

export function renderWhatsAppCard(params: {
  props: ChannelsProps;
  whatsapp?: WhatsAppStatus;
  accountCountLabel: unknown;
}) {
  const { props, whatsapp, accountCountLabel } = params;

  return html`
    <div class="card">
      <div class="card-title">WhatsApp</div>
      <div class="card-sub">${t("Link WhatsApp Web and monitor connection health.", "连接 WhatsApp Web 并监控连接健康状态。")}</div>
      ${accountCountLabel}

      <div class="status-list" style="margin-top: 16px;">
        <div>
          <span class="label">${t("Configured", "已配置")}</span>
          <span>${whatsapp?.configured ? t("Yes", "是") : t("No", "否")}</span>
        </div>
        <div>
          <span class="label">${t("Linked", "已绑定")}</span>
          <span>${whatsapp?.linked ? t("Yes", "是") : t("No", "否")}</span>
        </div>
        <div>
          <span class="label">${t("Running", "运行中")}</span>
          <span>${whatsapp?.running ? t("Yes", "是") : t("No", "否")}</span>
        </div>
        <div>
          <span class="label">${t("Connected", "已连接")}</span>
          <span>${whatsapp?.connected ? t("Yes", "是") : t("No", "否")}</span>
        </div>
        <div>
          <span class="label">${t("Last connect", "最近连接")}</span>
          <span>
            ${whatsapp?.lastConnectedAt ? formatAgo(whatsapp.lastConnectedAt) : t("n/a", "暂无")}
          </span>
        </div>
        <div>
          <span class="label">${t("Last message", "最近消息")}</span>
          <span>
            ${whatsapp?.lastMessageAt ? formatAgo(whatsapp.lastMessageAt) : t("n/a", "暂无")}
          </span>
        </div>
        <div>
          <span class="label">${t("Auth age", "认证时长")}</span>
          <span>
            ${whatsapp?.authAgeMs != null ? formatDuration(whatsapp.authAgeMs) : t("n/a", "暂无")}
          </span>
        </div>
      </div>

      ${
        whatsapp?.lastError
          ? html`<div class="callout danger" style="margin-top: 12px;">
            ${whatsapp.lastError}
          </div>`
          : nothing
      }

      ${
        props.whatsappMessage
          ? html`<div class="callout" style="margin-top: 12px;">
            ${props.whatsappMessage}
          </div>`
          : nothing
      }

      ${
        props.whatsappQrDataUrl
          ? html`<div class="qr-wrap">
            <img src=${props.whatsappQrDataUrl} alt=${t("WhatsApp QR", "WhatsApp 二维码")} />
          </div>`
          : nothing
      }

      <div class="row" style="margin-top: 14px; flex-wrap: wrap;">
        <button
          class="btn primary"
          ?disabled=${props.whatsappBusy}
          @click=${() => props.onWhatsAppStart(false)}
        >
          ${props.whatsappBusy ? t("Working…", "处理中…") : t("Show QR", "显示二维码")}
        </button>
        <button
          class="btn"
          ?disabled=${props.whatsappBusy}
          @click=${() => props.onWhatsAppStart(true)}
        >
          ${t("Relink", "重新绑定")}
        </button>
        <button
          class="btn"
          ?disabled=${props.whatsappBusy}
          @click=${() => props.onWhatsAppWait()}
        >
          ${t("Wait for scan", "等待扫码")}
        </button>
        <button
          class="btn danger"
          ?disabled=${props.whatsappBusy}
          @click=${() => props.onWhatsAppLogout()}
        >
          ${t("Logout", "退出登录")}
        </button>
        <button class="btn" @click=${() => props.onRefresh(true)}>
          ${t("Refresh", "刷新")}
        </button>
      </div>

      ${renderChannelConfigSection({ channelId: "whatsapp", props })}
    </div>
  `;
}
