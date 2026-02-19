import { html, nothing } from "lit";
import type { AppViewState } from "./app-view-state.ts";
import { parseAgentSessionKey } from "../../../src/routing/session-key.js";
import { ChatHost, refreshChatAvatar } from "./app-chat.ts";
import { renderChatControls, renderTab, renderThemeToggle } from "./app-render.helpers.ts";
import { wehelperApp } from "./app.ts";
import { loadAgentFileContent, loadAgentFiles, saveAgentFile } from "./controllers/agent-files.ts";
import { loadAgentIdentities, loadAgentIdentity } from "./controllers/agent-identity.ts";
import { loadAgentSkills } from "./controllers/agent-skills.ts";
import { loadAgents } from "./controllers/agents.ts";
import { loadChannels } from "./controllers/channels.ts";
import { ChatState, loadChatHistory } from "./controllers/chat.ts";
import {
  applyConfig,
  ConfigState,
  loadConfig,
  runUpdate,
  saveConfig,
  updateConfigFormValue,
  removeConfigFormValue,
} from "./controllers/config.ts";
import {
  loadCronRuns,
  toggleCronJob,
  runCronJob,
  removeCronJob,
  addCronJob,
} from "./controllers/cron.ts";
import { loadDebug, callDebugMethod } from "./controllers/debug.ts";
import {
  approveDevicePairing,
  loadDevices,
  rejectDevicePairing,
  revokeDeviceToken,
  rotateDeviceToken,
} from "./controllers/devices.ts";
import {
  loadExecApprovals,
  removeExecApprovalsFormValue,
  saveExecApprovals,
  updateExecApprovalsFormValue,
} from "./controllers/exec-approvals.ts";
import { loadLogs, LogsState } from "./controllers/logs.ts";
import { loadNodes } from "./controllers/nodes.ts";
import { loadPresence } from "./controllers/presence.ts";
import { deleteSession, loadSessions, patchSession } from "./controllers/sessions.ts";
import {
  installSkill,
  loadSkills,
  saveSkillApiKey,
  updateSkillEdit,
  updateSkillEnabled,
} from "./controllers/skills.ts";
import { tr } from "./i18n.ts";
import { icons } from "./icons.ts";
import { normalizeBasePath, TAB_GROUPS, subtitleForTab, titleForTab } from "./navigation.ts";
import { ConfigUiHints } from "./types.ts";
import { renderAgents } from "./views/agents.ts";
import { renderChannels } from "./views/channels.ts";
import { renderChat } from "./views/chat.ts";
import { renderConfig } from "./views/config.ts";
import { renderCron } from "./views/cron.ts";
import { renderDebug } from "./views/debug.ts";
import { renderExecApprovalPrompt } from "./views/exec-approval.ts";
import { renderGatewayUrlConfirmation } from "./views/gateway-url-confirmation.ts";
import { renderInstances } from "./views/instances.ts";
import { renderLogs } from "./views/logs.ts";
import { renderNodes } from "./views/nodes.ts";
import { renderOverview } from "./views/overview.ts";
import { renderProvidersConfig } from "./views/providers-config.ts";
import { renderSessions } from "./views/sessions.ts";
import { renderSkills } from "./views/skills.ts";
import { createSupplierFromPreset, type SupplierPresetType } from "./views/supplier-presets.ts";
import { renderWecomKf } from "./views/wecom-kf.ts";

const AVATAR_DATA_RE = /^data:/i;
const AVATAR_HTTP_RE = /^https?:\/\//i;

function resolveAssistantAvatarUrl(state: AppViewState): string | undefined {
  const list = state.agentsList?.agents ?? [];
  const parsed = parseAgentSessionKey(state.sessionKey);
  const agentId = parsed?.agentId ?? state.agentsList?.defaultId ?? "main";
  const agent = list.find((entry) => entry.id === agentId);
  const identity = agent?.identity;
  const candidate = identity?.avatarUrl ?? identity?.avatar;
  if (!candidate) {
    return undefined;
  }
  if (AVATAR_DATA_RE.test(candidate) || AVATAR_HTTP_RE.test(candidate)) {
    return candidate;
  }
  return identity?.avatarUrl;
}

export function renderApp(state: AppViewState) {
  const presenceCount = state.presenceEntries.length;
  const sessionsCount = state.sessionsResult?.count ?? null;
  const cronNext = state.cronStatus?.nextWakeAtMs ?? null;
  const chatDisabledReason = state.connected ? null : tr("shell.chat.disconnected");
  const isChat = state.tab === "chat";
  const startupLockActive =
    state.desktopStartupLockEnabled && !state.desktopStartupUnlockedOnce && isChat;
  const chatFocus = isChat && (state.settings.chatFocusMode || state.onboarding);
  const showThinking = state.onboarding ? false : state.settings.chatShowThinking;
  const assistantAvatarUrl = resolveAssistantAvatarUrl(state);
  const chatAvatarUrl = state.chatAvatarUrl ?? assistantAvatarUrl ?? null;
  const logoBase = normalizeBasePath(state.basePath);
  const logoHref =
    typeof window !== "undefined" && window.location.protocol === "file:"
      ? "./lingshi-logo.png"
      : logoBase
        ? `${logoBase}/lingshi-logo.png`
        : "/lingshi-logo.png";
  const configValue =
    state.configForm ?? (state.configSnapshot?.config as Record<string, unknown> | null);
  const resolvedAgentId =
    state.agentsSelectedId ??
    state.agentsList?.defaultId ??
    state.agentsList?.agents?.[0]?.id ??
    null;
  const primaryModelRef =
    (
      (state.configForm?.agents as Record<string, unknown> | undefined)?.defaults as
        | Record<string, unknown>
        | undefined
    )?.model &&
    typeof (
      (
        (state.configForm?.agents as Record<string, unknown> | undefined)?.defaults as
          | Record<string, unknown>
          | undefined
      )?.model as Record<string, unknown>
    ).primary === "string"
      ? ((
          (
            (state.configForm?.agents as Record<string, unknown> | undefined)?.defaults as
              | Record<string, unknown>
              | undefined
          )?.model as Record<string, unknown>
        ).primary as string)
      : "";
  const derivedSupplierDefaultId =
    primaryModelRef && primaryModelRef.includes("/") ? primaryModelRef.split("/")[0] : null;
  const defaultSupplierMissing = !(primaryModelRef && primaryModelRef.trim().length > 0);
  const resolveProviderMap = (): Record<string, unknown> =>
    ((state.configForm?.models as Record<string, unknown> | undefined)?.providers as
      | Record<string, unknown>
      | undefined) ?? {};
  const getConfigPathString = (path: Array<string | number>): string => path.join(".");
  const patchWecomConfig = (path: Array<string | number>, value: unknown) => {
    const isDeviceIdPath = getConfigPathString(path) === "plugins.entries.wecom-kf.config.deviceId";
    if (isDeviceIdPath && state.wecomKfStatus?.device?.isBound) {
      const oldDeviceId = (state.wecomKfStatus.device.deviceId || "").trim();
      const nextDeviceId = typeof value === "string" ? value.trim() : "";
      if (oldDeviceId && nextDeviceId !== oldDeviceId) {
        state.wecomKfError =
          "设备已绑定，修改设备名前请先解绑当前设备（保持微信侧短码绑定流程不变）。";
        return;
      }
    }
    updateConfigFormValue(state as unknown as ConfigState, path, value);
  };
  const resolveProviderModels = (supplierId: string): Array<Record<string, unknown>> => {
    const provider = resolveProviderMap()[supplierId] as Record<string, unknown> | undefined;
    const models = provider?.models;
    return Array.isArray(models) ? (models as Array<Record<string, unknown>>) : [];
  };
  const resolvePrimaryModelRef = (): string => {
    const defaults = (state.configForm?.agents as Record<string, unknown> | undefined)?.defaults as
      | Record<string, unknown>
      | undefined;
    const model = defaults?.model as Record<string, unknown> | undefined;
    return typeof model?.primary === "string" ? model.primary : "";
  };

  return html`
    <div class="shell ${isChat ? "shell--chat" : ""} ${chatFocus ? "shell--chat-focus" : ""} ${state.settings.navCollapsed ? "shell--nav-collapsed" : ""} ${state.onboarding ? "shell--onboarding" : ""}">
      <header class="topbar">
        <div class="topbar-left">
          <button
            class="nav-collapse-toggle"
            @click=${() =>
              state.applySettings({
                ...state.settings,
                navCollapsed: !state.settings.navCollapsed,
              })}
            aria-label="${
              state.settings.navCollapsed
                ? tr("shell.nav.expandSidebar")
                : tr("shell.nav.collapseSidebar")
            }"
            title="${
              state.settings.navCollapsed
                ? tr("shell.nav.expandSidebar")
                : tr("shell.nav.collapseSidebar")
            }"
          >
            <span class="nav-collapse-toggle__icon">${icons.menu}</span>
          </button>
          <div class="brand">
            <div class="brand-logo">
              <img src="${logoHref}" alt="灵识 Lingshi" />
            </div>
            <div class="brand-text">
              <div class="brand-title">灵识 LINGSHI</div>
              <div class="brand-sub">${tr("shell.brand.subtitle")}</div>
            </div>
          </div>
        </div>
        <div class="topbar-status">
          <div class="pill">
            <span class="statusDot ${state.connected ? "ok" : ""}"></span>
            <span>${tr("shell.status.health")}</span>
            <span class="mono">${state.connected ? tr("shell.status.ok") : tr("shell.status.offline")}</span>
          </div>
          ${renderThemeToggle(state)}
        </div>
      </header>
      <aside class="nav ${state.settings.navCollapsed ? "nav--collapsed" : ""}">
        ${TAB_GROUPS.map((group) => {
          const isGroupCollapsed = state.settings.navGroupsCollapsed[group.label] ?? false;
          const hasActiveTab = group.tabs.some((tab) => tab === state.tab);
          return html`
            <div class="nav-group ${isGroupCollapsed && !hasActiveTab ? "nav-group--collapsed" : ""}">
              <button
                class="nav-label"
                @click=${() => {
                  const next = { ...state.settings.navGroupsCollapsed };
                  next[group.label] = !isGroupCollapsed;
                  state.applySettings({
                    ...state.settings,
                    navGroupsCollapsed: next,
                  });
                }}
                aria-expanded=${!isGroupCollapsed}
              >
                <span class="nav-label__text">${group.label}</span>
                <span class="nav-label__chevron">${isGroupCollapsed ? "+" : "−"}</span>
              </button>
              <div class="nav-group__items">
                ${group.tabs.map((tab) => renderTab(state, tab))}
              </div>
            </div>
          `;
        })}
        <div class="nav-group nav-group--links">
          <div class="nav-label nav-label--static">
            <span class="nav-label__text">${tr("shell.resources")}</span>
          </div>
          <div class="nav-group__items">
            <a
              class="nav-item nav-item--external"
              href="https://docs.openclaw.ai"
              target="_blank"
              rel="noreferrer"
              title=${tr("shell.docs.openInNewTab")}
            >
              <span class="nav-item__icon" aria-hidden="true">${icons.book}</span>
              <span class="nav-item__text">${tr("shell.docs")}</span>
            </a>
          </div>
        </div>
      </aside>
      <main class="content ${isChat ? "content--chat" : ""}">
        <section class="content-header">
          <div>
            <div class="page-title">${titleForTab(state.tab)}</div>
            <div class="page-sub">${subtitleForTab(state.tab)}</div>
          </div>
          <div class="page-meta">
            ${state.lastError ? html`<div class="pill danger">${state.lastError}</div>` : nothing}
            ${isChat ? renderChatControls(state) : nothing}
          </div>
        </section>

        ${
          state.tab === "overview"
            ? renderOverview({
                connected: state.connected,
                hello: state.hello,
                settings: state.settings,
                password: state.password,
                lastError: state.lastError,
                presenceCount,
                sessionsCount,
                cronEnabled: state.cronStatus?.enabled ?? null,
                cronNext,
                lastChannelsRefresh: state.channelsLastSuccess,
                onSettingsChange: (next) => state.applySettings(next),
                onPasswordChange: (next) => (state.password = next),
                onSessionKeyChange: (next) => {
                  state.sessionKey = next;
                  state.chatMessage = "";
                  (state as unknown as wehelperApp).resetToolStream();
                  state.applySettings({
                    ...state.settings,
                    sessionKey: next,
                    lastActiveSessionKey: next,
                  });
                  void state.loadAssistantIdentity();
                },
                onConnect: () => state.connect(),
                onRefresh: () => state.loadOverview(),
              })
            : nothing
        }

        ${
          state.tab === "channels"
            ? renderChannels({
                connected: state.connected,
                loading: state.channelsLoading,
                snapshot: state.channelsSnapshot,
                lastError: state.channelsError,
                lastSuccessAt: state.channelsLastSuccess,
                whatsappMessage: state.whatsappLoginMessage,
                whatsappQrDataUrl: state.whatsappLoginQrDataUrl,
                whatsappConnected: state.whatsappLoginConnected,
                whatsappBusy: state.whatsappBusy,
                configSchema: state.configSchema,
                configSchemaLoading: state.configSchemaLoading,
                configForm: state.configForm,
                configUiHints: state.configUiHints as ConfigUiHints,
                configSaving: state.configSaving,
                configFormDirty: state.configFormDirty,
                nostrProfileFormState: state.nostrProfileFormState,
                nostrProfileAccountId: state.nostrProfileAccountId,
                onRefresh: (probe) => loadChannels(state, probe),
                onWhatsAppStart: (force) => state.handleWhatsAppStart(force),
                onWhatsAppWait: () => state.handleWhatsAppWait(),
                onWhatsAppLogout: () => state.handleWhatsAppLogout(),
                onConfigPatch: (path, value) =>
                  updateConfigFormValue(state as unknown as ConfigState, path, value),
                onConfigSave: () => state.handleChannelConfigSave(),
                onConfigReload: () => state.handleChannelConfigReload(),
                onNostrProfileEdit: (accountId, profile) =>
                  state.handleNostrProfileEdit(accountId, profile),
                onNostrProfileCancel: () => state.handleNostrProfileCancel(),
                onNostrProfileFieldChange: (field, value) =>
                  state.handleNostrProfileFieldChange(field, value),
                onNostrProfileSave: () => state.handleNostrProfileSave(),
                onNostrProfileImport: () => state.handleNostrProfileImport(),
                onNostrProfileToggleAdvanced: () => state.handleNostrProfileToggleAdvanced(),
              })
            : nothing
        }

        ${
          state.tab === "wecom"
            ? renderWecomKf({
                connected: state.connected,
                loading: state.wecomKfLoading,
                busy: state.wecomKfBusy,
                error: state.wecomKfError,
                status: state.wecomKfStatus,
                configForm: state.configForm,
                configDirty: state.configFormDirty,
                skipHistory: state.wecomKfSkipHistory,
                deviceIdLocked: Boolean(state.wecomKfStatus?.device?.isBound),
                onSkipHistoryChange: (next) => {
                  state.wecomKfSkipHistory = next;
                },
                onConfigPatch: (path, value) => patchWecomConfig(path, value),
                onConfigSave: () => saveConfig(state as unknown as ConfigState),
                onRefresh: () => state.handleWecomKfRefresh(),
                onStart: (config) => state.handleWecomKfStart(config),
                onStop: () => state.handleWecomKfStop(),
                onUnbind: () => state.handleWecomKfUnbind(),
              })
            : nothing
        }

        ${
          state.tab === "instances"
            ? renderInstances({
                loading: state.presenceLoading,
                entries: state.presenceEntries,
                lastError: state.presenceError,
                statusMessage: state.presenceStatus,
                onRefresh: () => loadPresence(state),
              })
            : nothing
        }

        ${
          state.tab === "sessions"
            ? renderSessions({
                loading: state.sessionsLoading,
                result: state.sessionsResult,
                error: state.sessionsError,
                activeMinutes: state.sessionsFilterActive,
                limit: state.sessionsFilterLimit,
                includeGlobal: state.sessionsIncludeGlobal,
                includeUnknown: state.sessionsIncludeUnknown,
                basePath: state.basePath,
                onFiltersChange: (next) => {
                  state.sessionsFilterActive = next.activeMinutes;
                  state.sessionsFilterLimit = next.limit;
                  state.sessionsIncludeGlobal = next.includeGlobal;
                  state.sessionsIncludeUnknown = next.includeUnknown;
                },
                onRefresh: () => loadSessions(state),
                onPatch: (key, patch) => patchSession(state, key, patch),
                onDelete: (key) => deleteSession(state, key),
              })
            : nothing
        }

        ${
          state.tab === "cron"
            ? renderCron({
                loading: state.cronLoading,
                status: state.cronStatus,
                jobs: state.cronJobs,
                error: state.cronError,
                busy: state.cronBusy,
                form: state.cronForm,
                channels: state.channelsSnapshot?.channelMeta?.length
                  ? state.channelsSnapshot.channelMeta.map((entry) => entry.id)
                  : (state.channelsSnapshot?.channelOrder ?? []),
                channelLabels: state.channelsSnapshot?.channelLabels ?? {},
                channelMeta: state.channelsSnapshot?.channelMeta ?? [],
                runsJobId: state.cronRunsJobId,
                runs: state.cronRuns,
                onFormChange: (patch) => (state.cronForm = { ...state.cronForm, ...patch }),
                onRefresh: () => state.loadCron(),
                onAdd: () => addCronJob(state),
                onToggle: (job, enabled) => toggleCronJob(state, job, enabled),
                onRun: (job) => runCronJob(state, job),
                onRemove: (job) => removeCronJob(state, job),
                onLoadRuns: (jobId) => loadCronRuns(state, jobId),
              })
            : nothing
        }

        ${
          state.tab === "agents"
            ? renderAgents({
                loading: state.agentsLoading,
                error: state.agentsError,
                agentsList: state.agentsList,
                selectedAgentId: resolvedAgentId,
                activePanel: state.agentsPanel,
                configForm: configValue,
                configLoading: state.configLoading,
                configSaving: state.configSaving,
                configDirty: state.configFormDirty,
                channelsLoading: state.channelsLoading,
                channelsError: state.channelsError,
                channelsSnapshot: state.channelsSnapshot,
                channelsLastSuccess: state.channelsLastSuccess,
                cronLoading: state.cronLoading,
                cronStatus: state.cronStatus,
                cronJobs: state.cronJobs,
                cronError: state.cronError,
                agentFilesLoading: state.agentFilesLoading,
                agentFilesError: state.agentFilesError,
                agentFilesList: state.agentFilesList,
                agentFileActive: state.agentFileActive,
                agentFileContents: state.agentFileContents,
                agentFileDrafts: state.agentFileDrafts,
                agentFileSaving: state.agentFileSaving,
                agentIdentityLoading: state.agentIdentityLoading,
                agentIdentityError: state.agentIdentityError,
                agentIdentityById: state.agentIdentityById,
                agentSkillsLoading: state.agentSkillsLoading,
                agentSkillsReport: state.agentSkillsReport,
                agentSkillsError: state.agentSkillsError,
                agentSkillsAgentId: state.agentSkillsAgentId,
                skillsFilter: state.skillsFilter,
                onRefresh: async () => {
                  await loadAgents(state);
                  const agentIds = state.agentsList?.agents?.map((entry) => entry.id) ?? [];
                  if (agentIds.length > 0) {
                    void loadAgentIdentities(state, agentIds);
                  }
                },
                onSelectAgent: (agentId) => {
                  if (state.agentsSelectedId === agentId) {
                    return;
                  }
                  state.agentsSelectedId = agentId;
                  state.agentFilesList = null;
                  state.agentFilesError = null;
                  state.agentFilesLoading = false;
                  state.agentFileActive = null;
                  state.agentFileContents = {};
                  state.agentFileDrafts = {};
                  state.agentSkillsReport = null;
                  state.agentSkillsError = null;
                  state.agentSkillsAgentId = null;
                  void loadAgentIdentity(state, agentId);
                  if (state.agentsPanel === "files") {
                    void loadAgentFiles(state, agentId);
                  }
                  if (state.agentsPanel === "skills") {
                    void loadAgentSkills(state, agentId);
                  }
                },
                onSelectPanel: (panel) => {
                  state.agentsPanel = panel;
                  if (panel === "files" && resolvedAgentId) {
                    if (state.agentFilesList?.agentId !== resolvedAgentId) {
                      state.agentFilesList = null;
                      state.agentFilesError = null;
                      state.agentFileActive = null;
                      state.agentFileContents = {};
                      state.agentFileDrafts = {};
                      void loadAgentFiles(state, resolvedAgentId);
                    }
                  }
                  if (panel === "skills") {
                    if (resolvedAgentId) {
                      void loadAgentSkills(state, resolvedAgentId);
                    }
                  }
                  if (panel === "channels") {
                    void loadChannels(state, false);
                  }
                  if (panel === "cron") {
                    void state.loadCron();
                  }
                },
                onLoadFiles: (agentId) => {
                  void (async () => {
                    await loadAgentFiles(state, agentId);
                    if (state.agentFileActive) {
                      await loadAgentFileContent(state, agentId, state.agentFileActive, {
                        force: true,
                        preserveDraft: true,
                      });
                    }
                  })();
                },
                onSelectFile: (name) => {
                  state.agentFileActive = name;
                  if (!resolvedAgentId) {
                    return;
                  }
                  void loadAgentFileContent(state, resolvedAgentId, name);
                },
                onFileDraftChange: (name, content) => {
                  state.agentFileDrafts = { ...state.agentFileDrafts, [name]: content };
                },
                onFileReset: (name) => {
                  const base = state.agentFileContents[name] ?? "";
                  state.agentFileDrafts = { ...state.agentFileDrafts, [name]: base };
                },
                onFileSave: (name) => {
                  if (!resolvedAgentId) {
                    return;
                  }
                  const content =
                    state.agentFileDrafts[name] ?? state.agentFileContents[name] ?? "";
                  void saveAgentFile(state, resolvedAgentId, name, content);
                },
                onToolsProfileChange: (agentId, profile, clearAllow) => {
                  if (!configValue) {
                    return;
                  }
                  const list = (configValue as { agents?: { list?: unknown[] } }).agents?.list;
                  if (!Array.isArray(list)) {
                    return;
                  }
                  const index = list.findIndex(
                    (entry) =>
                      entry &&
                      typeof entry === "object" &&
                      "id" in entry &&
                      (entry as { id?: string }).id === agentId,
                  );
                  if (index < 0) {
                    return;
                  }
                  const basePath = ["agents", "list", index, "tools"];
                  if (profile) {
                    updateConfigFormValue(
                      state as unknown as ConfigState,
                      [...basePath, "profile"],
                      profile,
                    );
                  } else {
                    removeConfigFormValue(state as unknown as ConfigState, [
                      ...basePath,
                      "profile",
                    ]);
                  }
                  if (clearAllow) {
                    removeConfigFormValue(state as unknown as ConfigState, [...basePath, "allow"]);
                  }
                },
                onToolsOverridesChange: (agentId, alsoAllow, deny) => {
                  if (!configValue) {
                    return;
                  }
                  const list = (configValue as { agents?: { list?: unknown[] } }).agents?.list;
                  if (!Array.isArray(list)) {
                    return;
                  }
                  const index = list.findIndex(
                    (entry) =>
                      entry &&
                      typeof entry === "object" &&
                      "id" in entry &&
                      (entry as { id?: string }).id === agentId,
                  );
                  if (index < 0) {
                    return;
                  }
                  const basePath = ["agents", "list", index, "tools"];
                  if (alsoAllow.length > 0) {
                    updateConfigFormValue(
                      state as unknown as ConfigState,
                      [...basePath, "alsoAllow"],
                      alsoAllow,
                    );
                  } else {
                    removeConfigFormValue(state as unknown as ConfigState, [
                      ...basePath,
                      "alsoAllow",
                    ]);
                  }
                  if (deny.length > 0) {
                    updateConfigFormValue(
                      state as unknown as ConfigState,
                      [...basePath, "deny"],
                      deny,
                    );
                  } else {
                    removeConfigFormValue(state as unknown as ConfigState, [...basePath, "deny"]);
                  }
                },
                onConfigReload: () => loadConfig(state as unknown as ConfigState),
                onConfigSave: () => saveConfig(state as unknown as ConfigState),
                onChannelsRefresh: () => loadChannels(state, false),
                onCronRefresh: () => state.loadCron(),
                onSkillsFilterChange: (next) => (state.skillsFilter = next),
                onSkillsRefresh: () => {
                  if (resolvedAgentId) {
                    void loadAgentSkills(state, resolvedAgentId);
                  }
                },
                onAgentSkillToggle: (agentId, skillName, enabled) => {
                  if (!configValue) {
                    return;
                  }
                  const list = (configValue as { agents?: { list?: unknown[] } }).agents?.list;
                  if (!Array.isArray(list)) {
                    return;
                  }
                  const index = list.findIndex(
                    (entry) =>
                      entry &&
                      typeof entry === "object" &&
                      "id" in entry &&
                      (entry as { id?: string }).id === agentId,
                  );
                  if (index < 0) {
                    return;
                  }
                  const entry = list[index] as { skills?: unknown };
                  const normalizedSkill = skillName.trim();
                  if (!normalizedSkill) {
                    return;
                  }
                  const allSkills =
                    state.agentSkillsReport?.skills?.map((skill) => skill.name).filter(Boolean) ??
                    [];
                  const existing = Array.isArray(entry.skills)
                    ? entry.skills.map((name) => String(name).trim()).filter(Boolean)
                    : undefined;
                  const base = existing ?? allSkills;
                  const next = new Set(base);
                  if (enabled) {
                    next.add(normalizedSkill);
                  } else {
                    next.delete(normalizedSkill);
                  }
                  updateConfigFormValue(
                    state as unknown as ConfigState,
                    ["agents", "list", index, "skills"],
                    [...next],
                  );
                },
                onAgentSkillsClear: (agentId) => {
                  if (!configValue) {
                    return;
                  }
                  const list = (configValue as { agents?: { list?: unknown[] } }).agents?.list;
                  if (!Array.isArray(list)) {
                    return;
                  }
                  const index = list.findIndex(
                    (entry) =>
                      entry &&
                      typeof entry === "object" &&
                      "id" in entry &&
                      (entry as { id?: string }).id === agentId,
                  );
                  if (index < 0) {
                    return;
                  }
                  removeConfigFormValue(state as unknown as ConfigState, [
                    "agents",
                    "list",
                    index,
                    "skills",
                  ]);
                },
                onAgentSkillsDisableAll: (agentId) => {
                  if (!configValue) {
                    return;
                  }
                  const list = (configValue as { agents?: { list?: unknown[] } }).agents?.list;
                  if (!Array.isArray(list)) {
                    return;
                  }
                  const index = list.findIndex(
                    (entry) =>
                      entry &&
                      typeof entry === "object" &&
                      "id" in entry &&
                      (entry as { id?: string }).id === agentId,
                  );
                  if (index < 0) {
                    return;
                  }
                  updateConfigFormValue(
                    state as unknown as ConfigState,
                    ["agents", "list", index, "skills"],
                    [],
                  );
                },
                onModelChange: (agentId, modelId) => {
                  if (!configValue) {
                    return;
                  }
                  const list = (configValue as { agents?: { list?: unknown[] } }).agents?.list;
                  if (!Array.isArray(list)) {
                    return;
                  }
                  const index = list.findIndex(
                    (entry) =>
                      entry &&
                      typeof entry === "object" &&
                      "id" in entry &&
                      (entry as { id?: string }).id === agentId,
                  );
                  if (index < 0) {
                    return;
                  }
                  const basePath = ["agents", "list", index, "model"];
                  if (!modelId) {
                    removeConfigFormValue(state as unknown as ConfigState, basePath);
                    return;
                  }
                  const entry = list[index] as { model?: unknown };
                  const existing = entry?.model;
                  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
                    const fallbacks = (existing as { fallbacks?: unknown }).fallbacks;
                    const next = {
                      primary: modelId,
                      ...(Array.isArray(fallbacks) ? { fallbacks } : {}),
                    };
                    updateConfigFormValue(state as unknown as ConfigState, basePath, next);
                  } else {
                    updateConfigFormValue(state as unknown as ConfigState, basePath, modelId);
                  }
                },
                onModelFallbacksChange: (agentId, fallbacks) => {
                  if (!configValue) {
                    return;
                  }
                  const list = (configValue as { agents?: { list?: unknown[] } }).agents?.list;
                  if (!Array.isArray(list)) {
                    return;
                  }
                  const index = list.findIndex(
                    (entry) =>
                      entry &&
                      typeof entry === "object" &&
                      "id" in entry &&
                      (entry as { id?: string }).id === agentId,
                  );
                  if (index < 0) {
                    return;
                  }
                  const basePath = ["agents", "list", index, "model"];
                  const entry = list[index] as { model?: unknown };
                  const normalized = fallbacks.map((name) => name.trim()).filter(Boolean);
                  const existing = entry.model;
                  const resolvePrimary = () => {
                    if (typeof existing === "string") {
                      return existing.trim() || null;
                    }
                    if (existing && typeof existing === "object" && !Array.isArray(existing)) {
                      const primary = (existing as { primary?: unknown }).primary;
                      if (typeof primary === "string") {
                        const trimmed = primary.trim();
                        return trimmed || null;
                      }
                    }
                    return null;
                  };
                  const primary = resolvePrimary();
                  if (normalized.length === 0) {
                    if (primary) {
                      updateConfigFormValue(state as unknown as ConfigState, basePath, primary);
                    } else {
                      removeConfigFormValue(state as unknown as ConfigState, basePath);
                    }
                    return;
                  }
                  const next = primary
                    ? { primary, fallbacks: normalized }
                    : { fallbacks: normalized };
                  updateConfigFormValue(state as unknown as ConfigState, basePath, next);
                },
              })
            : nothing
        }

        ${
          state.tab === "skills"
            ? renderSkills({
                loading: state.skillsLoading,
                report: state.skillsReport,
                error: state.skillsError,
                filter: state.skillsFilter,
                edits: state.skillEdits,
                messages: state.skillMessages,
                busyKey: state.skillsBusyKey,
                onFilterChange: (next) => (state.skillsFilter = next),
                onRefresh: () => loadSkills(state, { clearMessages: true }),
                onToggle: (key, enabled) => updateSkillEnabled(state, key, enabled),
                onEdit: (key, value) => updateSkillEdit(state, key, value),
                onSaveKey: (key) => saveSkillApiKey(state, key),
                onInstall: (skillKey, name, installId) =>
                  installSkill(state, skillKey, name, installId),
              })
            : nothing
        }

        ${
          state.tab === "nodes"
            ? renderNodes({
                loading: state.nodesLoading,
                nodes: state.nodes,
                devicesLoading: state.devicesLoading,
                devicesError: state.devicesError,
                devicesList: state.devicesList,
                configForm:
                  state.configForm ??
                  (state.configSnapshot?.config as Record<string, unknown> | null),
                configLoading: state.configLoading,
                configSaving: state.configSaving,
                configDirty: state.configFormDirty,
                configFormMode: state.configFormMode,
                execApprovalsLoading: state.execApprovalsLoading,
                execApprovalsSaving: state.execApprovalsSaving,
                execApprovalsDirty: state.execApprovalsDirty,
                execApprovalsSnapshot: state.execApprovalsSnapshot,
                execApprovalsForm: state.execApprovalsForm,
                execApprovalsSelectedAgent: state.execApprovalsSelectedAgent,
                execApprovalsTarget: state.execApprovalsTarget,
                execApprovalsTargetNodeId: state.execApprovalsTargetNodeId,
                onRefresh: () => loadNodes(state),
                onDevicesRefresh: () => loadDevices(state),
                onDeviceApprove: (requestId) => approveDevicePairing(state, requestId),
                onDeviceReject: (requestId) => rejectDevicePairing(state, requestId),
                onDeviceRotate: (deviceId, role, scopes) =>
                  rotateDeviceToken(state, { deviceId, role, scopes }),
                onDeviceRevoke: (deviceId, role) => revokeDeviceToken(state, { deviceId, role }),
                onLoadConfig: () => loadConfig(state as unknown as ConfigState),
                onLoadExecApprovals: () => {
                  const target =
                    state.execApprovalsTarget === "node" && state.execApprovalsTargetNodeId
                      ? { kind: "node" as const, nodeId: state.execApprovalsTargetNodeId }
                      : { kind: "gateway" as const };
                  return loadExecApprovals(state, target);
                },
                onBindDefault: (nodeId) => {
                  if (nodeId) {
                    updateConfigFormValue(
                      state as unknown as ConfigState,
                      ["tools", "exec", "node"],
                      nodeId,
                    );
                  } else {
                    removeConfigFormValue(state as unknown as ConfigState, [
                      "tools",
                      "exec",
                      "node",
                    ]);
                  }
                },
                onBindAgent: (agentIndex, nodeId) => {
                  const basePath = ["agents", "list", agentIndex, "tools", "exec", "node"];
                  if (nodeId) {
                    updateConfigFormValue(state as unknown as ConfigState, basePath, nodeId);
                  } else {
                    removeConfigFormValue(state as unknown as ConfigState, basePath);
                  }
                },
                onSaveBindings: () => saveConfig(state as unknown as ConfigState),
                onExecApprovalsTargetChange: (kind, nodeId) => {
                  state.execApprovalsTarget = kind;
                  state.execApprovalsTargetNodeId = nodeId;
                  state.execApprovalsSnapshot = null;
                  state.execApprovalsForm = null;
                  state.execApprovalsDirty = false;
                  state.execApprovalsSelectedAgent = null;
                },
                onExecApprovalsSelectAgent: (agentId) => {
                  state.execApprovalsSelectedAgent = agentId;
                },
                onExecApprovalsPatch: (path, value) =>
                  updateExecApprovalsFormValue(state, path, value),
                onExecApprovalsRemove: (path) => removeExecApprovalsFormValue(state, path),
                onSaveExecApprovals: () => {
                  const target =
                    state.execApprovalsTarget === "node" && state.execApprovalsTargetNodeId
                      ? { kind: "node" as const, nodeId: state.execApprovalsTargetNodeId }
                      : { kind: "gateway" as const };
                  return saveExecApprovals(state, target);
                },
              })
            : nothing
        }

        ${
          state.tab === "chat"
            ? renderChat({
                sessionKey: state.sessionKey,
                onSessionKeyChange: (next) => {
                  state.sessionKey = next;
                  state.chatMessage = "";
                  state.chatAttachments = [];
                  state.chatStream = null;
                  state.chatRunId = null;
                  (state as unknown as wehelperApp).chatStreamStartedAt = null;
                  state.chatQueue = [];
                  (state as unknown as wehelperApp).resetToolStream();
                  (state as unknown as wehelperApp).resetChatScroll();
                  state.applySettings({
                    ...state.settings,
                    sessionKey: next,
                    lastActiveSessionKey: next,
                  });
                  void state.loadAssistantIdentity();
                  void loadChatHistory(state as unknown as ChatState);
                  void refreshChatAvatar(state as unknown as ChatHost);
                },
                thinkingLevel: state.chatThinkingLevel,
                showThinking,
                loading: state.chatLoading,
                sending: state.chatSending,
                assistantAvatarUrl: chatAvatarUrl,
                messages: state.chatMessages,
                toolMessages: state.chatToolMessages,
                stream: state.chatStream,
                streamStartedAt: null,
                draft: state.chatMessage,
                queue: state.chatQueue,
                connected: state.connected,
                startupLockActive,
                canSend: state.connected,
                disabledReason: chatDisabledReason,
                error: state.lastError,
                sessions: state.sessionsResult,
                focusMode: chatFocus,
                onRefresh: () => {
                  return Promise.all([
                    loadChatHistory(state as unknown as ChatState),
                    refreshChatAvatar(state as unknown as ChatHost),
                  ]);
                },
                onToggleFocusMode: () => {
                  if (state.onboarding) {
                    return;
                  }
                  state.applySettings({
                    ...state.settings,
                    chatFocusMode: !state.settings.chatFocusMode,
                  });
                },
                onChatScroll: (event) => (state as unknown as wehelperApp).handleChatScroll(event),
                onDraftChange: (next) => (state.chatMessage = next),
                attachments: state.chatAttachments,
                onAttachmentsChange: (next) => (state.chatAttachments = next),
                onSend: () => (state as unknown as wehelperApp).handleSendChat(),
                canAbort: Boolean(state.chatRunId),
                onAbort: () => void (state as unknown as wehelperApp).handleAbortChat(),
                onQueueRemove: (id) => (state as unknown as wehelperApp).removeQueuedMessage(id),
                onNewSession: () =>
                  (state as unknown as wehelperApp).handleSendChat("/new", { restoreDraft: true }),
                showNewMessages: state.chatNewMessagesBelow,
                onScrollToBottom: () => state.scrollToBottom(),
                // Sidebar props for tool output viewing
                sidebarOpen: (state as unknown as wehelperApp).sidebarOpen,
                sidebarContent: (state as unknown as wehelperApp).sidebarContent,
                sidebarError: (state as unknown as wehelperApp).sidebarError,
                splitRatio: (state as unknown as wehelperApp).splitRatio,
                onOpenSidebar: (content: string) =>
                  (state as unknown as wehelperApp).handleOpenSidebar(content),
                onCloseSidebar: () => (state as unknown as wehelperApp).handleCloseSidebar(),
                onSplitRatioChange: (ratio: number) =>
                  (state as unknown as wehelperApp).handleSplitRatioChange(ratio),
                assistantName: state.assistantName,
                assistantAvatar: state.assistantAvatar,
              })
            : nothing
        }

        ${
          state.tab === "config"
            ? renderConfig({
                raw: state.configRaw,
                originalRaw: state.configRawOriginal,
                valid: state.configValid,
                issues: state.configIssues,
                loading: state.configLoading,
                saving: state.configSaving,
                applying: state.configApplying,
                updating: state.updateRunning,
                connected: state.connected,
                schema: state.configSchema,
                schemaLoading: state.configSchemaLoading,
                uiHints: state.configUiHints as ConfigUiHints,
                formMode: state.configFormMode,
                formValue: state.configForm,
                originalValue: state.configFormOriginal,
                searchQuery: (state as unknown as wehelperApp).configSearchQuery,
                activeSection: (state as unknown as wehelperApp).configActiveSection,
                activeSubsection: (state as unknown as wehelperApp).configActiveSubsection,
                onRawChange: (next) => {
                  state.configRaw = next;
                },
                onFormModeChange: (mode) => (state.configFormMode = mode),
                onFormPatch: (path, value) =>
                  updateConfigFormValue(state as unknown as wehelperApp, path, value),
                onSearchChange: (query) =>
                  ((state as unknown as wehelperApp).configSearchQuery = query),
                onSectionChange: (section) => {
                  (state as unknown as wehelperApp).configActiveSection = section;
                  (state as unknown as wehelperApp).configActiveSubsection = null;
                },
                onSubsectionChange: (section) =>
                  ((state as unknown as wehelperApp).configActiveSubsection = section),
                onReload: () => loadConfig(state as unknown as wehelperApp),
                onSave: () => saveConfig(state as unknown as wehelperApp),
                onApply: () => applyConfig(state as unknown as wehelperApp),
                onUpdate: () => runUpdate(state as unknown as wehelperApp),
              })
            : nothing
        }

        ${
          state.tab === "providers"
            ? renderProvidersConfig({
                valid: state.configValid,
                issues: state.configIssues,
                loading: state.configLoading,
                saving: state.configSaving,
                applying: state.configApplying,
                updating: state.updateRunning,
                connected: state.connected,
                schema: state.configSchema,
                schemaLoading: state.configSchemaLoading,
                uiHints: state.configUiHints as ConfigUiHints,
                formValue: state.configForm,
                originalValue: state.configFormOriginal,
                filterText: state.providersFilterText,
                selectedId: state.providersSelectedId,
                defaultSupplierId: derivedSupplierDefaultId,
                defaultSupplierMissing,
                defaultSupplierNotice: state.supplierDefaultNotice,
                dialogMode: state.supplierDialogMode,
                dialogTargetId: state.supplierDialogTargetId,
                draftName: state.supplierDraftName,
                draftType: state.supplierDraftType,
                modelDialogMode: state.supplierModelDialogMode,
                modelDialogSupplierId: state.supplierModelDialogSupplierId,
                modelDialogTargetIndex: state.supplierModelDialogTargetIndex,
                modelDraftId: state.supplierModelDraftId,
                modelDraftName: state.supplierModelDraftName,
                modelsManageMode: state.supplierModelsManageMode,
                onFilterChange: (next) => {
                  state.providersFilterText = next;
                },
                onSelectSupplier: (supplierId) => {
                  state.providersSelectedId = supplierId;
                },
                onOpenAddDialog: () => {
                  state.supplierDialogMode = "add";
                  state.supplierDialogTargetId = null;
                  state.supplierDraftName = "";
                  state.supplierDraftType = "openai-compatible";
                },
                onOpenRenameDialog: (supplierId) => {
                  state.supplierDialogMode = "rename";
                  state.supplierDialogTargetId = supplierId;
                  state.supplierDraftName = supplierId;
                },
                onOpenDeleteDialog: (supplierId) => {
                  state.supplierDialogMode = "delete";
                  state.supplierDialogTargetId = supplierId;
                },
                onCloseDialog: () => {
                  state.supplierDialogMode = "none";
                  state.supplierDialogTargetId = null;
                },
                onDraftNameChange: (name) => {
                  state.supplierDraftName = name;
                },
                onDraftTypeChange: (type) => {
                  state.supplierDraftType = type as SupplierPresetType;
                },
                onConfirmAddSupplier: () => {
                  const name = state.supplierDraftName.trim();
                  if (!name) {
                    state.lastError = "供应商名称不能为空";
                    return;
                  }
                  const providers =
                    ((state.configForm?.models as Record<string, unknown> | undefined)?.providers as
                      | Record<string, unknown>
                      | undefined) ?? {};
                  if (Object.prototype.hasOwnProperty.call(providers, name)) {
                    state.lastError = `供应商 "${name}" 已存在`;
                    return;
                  }
                  updateConfigFormValue(
                    state as unknown as wehelperApp,
                    ["models", "providers", name],
                    createSupplierFromPreset(state.supplierDraftType),
                  );
                  state.providersSelectedId = name;
                  state.supplierDialogMode = "none";
                  state.supplierDialogTargetId = null;
                  state.lastError = null;
                },
                onConfirmDeleteSupplier: () => {
                  const supplierId = state.supplierDialogTargetId;
                  if (!supplierId) {
                    return;
                  }
                  removeConfigFormValue(state as unknown as wehelperApp, [
                    "models",
                    "providers",
                    supplierId,
                  ]);
                  if (derivedSupplierDefaultId === supplierId) {
                    updateConfigFormValue(
                      state as unknown as wehelperApp,
                      ["agents", "defaults", "model", "primary"],
                      "",
                    );
                    state.supplierDefaultNotice = "已删除默认供应商，请重新设置默认供应商。";
                  }
                  const remaining = (((
                    state.configForm?.models as Record<string, unknown> | undefined
                  )?.providers as Record<string, unknown> | undefined) ?? {}) as Record<
                    string,
                    unknown
                  >;
                  const nextSelected =
                    Object.keys(remaining).sort((a, b) => a.localeCompare(b))[0] ?? null;
                  state.providersSelectedId = nextSelected;
                  state.supplierDialogMode = "none";
                  state.supplierDialogTargetId = null;
                },
                onConfirmRenameSupplier: () => {
                  const supplierId = state.supplierDialogTargetId;
                  const nextSupplierId = state.supplierDraftName.trim();
                  if (!supplierId) {
                    return;
                  }
                  if (!nextSupplierId) {
                    state.lastError = "供应商名称不能为空";
                    return;
                  }
                  if (supplierId === nextSupplierId) {
                    state.supplierDialogMode = "none";
                    state.supplierDialogTargetId = null;
                    return;
                  }
                  const models =
                    (state.configForm?.models as Record<string, unknown> | undefined) ?? {};
                  const providers = (models.providers as Record<string, unknown> | undefined) ?? {};
                  if (Object.prototype.hasOwnProperty.call(providers, nextSupplierId)) {
                    state.lastError = `供应商 "${nextSupplierId}" 已存在`;
                    return;
                  }
                  const providerValue = providers[supplierId];
                  if (providerValue === undefined) {
                    return;
                  }
                  const nextProviders: Record<string, unknown> = {};
                  for (const key of Object.keys(providers)) {
                    if (key === supplierId) {
                      continue;
                    }
                    nextProviders[key] = providers[key];
                  }
                  nextProviders[nextSupplierId] = providerValue;
                  updateConfigFormValue(
                    state as unknown as wehelperApp,
                    ["models", "providers"],
                    nextProviders,
                  );
                  if (state.providersSelectedId === supplierId) {
                    state.providersSelectedId = nextSupplierId;
                  }

                  const currentPrimaryRef = resolvePrimaryModelRef();
                  if (currentPrimaryRef && currentPrimaryRef.startsWith(`${supplierId}/`)) {
                    const oldModelId = currentPrimaryRef.slice(supplierId.length + 1);
                    const modelIds =
                      (
                        (providerValue as Record<string, unknown>)?.models as
                          | Array<Record<string, unknown>>
                          | undefined
                      )
                        ?.map((item) => (typeof item?.id === "string" ? item.id.trim() : ""))
                        .filter((item) => item.length > 0) ?? [];
                    const resolvedModelId = modelIds.includes(oldModelId)
                      ? oldModelId
                      : (modelIds[0] ?? "");
                    updateConfigFormValue(
                      state as unknown as wehelperApp,
                      ["agents", "defaults", "model", "primary"],
                      resolvedModelId ? `${nextSupplierId}/${resolvedModelId}` : "",
                    );
                  }
                  state.supplierDialogMode = "none";
                  state.supplierDialogTargetId = null;
                  state.lastError = null;
                },
                onSetDefaultSupplier: (supplierId) => {
                  const provider = resolveProviderMap()[supplierId] as
                    | Record<string, unknown>
                    | undefined;
                  const modelIds =
                    (
                      (provider as Record<string, unknown> | undefined)?.models as
                        | Array<Record<string, unknown>>
                        | undefined
                    )
                      ?.map((item) => (typeof item?.id === "string" ? item.id.trim() : ""))
                      .filter((item) => item.length > 0) ?? [];
                  const firstModelId = modelIds[0];
                  if (!firstModelId) {
                    state.lastError = "请先为该供应商配置至少一个模型";
                    return;
                  }
                  updateConfigFormValue(
                    state as unknown as wehelperApp,
                    ["agents", "defaults", "model", "primary"],
                    `${supplierId}/${firstModelId}`,
                  );
                  state.supplierDefaultId = supplierId;
                  state.supplierDefaultNotice = null;
                  state.lastError = null;
                },
                onFocusDefaultSupplier: () => {
                  const providers = resolveProviderMap();
                  const supplierIds = Object.keys(providers).sort((a, b) => a.localeCompare(b));
                  if (
                    state.providersSelectedId &&
                    supplierIds.includes(state.providersSelectedId)
                  ) {
                    return;
                  }
                  state.providersSelectedId = supplierIds[0] ?? null;
                },
                onDismissDefaultSupplierNotice: () => {
                  state.supplierDefaultNotice = null;
                },
                onOpenAddModelDialog: (supplierId) => {
                  state.supplierModelDialogMode = "add";
                  state.supplierModelDialogSupplierId = supplierId;
                  state.supplierModelDialogTargetIndex = null;
                  state.supplierModelDraftId = "";
                  state.supplierModelDraftName = "";
                },
                onOpenEditModelDialog: (supplierId, index) => {
                  const models = resolveProviderModels(supplierId);
                  const model = models[index] ?? null;
                  state.supplierModelDialogMode = "edit";
                  state.supplierModelDialogSupplierId = supplierId;
                  state.supplierModelDialogTargetIndex = index;
                  state.supplierModelDraftId = typeof model?.id === "string" ? model.id : "";
                  state.supplierModelDraftName = typeof model?.name === "string" ? model.name : "";
                },
                onOpenDeleteModelDialog: (supplierId, index) => {
                  const models = resolveProviderModels(supplierId);
                  const model = models[index] ?? null;
                  state.supplierModelDialogMode = "delete";
                  state.supplierModelDialogSupplierId = supplierId;
                  state.supplierModelDialogTargetIndex = index;
                  state.supplierModelDraftId = typeof model?.id === "string" ? model.id : "";
                  state.supplierModelDraftName = typeof model?.name === "string" ? model.name : "";
                },
                onCloseModelDialog: () => {
                  state.supplierModelDialogMode = "none";
                  state.supplierModelDialogSupplierId = null;
                  state.supplierModelDialogTargetIndex = null;
                },
                onModelDraftIdChange: (value) => {
                  state.supplierModelDraftId = value;
                },
                onModelDraftNameChange: (value) => {
                  state.supplierModelDraftName = value;
                },
                onConfirmAddModel: () => {
                  const supplierId = state.supplierModelDialogSupplierId;
                  if (!supplierId) {
                    return;
                  }
                  const nextId = state.supplierModelDraftId.trim();
                  const nextName = state.supplierModelDraftName.trim() || nextId;
                  if (!nextId) {
                    state.lastError = "模型 ID 不能为空";
                    return;
                  }
                  const models = resolveProviderModels(supplierId);
                  if (
                    models.some(
                      (model) => typeof model.id === "string" && model.id.trim() === nextId,
                    )
                  ) {
                    state.lastError = `模型 ID "${nextId}" 已存在`;
                    return;
                  }
                  const nextModels = [...models, { id: nextId, name: nextName }];
                  updateConfigFormValue(
                    state as unknown as wehelperApp,
                    ["models", "providers", supplierId, "models"],
                    nextModels,
                  );
                  state.supplierModelDialogMode = "none";
                  state.supplierModelDialogSupplierId = null;
                  state.supplierModelDialogTargetIndex = null;
                  state.lastError = null;
                },
                onConfirmEditModel: () => {
                  const supplierId = state.supplierModelDialogSupplierId;
                  const targetIndex = state.supplierModelDialogTargetIndex;
                  if (!supplierId || targetIndex == null) {
                    return;
                  }
                  const models = resolveProviderModels(supplierId);
                  const current = models[targetIndex];
                  if (!current) {
                    return;
                  }
                  const nextId = state.supplierModelDraftId.trim();
                  const nextName = state.supplierModelDraftName.trim() || nextId;
                  if (!nextId) {
                    state.lastError = "模型 ID 不能为空";
                    return;
                  }
                  const duplicated = models.some(
                    (model, index) =>
                      index !== targetIndex &&
                      typeof model.id === "string" &&
                      model.id.trim() === nextId,
                  );
                  if (duplicated) {
                    state.lastError = `模型 ID "${nextId}" 已存在`;
                    return;
                  }
                  const currentId = typeof current.id === "string" ? current.id.trim() : "";
                  const nextModels = models.map((model, index) =>
                    index === targetIndex
                      ? ({ ...model, id: nextId, name: nextName } as Record<string, unknown>)
                      : model,
                  );
                  updateConfigFormValue(
                    state as unknown as wehelperApp,
                    ["models", "providers", supplierId, "models"],
                    nextModels,
                  );

                  const currentPrimaryRef = resolvePrimaryModelRef();
                  if (currentId && currentPrimaryRef === `${supplierId}/${currentId}`) {
                    updateConfigFormValue(
                      state as unknown as wehelperApp,
                      ["agents", "defaults", "model", "primary"],
                      `${supplierId}/${nextId}`,
                    );
                  }
                  state.supplierModelDialogMode = "none";
                  state.supplierModelDialogSupplierId = null;
                  state.supplierModelDialogTargetIndex = null;
                  state.lastError = null;
                },
                onConfirmDeleteModel: () => {
                  const supplierId = state.supplierModelDialogSupplierId;
                  const targetIndex = state.supplierModelDialogTargetIndex;
                  if (!supplierId || targetIndex == null) {
                    return;
                  }
                  const models = resolveProviderModels(supplierId);
                  const current = models[targetIndex];
                  if (!current) {
                    return;
                  }
                  const currentId = typeof current.id === "string" ? current.id.trim() : "";
                  const nextModels = models.filter((_, index) => index !== targetIndex);
                  updateConfigFormValue(
                    state as unknown as wehelperApp,
                    ["models", "providers", supplierId, "models"],
                    nextModels,
                  );

                  const currentPrimaryRef = resolvePrimaryModelRef();
                  if (currentId && currentPrimaryRef === `${supplierId}/${currentId}`) {
                    const fallback = nextModels
                      .map((model) => (typeof model.id === "string" ? model.id.trim() : ""))
                      .find((id) => id.length > 0);
                    updateConfigFormValue(
                      state as unknown as wehelperApp,
                      ["agents", "defaults", "model", "primary"],
                      fallback ? `${supplierId}/${fallback}` : "",
                    );
                    if (!fallback) {
                      state.lastError = "默认模型已删除，请重新选择默认供应商";
                    }
                  }

                  state.supplierModelDialogMode = "none";
                  state.supplierModelDialogSupplierId = null;
                  state.supplierModelDialogTargetIndex = null;
                },
                onToggleModelsManageMode: (mode) => {
                  state.supplierModelsManageMode = mode;
                },
                onFormPatch: (path, value) =>
                  updateConfigFormValue(state as unknown as wehelperApp, path, value),
                onReload: () => loadConfig(state as unknown as wehelperApp),
                onSave: () => saveConfig(state as unknown as wehelperApp),
                onApply: () => applyConfig(state as unknown as wehelperApp),
                onUpdate: () => runUpdate(state as unknown as wehelperApp),
              })
            : nothing
        }

        ${
          state.tab === "debug"
            ? renderDebug({
                loading: state.debugLoading,
                status: state.debugStatus,
                health: state.debugHealth,
                models: state.debugModels,
                heartbeat: state.debugHeartbeat,
                eventLog: state.eventLog,
                callMethod: state.debugCallMethod,
                callParams: state.debugCallParams,
                callResult: state.debugCallResult,
                callError: state.debugCallError,
                onCallMethodChange: (next) => (state.debugCallMethod = next),
                onCallParamsChange: (next) => (state.debugCallParams = next),
                onRefresh: () => loadDebug(state),
                onCall: () => callDebugMethod(state),
              })
            : nothing
        }

        ${
          state.tab === "logs"
            ? renderLogs({
                loading: state.logsLoading,
                error: state.logsError,
                file: state.logsFile,
                entries: state.logsEntries,
                filterText: state.logsFilterText,
                levelFilters: state.logsLevelFilters,
                autoFollow: state.logsAutoFollow,
                truncated: state.logsTruncated,
                onFilterTextChange: (next) => (state.logsFilterText = next),
                onLevelToggle: (level, enabled) => {
                  state.logsLevelFilters = { ...state.logsLevelFilters, [level]: enabled };
                },
                onToggleAutoFollow: (next) => (state.logsAutoFollow = next),
                onRefresh: () => loadLogs(state as unknown as LogsState, { reset: true }),
                onExport: (lines, label) =>
                  (state as unknown as wehelperApp).exportLogs(lines, label),
                onScroll: (event) => (state as unknown as wehelperApp).handleLogsScroll(event),
              })
            : nothing
        }
      </main>
      ${renderExecApprovalPrompt(state)}
      ${renderGatewayUrlConfirmation(state)}
    </div>
  `;
}
