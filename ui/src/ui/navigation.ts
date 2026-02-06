import type { IconName } from "./icons.js";
import { t } from "./i18n.ts";

export const TAB_GROUPS = [
  { label: t("Chat", "对话"), tabs: ["chat"] },
  {
    label: t("Control", "控制"),
    tabs: ["overview", "channels", "wecom", "instances", "sessions", "cron"],
  },
  { label: t("Agent", "助手"), tabs: ["agents", "skills", "nodes"] },
  { label: t("Settings", "设置"), tabs: ["config", "debug", "logs"] },
] as const;

export type Tab =
  | "agents"
  | "overview"
  | "channels"
  | "wecom"
  | "instances"
  | "sessions"
  | "cron"
  | "skills"
  | "nodes"
  | "chat"
  | "config"
  | "debug"
  | "logs";

const TAB_PATHS: Record<Tab, string> = {
  agents: "/agents",
  overview: "/overview",
  channels: "/channels",
  wecom: "/wecom",
  instances: "/instances",
  sessions: "/sessions",
  cron: "/cron",
  skills: "/skills",
  nodes: "/nodes",
  chat: "/chat",
  config: "/config",
  debug: "/debug",
  logs: "/logs",
};

const PATH_TO_TAB = new Map(Object.entries(TAB_PATHS).map(([tab, path]) => [path, tab as Tab]));

export function normalizeBasePath(basePath: string): string {
  if (!basePath) {
    return "";
  }
  let base = basePath.trim();
  if (!base.startsWith("/")) {
    base = `/${base}`;
  }
  if (base === "/") {
    return "";
  }
  if (base.endsWith("/")) {
    base = base.slice(0, -1);
  }
  return base;
}

export function normalizePath(path: string): string {
  if (!path) {
    return "/";
  }
  let normalized = path.trim();
  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

export function pathForTab(tab: Tab, basePath = ""): string {
  const base = normalizeBasePath(basePath);
  const path = TAB_PATHS[tab];
  return base ? `${base}${path}` : path;
}

export function tabFromPath(pathname: string, basePath = ""): Tab | null {
  const base = normalizeBasePath(basePath);
  let path = pathname || "/";
  if (base) {
    if (path === base) {
      path = "/";
    } else if (path.startsWith(`${base}/`)) {
      path = path.slice(base.length);
    }
  }
  let normalized = normalizePath(path).toLowerCase();
  if (normalized.endsWith("/index.html")) {
    normalized = "/";
  }
  if (normalized === "/") {
    return "chat";
  }
  return PATH_TO_TAB.get(normalized) ?? null;
}

export function inferBasePathFromPathname(pathname: string): string {
  let normalized = normalizePath(pathname);
  if (normalized.endsWith("/index.html")) {
    normalized = normalizePath(normalized.slice(0, -"/index.html".length));
  }
  if (normalized === "/") {
    return "";
  }
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0) {
    return "";
  }
  for (let i = 0; i < segments.length; i++) {
    const candidate = `/${segments.slice(i).join("/")}`.toLowerCase();
    if (PATH_TO_TAB.has(candidate)) {
      const prefix = segments.slice(0, i);
      return prefix.length ? `/${prefix.join("/")}` : "";
    }
  }
  return `/${segments.join("/")}`;
}

export function iconForTab(tab: Tab): IconName {
  switch (tab) {
    case "agents":
      return "folder";
    case "chat":
      return "messageSquare";
    case "overview":
      return "barChart";
    case "channels":
      return "link";
    case "wecom":
      return "messageSquare";
    case "instances":
      return "radio";
    case "sessions":
      return "fileText";
    case "cron":
      return "loader";
    case "skills":
      return "zap";
    case "nodes":
      return "monitor";
    case "config":
      return "settings";
    case "debug":
      return "bug";
    case "logs":
      return "scrollText";
    default:
      return "folder";
  }
}

export function titleForTab(tab: Tab) {
  switch (tab) {
    case "agents":
      return t("Agents", "助手");
    case "overview":
      return t("Overview", "概览");
    case "channels":
      return t("Channels", "通道");
    case "wecom":
      return t("WeCom KF", "微信客服");
    case "instances":
      return t("Instances", "实例");
    case "sessions":
      return t("Sessions", "会话");
    case "cron":
      return t("Cron Jobs", "定时任务");
    case "skills":
      return t("Skills", "技能");
    case "nodes":
      return t("Nodes", "节点");
    case "chat":
      return t("Chat", "对话");
    case "config":
      return t("Config", "配置");
    case "debug":
      return t("Debug", "调试");
    case "logs":
      return t("Logs", "日志");
    default:
      return t("Control", "控制");
  }
}

export function subtitleForTab(tab: Tab) {
  switch (tab) {
    case "agents":
      return t("Manage agent workspaces, tools, and identities.", "管理助手工作区、工具与身份。");
    case "overview":
      return t(
        "Gateway status, entry points, and a fast health read.",
        "网关状态、入口与快速健康检查。",
      );
    case "channels":
      return t("Manage channels and settings.", "管理通道与设置。");
    case "wecom":
      return t(
        "Configure WeCom customer service callback and tunnel.",
        "配置微信客服回调与公网隧道。",
      );
    case "instances":
      return t(
        "Presence beacons from connected clients and nodes.",
        "来自已连接客户端与节点的在线信标。",
      );
    case "sessions":
      return t(
        "Inspect active sessions and adjust per-session defaults.",
        "查看会话并调整会话默认值。",
      );
    case "cron":
      return t("Schedule wakeups and recurring agent runs.", "设置唤醒与周期性运行。");
    case "skills":
      return t(
        "Manage skill availability and API key injection.",
        "管理技能可用性与 API Key 注入。",
      );
    case "nodes":
      return t(
        "Paired devices, capabilities, and command exposure.",
        "已配对设备、能力与命令暴露。",
      );
    case "chat":
      return t(
        "Direct gateway chat session for quick interventions.",
        "网关直连对话，用于快速干预。",
      );
    case "config":
      return t("Edit ~/.openclaw/openclaw.json safely.", "安全编辑 ~/.openclaw/openclaw.json。");
    case "debug":
      return t(
        "Gateway snapshots, events, and manual RPC calls.",
        "网关快照、事件与手动 RPC 调用。",
      );
    case "logs":
      return t("Live tail of the gateway file logs.", "网关日志实时追踪。");
    default:
      return "";
  }
}
