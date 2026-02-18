import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tab } from "./navigation.ts";
import { applySettingsFromUrl, setTabFromRoute } from "./app-settings.ts";

declare global {
  interface Window {
    __OPENCLAW_DESKTOP_BOOTSTRAP__?: {
      gatewayUrl: string;
      token?: string;
      startupLock: boolean;
      basePath?: string;
    };
  }
}

type SettingsHost = Parameters<typeof setTabFromRoute>[0] & {
  logsPollInterval: number | null;
  debugPollInterval: number | null;
};

const createHost = (tab: Tab): SettingsHost => ({
  settings: {
    gatewayUrl: "",
    token: "",
    sessionKey: "main",
    lastActiveSessionKey: "main",
    theme: "system",
    chatFocusMode: false,
    chatShowThinking: true,
    splitRatio: 0.6,
    navCollapsed: false,
    navGroupsCollapsed: {},
  },
  theme: "system",
  themeResolved: "dark",
  applySessionKey: "main",
  sessionKey: "main",
  tab,
  connected: false,
  chatHasAutoScrolled: false,
  logsAtBottom: false,
  eventLog: [],
  eventLogBuffer: [],
  basePath: "",
  themeMedia: null,
  themeMediaHandler: null,
  logsPollInterval: null,
  debugPollInterval: null,
});

describe("setTabFromRoute", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    window.__OPENCLAW_DESKTOP_BOOTSTRAP__ = undefined;
    vi.useRealTimers();
  });

  it("starts and stops log polling based on the tab", () => {
    const host = createHost("chat");

    setTabFromRoute(host, "logs");
    expect(host.logsPollInterval).not.toBeNull();
    expect(host.debugPollInterval).toBeNull();

    setTabFromRoute(host, "chat");
    expect(host.logsPollInterval).toBeNull();
  });

  it("starts and stops debug polling based on the tab", () => {
    const host = createHost("chat");

    setTabFromRoute(host, "debug");
    expect(host.debugPollInterval).not.toBeNull();
    expect(host.logsPollInterval).toBeNull();

    setTabFromRoute(host, "chat");
    expect(host.debugPollInterval).toBeNull();
  });

  it("applies desktop bootstrap gateway settings without pending confirmation", () => {
    const host = createHost("chat");
    const bootstrap = {
      gatewayUrl: "ws://127.0.0.1:19090",
      token: "desktop-token",
      startupLock: true,
      basePath: "/",
    };

    window.__OPENCLAW_DESKTOP_BOOTSTRAP__ = bootstrap;
    applySettingsFromUrl(host);

    expect(host.settings.gatewayUrl).toBe("ws://127.0.0.1:19090");
    expect(host.settings.token).toBe("desktop-token");
    expect(host.pendingGatewayUrl ?? null).toBeNull();
  });
});
