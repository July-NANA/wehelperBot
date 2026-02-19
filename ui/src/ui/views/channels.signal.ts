import { html, nothing } from "lit";
import type { SignalStatus } from "../types.ts";
import type { ChannelsProps } from "./channels.types.ts";
import { formatAgo } from "../format.ts";
import { t } from "../i18n.ts";
import { renderChannelConfigSection } from "./channels.config.ts";

export function renderSignalCard(params: {
  props: ChannelsProps;
  signal?: SignalStatus | null;
  accountCountLabel: unknown;
}) {
  const { props, signal, accountCountLabel } = params;

  return html`
    <div class="card">
      <div class="card-title">Signal</div>
      <div class="card-sub">${t("signal-cli status and channel configuration.", "signal-cli 状态与通道配置。")}</div>
      ${accountCountLabel}

      <div class="status-list" style="margin-top: 16px;">
        <div>
          <span class="label">${t("Configured", "已配置")}</span>
          <span>${signal?.configured ? t("Yes", "是") : t("No", "否")}</span>
        </div>
        <div>
          <span class="label">${t("Running", "运行中")}</span>
          <span>${signal?.running ? t("Yes", "是") : t("No", "否")}</span>
        </div>
        <div>
          <span class="label">${t("Base URL", "基础地址")}</span>
          <span>${signal?.baseUrl ?? t("n/a", "暂无")}</span>
        </div>
        <div>
          <span class="label">${t("Last start", "最近启动")}</span>
          <span>${signal?.lastStartAt ? formatAgo(signal.lastStartAt) : t("n/a", "暂无")}</span>
        </div>
        <div>
          <span class="label">${t("Last probe", "最近探测")}</span>
          <span>${signal?.lastProbeAt ? formatAgo(signal.lastProbeAt) : t("n/a", "暂无")}</span>
        </div>
      </div>

      ${
        signal?.lastError
          ? html`<div class="callout danger" style="margin-top: 12px;">
            ${signal.lastError}
          </div>`
          : nothing
      }

      ${
        signal?.probe
          ? html`<div class="callout" style="margin-top: 12px;">
            ${t("Probe", "探测")} ${signal.probe.ok ? t("ok", "成功") : t("failed", "失败")} ·
            ${signal.probe.status ?? ""} ${signal.probe.error ?? ""}
          </div>`
          : nothing
      }

      ${renderChannelConfigSection({ channelId: "signal", props })}

      <div class="row" style="margin-top: 12px;">
        <button class="btn" @click=${() => props.onRefresh(true)}>
          ${t("Probe", "探测")}
        </button>
      </div>
    </div>
  `;
}
