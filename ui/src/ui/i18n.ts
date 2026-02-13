export type UiLocale = "en" | "zh";

type GlobalWithLocale = typeof globalThis & {
  OPENCLAW_UI_LOCALE?: string;
  OPENCLAW_LOCALE?: string;
};

function normalizeLocale(raw: string | undefined | null): string {
  return String(raw || "")
    .trim()
    .toLowerCase();
}

export function resolveLocale(): string {
  const globals = globalThis as GlobalWithLocale;
  const override = normalizeLocale(globals.OPENCLAW_UI_LOCALE || globals.OPENCLAW_LOCALE);
  if (override) {
    return override;
  }
  if (typeof location !== "undefined") {
    const localeFromQuery = normalizeLocale(new URLSearchParams(location.search).get("locale"));
    if (localeFromQuery) {
      return localeFromQuery;
    }
  }
  if (typeof navigator !== "undefined") {
    const nav = normalizeLocale(navigator.language);
    if (nav) {
      return nav;
    }
  }
  return "en";
}

export function isZh(): boolean {
  return resolveLocale().startsWith("zh");
}

export function t(en: string, zh: string): string {
  return isZh() ? zh : en;
}
