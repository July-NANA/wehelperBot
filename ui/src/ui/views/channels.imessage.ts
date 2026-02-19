import { html, nothing } from "lit";
import type { IMessageStatus } from "../types.ts";
import type { ChannelsProps } from "./channels.types.ts";
import { formatAgo } from "../format.ts";
import { t } from "../i18n.ts";
import { renderChannelConfigSection } from "./channels.config.ts";

export function renderIMessageCard(params: {
  props: ChannelsProps;
  imessage?: IMessageStatus | null;
  accountCountLabel: unknown;
}) {
  const { props, imessage, accountCountLabel } = params;

  return html`
    <div class="card">
      <div class="card-title">iMessage</div>
      <div class="card-sub">${t("macOS bridge status and channel configuration.", "macOS 桥接状态与通道配置。")}</div>
      ${accountCountLabel}

      <div class="status-list" style="margin-top: 16px;">
        <div>
          <span class="label">${t("Configured", "已配置")}</span>
          <span>${imessage?.configured ? t("Yes", "是") : t("No", "否")}</span>
        </div>
        <div>
          <span class="label">${t("Running", "运行中")}</span>
          <span>${imessage?.running ? t("Yes", "是") : t("No", "否")}</span>
        </div>
        <div>
          <span class="label">${t("Last start", "最近启动")}</span>
          <span>${imessage?.lastStartAt ? formatAgo(imessage.lastStartAt) : t("n/a", "暂无")}</span>
        </div>
        <div>
          <span class="label">${t("Last probe", "最近探测")}</span>
          <span>${imessage?.lastProbeAt ? formatAgo(imessage.lastProbeAt) : t("n/a", "暂无")}</span>
        </div>
      </div>

      ${
        imessage?.lastError
          ? html`<div class="callout danger" style="margin-top: 12px;">
            ${imessage.lastError}
          </div>`
          : nothing
      }

      ${
        imessage?.probe
          ? html`<div class="callout" style="margin-top: 12px;">
            ${t("Probe", "探测")} ${imessage.probe.ok ? t("ok", "成功") : t("failed", "失败")} ·
            ${imessage.probe.error ?? ""}
          </div>`
          : nothing
      }

      ${renderChannelConfigSection({ channelId: "imessage", props })}

      <div class="row" style="margin-top: 12px;">
        <button class="btn" @click=${() => props.onRefresh(true)}>
          ${t("Probe", "探测")}
        </button>
      </div>
    </div>
  `;
}
