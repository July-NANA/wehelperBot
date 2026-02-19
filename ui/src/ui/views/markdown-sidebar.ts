import { html } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { t } from "../i18n.ts";
import { icons } from "../icons.ts";
import { toSanitizedMarkdownHtml } from "../markdown.ts";

export type MarkdownSidebarProps = {
  content: string | null;
  error: string | null;
  onClose: () => void;
  onViewRawText: () => void;
};

export function renderMarkdownSidebar(props: MarkdownSidebarProps) {
  return html`
    <div class="sidebar-panel">
      <div class="sidebar-header">
        <div class="sidebar-title">${t("Tool Output", "工具输出")}</div>
        <button @click=${props.onClose} class="btn" title=${t("Close sidebar", "关闭侧栏")}>
          ${icons.x}
        </button>
      </div>
      <div class="sidebar-content">
        ${
          props.error
            ? html`
              <div class="callout danger">${props.error}</div>
              <button @click=${props.onViewRawText} class="btn" style="margin-top: 12px;">
                ${t("View Raw Text", "查看原始文本")}
              </button>
            `
            : props.content
              ? html`<div class="sidebar-markdown">${unsafeHTML(toSanitizedMarkdownHtml(props.content))}</div>`
              : html`
                  <div class="muted">${t("No content available", "暂无内容")}</div>
                `
        }
      </div>
    </div>
  `;
}
