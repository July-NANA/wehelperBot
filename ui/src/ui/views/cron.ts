import { html, nothing } from "lit";
import type { ChannelUiMetaEntry, CronJob, CronRunLogEntry, CronStatus } from "../types.ts";
import type { CronFormState } from "../ui-types.ts";
import { formatMs } from "../format.ts";
import { t } from "../i18n.ts";
import {
  formatCronPayload,
  formatCronSchedule,
  formatCronState,
  formatNextRun,
} from "../presenter.ts";

export type CronProps = {
  loading: boolean;
  status: CronStatus | null;
  jobs: CronJob[];
  error: string | null;
  busy: boolean;
  form: CronFormState;
  channels: string[];
  channelLabels?: Record<string, string>;
  channelMeta?: ChannelUiMetaEntry[];
  runsJobId: string | null;
  runs: CronRunLogEntry[];
  onFormChange: (patch: Partial<CronFormState>) => void;
  onRefresh: () => void;
  onAdd: () => void;
  onToggle: (job: CronJob, enabled: boolean) => void;
  onRun: (job: CronJob) => void;
  onRemove: (job: CronJob) => void;
  onLoadRuns: (jobId: string) => void;
};

function buildChannelOptions(props: CronProps): string[] {
  const options = ["last", ...props.channels.filter(Boolean)];
  const current = props.form.channel?.trim();
  if (current && !options.includes(current)) {
    options.push(current);
  }
  const seen = new Set<string>();
  return options.filter((value) => {
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}

function resolveChannelLabel(props: CronProps, channel: string): string {
  if (channel === "last") {
    return t("last", "上次会话");
  }
  const meta = props.channelMeta?.find((entry) => entry.id === channel);
  if (meta?.label) {
    return meta.label;
  }
  return props.channelLabels?.[channel] ?? channel;
}

export function renderCron(props: CronProps) {
  const channelOptions = buildChannelOptions(props);
  return html`
    <section class="grid grid-cols-2">
      <div class="card">
        <div class="card-title">${t("Scheduler", "调度器")}</div>
        <div class="card-sub">${t("Gateway-owned cron scheduler status.", "网关内置 Cron 调度器状态。")}</div>
        <div class="stat-grid" style="margin-top: 16px;">
          <div class="stat">
            <div class="stat-label">${t("Enabled", "已启用")}</div>
            <div class="stat-value">
              ${props.status ? (props.status.enabled ? t("Yes", "是") : t("No", "否")) : t("n/a", "暂无")}
            </div>
          </div>
          <div class="stat">
            <div class="stat-label">${t("Jobs", "任务数")}</div>
            <div class="stat-value">${props.status?.jobs ?? t("n/a", "暂无")}</div>
          </div>
          <div class="stat">
            <div class="stat-label">${t("Next wake", "下次唤醒")}</div>
            <div class="stat-value">${formatNextRun(props.status?.nextWakeAtMs ?? null)}</div>
          </div>
        </div>
        <div class="row" style="margin-top: 12px;">
          <button class="btn" ?disabled=${props.loading} @click=${props.onRefresh}>
            ${props.loading ? t("Refreshing…", "刷新中…") : t("Refresh", "刷新")}
          </button>
          ${props.error ? html`<span class="muted">${props.error}</span>` : nothing}
        </div>
      </div>

      <div class="card">
        <div class="card-title">${t("New Job", "新建任务")}</div>
        <div class="card-sub">${t("Create a scheduled wakeup or agent run.", "创建定时唤醒或 Agent 运行任务。")}</div>
        <div class="form-grid" style="margin-top: 16px;">
          <label class="field">
            <span>${t("Name", "名称")}</span>
            <input
              .value=${props.form.name}
              @input=${(e: Event) =>
                props.onFormChange({ name: (e.target as HTMLInputElement).value })}
            />
          </label>
          <label class="field">
            <span>${t("Description", "描述")}</span>
            <input
              .value=${props.form.description}
              @input=${(e: Event) =>
                props.onFormChange({ description: (e.target as HTMLInputElement).value })}
            />
          </label>
          <label class="field">
            <span>${t("Agent ID", "Agent ID")}</span>
            <input
              .value=${props.form.agentId}
              @input=${(e: Event) =>
                props.onFormChange({ agentId: (e.target as HTMLInputElement).value })}
              placeholder=${t("default", "默认")}
            />
          </label>
          <label class="field checkbox">
            <span>${t("Enabled", "已启用")}</span>
            <input
              type="checkbox"
              .checked=${props.form.enabled}
              @change=${(e: Event) =>
                props.onFormChange({ enabled: (e.target as HTMLInputElement).checked })}
            />
          </label>
          <label class="field">
            <span>${t("Schedule", "调度类型")}</span>
            <select
              .value=${props.form.scheduleKind}
              @change=${(e: Event) =>
                props.onFormChange({
                  scheduleKind: (e.target as HTMLSelectElement)
                    .value as CronFormState["scheduleKind"],
                })}
            >
              <option value="every">${t("Every", "每隔")}</option>
              <option value="at">${t("At", "定点")}</option>
              <option value="cron">Cron</option>
            </select>
          </label>
        </div>
        ${renderScheduleFields(props)}
        <div class="form-grid" style="margin-top: 12px;">
          <label class="field">
            <span>${t("Session", "会话")}</span>
            <select
              .value=${props.form.sessionTarget}
              @change=${(e: Event) =>
                props.onFormChange({
                  sessionTarget: (e.target as HTMLSelectElement)
                    .value as CronFormState["sessionTarget"],
                })}
            >
              <option value="main">${t("Main", "主会话")}</option>
              <option value="isolated">${t("Isolated", "隔离会话")}</option>
            </select>
          </label>
          <label class="field">
            <span>${t("Wake mode", "唤醒模式")}</span>
            <select
              .value=${props.form.wakeMode}
              @change=${(e: Event) =>
                props.onFormChange({
                  wakeMode: (e.target as HTMLSelectElement).value as CronFormState["wakeMode"],
                })}
            >
              <option value="next-heartbeat">${t("Next heartbeat", "下次心跳")}</option>
              <option value="now">${t("Now", "立即")}</option>
            </select>
          </label>
          <label class="field">
            <span>${t("Payload", "负载类型")}</span>
            <select
              .value=${props.form.payloadKind}
              @change=${(e: Event) =>
                props.onFormChange({
                  payloadKind: (e.target as HTMLSelectElement)
                    .value as CronFormState["payloadKind"],
                })}
            >
              <option value="systemEvent">${t("System event", "系统事件")}</option>
              <option value="agentTurn">${t("Agent turn", "Agent 轮次")}</option>
            </select>
          </label>
        </div>
        <label class="field" style="margin-top: 12px;">
          <span>${props.form.payloadKind === "systemEvent" ? t("System text", "系统文本") : t("Agent message", "Agent 消息")}</span>
          <textarea
            .value=${props.form.payloadText}
            @input=${(e: Event) =>
              props.onFormChange({
                payloadText: (e.target as HTMLTextAreaElement).value,
              })}
            rows="4"
          ></textarea>
        </label>
	          ${
              props.form.payloadKind === "agentTurn"
                ? html`
	              <div class="form-grid" style="margin-top: 12px;">
                <label class="field checkbox">
                  <span>${t("Deliver", "投递")}</span>
                  <input
                    type="checkbox"
                    .checked=${props.form.deliver}
                    @change=${(e: Event) =>
                      props.onFormChange({
                        deliver: (e.target as HTMLInputElement).checked,
                      })}
                  />
	                </label>
	                <label class="field">
	                  <span>${t("Channel", "通道")}</span>
	                  <select
	                    .value=${props.form.channel || "last"}
	                    @change=${(e: Event) =>
                        props.onFormChange({
                          channel: (e.target as HTMLSelectElement).value,
                        })}
	                  >
	                    ${channelOptions.map(
                        (channel) =>
                          html`<option value=${channel}>
                            ${resolveChannelLabel(props, channel)}
                          </option>`,
                      )}
                  </select>
                </label>
                <label class="field">
                  <span>${t("To", "目标")}</span>
                  <input
                    .value=${props.form.to}
                    @input=${(e: Event) =>
                      props.onFormChange({ to: (e.target as HTMLInputElement).value })}
                    placeholder=${t("+1555… or chat id", "+1555… 或会话 ID")}
                  />
                </label>
                <label class="field">
                  <span>${t("Timeout (seconds)", "超时（秒）")}</span>
                  <input
                    .value=${props.form.timeoutSeconds}
                    @input=${(e: Event) =>
                      props.onFormChange({
                        timeoutSeconds: (e.target as HTMLInputElement).value,
                      })}
                  />
                </label>
                ${
                  props.form.sessionTarget === "isolated"
                    ? html`
                      <label class="field">
                        <span>${t("Post to main prefix", "回投主会话前缀")}</span>
                        <input
                          .value=${props.form.postToMainPrefix}
                          @input=${(e: Event) =>
                            props.onFormChange({
                              postToMainPrefix: (e.target as HTMLInputElement).value,
                            })}
                        />
                      </label>
                    `
                    : nothing
                }
              </div>
            `
                : nothing
            }
        <div class="row" style="margin-top: 14px;">
          <button class="btn primary" ?disabled=${props.busy} @click=${props.onAdd}>
            ${props.busy ? t("Saving…", "保存中…") : t("Add job", "添加任务")}
          </button>
        </div>
      </div>
    </section>

    <section class="card" style="margin-top: 18px;">
      <div class="card-title">${t("Jobs", "任务列表")}</div>
      <div class="card-sub">${t("All scheduled jobs stored in the gateway.", "网关中保存的全部定时任务。")}</div>
      ${
        props.jobs.length === 0
          ? html`
              <div class="muted" style="margin-top: 12px">${t("No jobs yet.", "暂无任务。")}</div>
            `
          : html`
            <div class="list" style="margin-top: 12px;">
              ${props.jobs.map((job) => renderJob(job, props))}
            </div>
          `
      }
    </section>

    <section class="card" style="margin-top: 18px;">
      <div class="card-title">${t("Run history", "运行记录")}</div>
      <div class="card-sub">${t("Latest runs for", "最近运行记录：")} ${props.runsJobId ?? t("(select a job)", "（请选择任务）")}.</div>
      ${
        props.runsJobId == null
          ? html`
              <div class="muted" style="margin-top: 12px">${t("Select a job to inspect run history.", "请选择任务查看运行记录。")}</div>
            `
          : props.runs.length === 0
            ? html`
                <div class="muted" style="margin-top: 12px">${t("No runs yet.", "暂无运行记录。")}</div>
              `
            : html`
              <div class="list" style="margin-top: 12px;">
                ${props.runs.map((entry) => renderRun(entry))}
              </div>
            `
      }
    </section>
  `;
}

function renderScheduleFields(props: CronProps) {
  const form = props.form;
  if (form.scheduleKind === "at") {
    return html`
      <label class="field" style="margin-top: 12px;">
        <span>${t("Run at", "运行时间")}</span>
        <input
          type="datetime-local"
          .value=${form.scheduleAt}
          @input=${(e: Event) =>
            props.onFormChange({
              scheduleAt: (e.target as HTMLInputElement).value,
            })}
        />
      </label>
    `;
  }
  if (form.scheduleKind === "every") {
    return html`
      <div class="form-grid" style="margin-top: 12px;">
        <label class="field">
          <span>${t("Every", "每隔")}</span>
          <input
            .value=${form.everyAmount}
            @input=${(e: Event) =>
              props.onFormChange({
                everyAmount: (e.target as HTMLInputElement).value,
              })}
          />
        </label>
        <label class="field">
          <span>${t("Unit", "单位")}</span>
          <select
            .value=${form.everyUnit}
            @change=${(e: Event) =>
              props.onFormChange({
                everyUnit: (e.target as HTMLSelectElement).value as CronFormState["everyUnit"],
              })}
          >
            <option value="minutes">${t("Minutes", "分钟")}</option>
            <option value="hours">${t("Hours", "小时")}</option>
            <option value="days">${t("Days", "天")}</option>
          </select>
        </label>
      </div>
    `;
  }
  return html`
    <div class="form-grid" style="margin-top: 12px;">
      <label class="field">
        <span>${t("Expression", "表达式")}</span>
        <input
          .value=${form.cronExpr}
          @input=${(e: Event) =>
            props.onFormChange({ cronExpr: (e.target as HTMLInputElement).value })}
        />
      </label>
      <label class="field">
        <span>${t("Timezone (optional)", "时区（可选）")}</span>
        <input
          .value=${form.cronTz}
          @input=${(e: Event) =>
            props.onFormChange({ cronTz: (e.target as HTMLInputElement).value })}
        />
      </label>
    </div>
  `;
}

function renderJob(job: CronJob, props: CronProps) {
  const isSelected = props.runsJobId === job.id;
  const itemClass = `list-item list-item-clickable${isSelected ? " list-item-selected" : ""}`;
  return html`
    <div class=${itemClass} @click=${() => props.onLoadRuns(job.id)}>
      <div class="list-main">
        <div class="list-title">${job.name}</div>
        <div class="list-sub">${formatCronSchedule(job)}</div>
        <div class="muted">${formatCronPayload(job)}</div>
        ${job.agentId ? html`<div class="muted">${t("Agent", "Agent")}: ${job.agentId}</div>` : nothing}
        <div class="chip-row" style="margin-top: 6px;">
          <span class="chip">${job.enabled ? t("enabled", "已启用") : t("disabled", "已禁用")}</span>
          <span class="chip">${job.sessionTarget}</span>
          <span class="chip">${job.wakeMode}</span>
        </div>
      </div>
      <div class="list-meta">
        <div>${formatCronState(job)}</div>
        <div class="row" style="justify-content: flex-end; margin-top: 8px;">
          <button
            class="btn"
            ?disabled=${props.busy}
            @click=${(event: Event) => {
              event.stopPropagation();
              props.onToggle(job, !job.enabled);
            }}
          >
            ${job.enabled ? t("Disable", "禁用") : t("Enable", "启用")}
          </button>
          <button
            class="btn"
            ?disabled=${props.busy}
            @click=${(event: Event) => {
              event.stopPropagation();
              props.onRun(job);
            }}
          >
            ${t("Run", "运行")}
          </button>
          <button
            class="btn"
            ?disabled=${props.busy}
            @click=${(event: Event) => {
              event.stopPropagation();
              props.onLoadRuns(job.id);
            }}
          >
            ${t("Runs", "记录")}
          </button>
          <button
            class="btn danger"
            ?disabled=${props.busy}
            @click=${(event: Event) => {
              event.stopPropagation();
              props.onRemove(job);
            }}
          >
            ${t("Remove", "删除")}
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderRun(entry: CronRunLogEntry) {
  return html`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title">${entry.status}</div>
        <div class="list-sub">${entry.summary ?? ""}</div>
      </div>
      <div class="list-meta">
        <div>${formatMs(entry.ts)}</div>
        <div class="muted">${entry.durationMs ?? 0}ms</div>
        ${entry.error ? html`<div class="muted">${entry.error}</div>` : nothing}
      </div>
    </div>
  `;
}
