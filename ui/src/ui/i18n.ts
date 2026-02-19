import type { I18nKey } from "./locales/types.ts";
import { enUS } from "./locales/en-US.ts";
import { zhCN } from "./locales/zh-CN.ts";

export type UiLocale = "zh-CN" | "en-US";

type GlobalWithLocale = typeof globalThis & {
  OPENCLAW_UI_LOCALE?: string;
  OPENCLAW_LOCALE?: string;
  lingshiDesktop?: {
    desktopBootstrap?: {
      locale?: string;
    };
  };
  wehelperDesktop?: {
    desktopBootstrap?: {
      locale?: string;
    };
  };
  __OPENCLAW_DESKTOP_BOOTSTRAP__?: {
    locale?: string;
  };
};

function normalizeLocaleTag(raw: string | undefined | null): UiLocale | null {
  const locale = String(raw || "")
    .trim()
    .replace(/_/g, "-")
    .toLowerCase();

  if (!locale) {
    return null;
  }
  if (locale.startsWith("zh")) {
    return "zh-CN";
  }
  if (locale.startsWith("en")) {
    return "en-US";
  }
  return null;
}

export function resolveLocale(): UiLocale {
  const globals = globalThis as GlobalWithLocale;

  const desktopRaw =
    globals.__OPENCLAW_DESKTOP_BOOTSTRAP__?.locale ||
    globals.lingshiDesktop?.desktopBootstrap?.locale ||
    globals.wehelperDesktop?.desktopBootstrap?.locale;
  const desktopLocale = normalizeLocaleTag(desktopRaw);
  if (desktopLocale) {
    return desktopLocale;
  }
  if (String(desktopRaw || "").trim().length > 0) {
    return "zh-CN";
  }

  const overrideRaw = globals.OPENCLAW_UI_LOCALE || globals.OPENCLAW_LOCALE;
  const override = normalizeLocaleTag(overrideRaw);
  if (override) {
    return override;
  }
  if (String(overrideRaw || "").trim().length > 0) {
    return "zh-CN";
  }

  if (typeof location !== "undefined") {
    const localeFromQuery = normalizeLocaleTag(new URLSearchParams(location.search).get("locale"));
    if (localeFromQuery) {
      return localeFromQuery;
    }
  }

  if (typeof navigator !== "undefined") {
    const nav = normalizeLocaleTag(navigator.language);
    if (nav) {
      return nav;
    }
  }

  return "zh-CN";
}

export function isZh(): boolean {
  return resolveLocale() === "zh-CN";
}

function formatTemplate(message: string, params?: Record<string, string | number>): string {
  if (!params) {
    return message;
  }
  return message.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    if (!(key in params)) {
      return match;
    }
    return String(params[key]);
  });
}

export function tr(key: I18nKey, params?: Record<string, string | number>): string {
  const locale = resolveLocale();
  const dict = locale === "zh-CN" ? zhCN : enUS;
  const fallback = locale === "zh-CN" ? enUS : zhCN;
  const message = dict[key] ?? fallback[key] ?? key;
  return formatTemplate(message, params);
}

// Backward-compatible helper kept during P4 transition.
export function t(en: string, zh: string): string {
  return isZh() ? zh : en;
}
