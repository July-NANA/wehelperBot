import type { enUS } from "./en-US.ts";
import type { zhCN } from "./zh-CN.ts";

export type I18nMessages = typeof enUS;
export type I18nKey = keyof I18nMessages;

// Ensure zh-CN and en-US keep identical key shape at compile time.
const _zhShapeCheck: Record<I18nKey, string> = zhCN;
void _zhShapeCheck;
