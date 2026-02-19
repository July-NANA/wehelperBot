import { html, nothing } from "lit";
import type { ChannelAccountSnapshot, TelegramStatus } from "../types.ts";
import type { ChannelsProps } from "./channels.types.ts";
import { formatAgo } from "../format.ts";
import { t } from "../i18n.ts";
import { renderChannelConfigSection } from "./channels.config.ts";

export function renderTelegramCard(params: {
  props: ChannelsProps;
  telegram?: TelegramStatus;
  telegramAccounts: ChannelAccountSnapshot[];
  accountCountLabel: unknown;
}) {
  const { props, telegram, telegramAccounts, accountCountLabel } = params;
  const hasMultipleAccounts = telegramAccounts.length > 1;

  const renderAccountCard = (account: ChannelAccountSnapshot) => {
    const probe = account.probe as { bot?: { username?: string } } | undefined;
    const botUsername = probe?.bot?.username;
    const label = account.name || account.accountId;
    return html`
      <div class="account-card">
        <div class="account-card-header">
          <div class="account-card-title">
            ${botUsername ? `@${botUsername}` : label}
          </div>
          <div class="account-card-id">${account.accountId}</div>
        </div>
        <div class="status-list account-card-status">
          <div>
            <span class="label">${t("Running", "运行中")}</span>
            <span>${account.running ? t("Yes", "是") : t("No", "否")}</span>
          </div>
          <div>
            <span class="label">${t("Configured", "已配置")}</span>
            <span>${account.configured ? t("Yes", "是") : t("No", "否")}</span>
          </div>
          <div>
            <span class="label">${t("Last inbound", "最近入站")}</span>
            <span>${account.lastInboundAt ? formatAgo(account.lastInboundAt) : t("n/a", "暂无")}</span>
          </div>
          ${
            account.lastError
              ? html`
                <div class="account-card-error">
                  ${account.lastError}
                </div>
              `
              : nothing
          }
        </div>
      </div>
    `;
  };

  return html`
    <div class="card">
      <div class="card-title">Telegram</div>
      <div class="card-sub">${t("Bot status and channel configuration.", "机器人状态与通道配置。")}</div>
      ${accountCountLabel}

      ${
        hasMultipleAccounts
          ? html`
            <div class="account-card-list">
              ${telegramAccounts.map((account) => renderAccountCard(account))}
            </div>
          `
          : html`
            <div class="status-list" style="margin-top: 16px;">
              <div>
                <span class="label">${t("Configured", "已配置")}</span>
                <span>${telegram?.configured ? t("Yes", "是") : t("No", "否")}</span>
              </div>
              <div>
                <span class="label">${t("Running", "运行中")}</span>
                <span>${telegram?.running ? t("Yes", "是") : t("No", "否")}</span>
              </div>
              <div>
                <span class="label">${t("Mode", "模式")}</span>
                <span>${telegram?.mode ?? t("n/a", "暂无")}</span>
              </div>
              <div>
                <span class="label">${t("Last start", "最近启动")}</span>
                <span>${telegram?.lastStartAt ? formatAgo(telegram.lastStartAt) : t("n/a", "暂无")}</span>
              </div>
              <div>
                <span class="label">${t("Last probe", "最近探测")}</span>
                <span>${telegram?.lastProbeAt ? formatAgo(telegram.lastProbeAt) : t("n/a", "暂无")}</span>
              </div>
            </div>
          `
      }

      ${
        telegram?.lastError
          ? html`<div class="callout danger" style="margin-top: 12px;">
            ${telegram.lastError}
          </div>`
          : nothing
      }

      ${
        telegram?.probe
          ? html`<div class="callout" style="margin-top: 12px;">
            ${t("Probe", "探测")} ${telegram.probe.ok ? t("ok", "成功") : t("failed", "失败")} ·
            ${telegram.probe.status ?? ""} ${telegram.probe.error ?? ""}
          </div>`
          : nothing
      }

      ${renderChannelConfigSection({ channelId: "telegram", props })}

      <div class="row" style="margin-top: 12px;">
        <button class="btn" @click=${() => props.onRefresh(true)}>
          ${t("Probe", "探测")}
        </button>
      </div>
    </div>
  `;
}
