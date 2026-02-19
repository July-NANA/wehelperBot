import { html, nothing } from "lit";
import type { DiscordStatus } from "../types.ts";
import type { ChannelsProps } from "./channels.types.ts";
import { formatAgo } from "../format.ts";
import { t } from "../i18n.ts";
import { renderChannelConfigSection } from "./channels.config.ts";

export function renderDiscordCard(params: {
  props: ChannelsProps;
  discord?: DiscordStatus | null;
  accountCountLabel: unknown;
}) {
  const { props, discord, accountCountLabel } = params;

  return html`
    <div class="card">
      <div class="card-title">Discord</div>
      <div class="card-sub">${t("Bot status and channel configuration.", "机器人状态与通道配置。")}</div>
      ${accountCountLabel}

      <div class="status-list" style="margin-top: 16px;">
        <div>
          <span class="label">${t("Configured", "已配置")}</span>
          <span>${discord?.configured ? t("Yes", "是") : t("No", "否")}</span>
        </div>
        <div>
          <span class="label">${t("Running", "运行中")}</span>
          <span>${discord?.running ? t("Yes", "是") : t("No", "否")}</span>
        </div>
        <div>
          <span class="label">${t("Last start", "最近启动")}</span>
          <span>${discord?.lastStartAt ? formatAgo(discord.lastStartAt) : t("n/a", "暂无")}</span>
        </div>
        <div>
          <span class="label">${t("Last probe", "最近探测")}</span>
          <span>${discord?.lastProbeAt ? formatAgo(discord.lastProbeAt) : t("n/a", "暂无")}</span>
        </div>
      </div>

      ${
        discord?.lastError
          ? html`<div class="callout danger" style="margin-top: 12px;">
            ${discord.lastError}
          </div>`
          : nothing
      }

      ${
        discord?.probe
          ? html`<div class="callout" style="margin-top: 12px;">
            ${t("Probe", "探测")} ${discord.probe.ok ? t("ok", "成功") : t("failed", "失败")} ·
            ${discord.probe.status ?? ""} ${discord.probe.error ?? ""}
          </div>`
          : nothing
      }

      ${renderChannelConfigSection({ channelId: "discord", props })}

      <div class="row" style="margin-top: 12px;">
        <button class="btn" @click=${() => props.onRefresh(true)}>
          ${t("Probe", "探测")}
        </button>
      </div>
    </div>
  `;
}
