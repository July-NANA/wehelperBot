import { html, nothing } from "lit";
import type { SlackStatus } from "../types.ts";
import type { ChannelsProps } from "./channels.types.ts";
import { formatAgo } from "../format.ts";
import { t } from "../i18n.ts";
import { renderChannelConfigSection } from "./channels.config.ts";

export function renderSlackCard(params: {
  props: ChannelsProps;
  slack?: SlackStatus | null;
  accountCountLabel: unknown;
}) {
  const { props, slack, accountCountLabel } = params;

  return html`
    <div class="card">
      <div class="card-title">Slack</div>
      <div class="card-sub">${t("Socket mode status and channel configuration.", "Socket 模式状态与通道配置。")}</div>
      ${accountCountLabel}

      <div class="status-list" style="margin-top: 16px;">
        <div>
          <span class="label">${t("Configured", "已配置")}</span>
          <span>${slack?.configured ? t("Yes", "是") : t("No", "否")}</span>
        </div>
        <div>
          <span class="label">${t("Running", "运行中")}</span>
          <span>${slack?.running ? t("Yes", "是") : t("No", "否")}</span>
        </div>
        <div>
          <span class="label">${t("Last start", "最近启动")}</span>
          <span>${slack?.lastStartAt ? formatAgo(slack.lastStartAt) : t("n/a", "暂无")}</span>
        </div>
        <div>
          <span class="label">${t("Last probe", "最近探测")}</span>
          <span>${slack?.lastProbeAt ? formatAgo(slack.lastProbeAt) : t("n/a", "暂无")}</span>
        </div>
      </div>

      ${
        slack?.lastError
          ? html`<div class="callout danger" style="margin-top: 12px;">
            ${slack.lastError}
          </div>`
          : nothing
      }

      ${
        slack?.probe
          ? html`<div class="callout" style="margin-top: 12px;">
            ${t("Probe", "探测")} ${slack.probe.ok ? t("ok", "成功") : t("failed", "失败")} ·
            ${slack.probe.status ?? ""} ${slack.probe.error ?? ""}
          </div>`
          : nothing
      }

      ${renderChannelConfigSection({ channelId: "slack", props })}

      <div class="row" style="margin-top: 12px;">
        <button class="btn" @click=${() => props.onRefresh(true)}>
          ${t("Probe", "探测")}
        </button>
      </div>
    </div>
  `;
}
