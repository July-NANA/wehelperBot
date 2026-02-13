import { html, nothing } from "lit";
import type { ConfigUiHints } from "../types.ts";
import { t } from "../i18n.ts";
import { analyzeConfigSchema, renderNode, schemaType, type JsonSchema } from "./config-form.ts";
import { SUPPLIER_PRESETS, type SupplierPresetType } from "./supplier-presets.ts";

export type SupplierDialogMode = "none" | "add" | "rename" | "delete";
export type SupplierModelDialogMode = "none" | "add" | "edit" | "delete";

type ModelEntry = {
  id: string;
  name: string;
  raw: Record<string, unknown>;
};

export type ProvidersConfigProps = {
  valid: boolean | null;
  issues: unknown[];
  loading: boolean;
  saving: boolean;
  applying: boolean;
  updating: boolean;
  connected: boolean;
  schema: unknown;
  schemaLoading: boolean;
  uiHints: ConfigUiHints;
  formValue: Record<string, unknown> | null;
  originalValue: Record<string, unknown> | null;
  filterText: string;
  selectedId: string | null;
  defaultSupplierId: string | null;
  defaultSupplierMissing: boolean;
  defaultSupplierNotice: string | null;
  dialogMode: SupplierDialogMode;
  dialogTargetId: string | null;
  draftName: string;
  draftType: SupplierPresetType;
  modelDialogMode: SupplierModelDialogMode;
  modelDialogSupplierId: string | null;
  modelDialogTargetIndex: number | null;
  modelDraftId: string;
  modelDraftName: string;
  modelsManageMode: "simple" | "advanced";
  onFilterChange: (query: string) => void;
  onSelectSupplier: (supplierId: string) => void;
  onOpenAddDialog: () => void;
  onOpenRenameDialog: (supplierId: string) => void;
  onOpenDeleteDialog: (supplierId: string) => void;
  onCloseDialog: () => void;
  onDraftNameChange: (name: string) => void;
  onDraftTypeChange: (type: SupplierPresetType) => void;
  onConfirmAddSupplier: () => void;
  onConfirmRenameSupplier: () => void;
  onConfirmDeleteSupplier: () => void;
  onSetDefaultSupplier: (supplierId: string) => void;
  onFocusDefaultSupplier: () => void;
  onDismissDefaultSupplierNotice: () => void;
  onOpenAddModelDialog: (supplierId: string) => void;
  onOpenEditModelDialog: (supplierId: string, index: number) => void;
  onOpenDeleteModelDialog: (supplierId: string, index: number) => void;
  onCloseModelDialog: () => void;
  onModelDraftIdChange: (value: string) => void;
  onModelDraftNameChange: (value: string) => void;
  onConfirmAddModel: () => void;
  onConfirmEditModel: () => void;
  onConfirmDeleteModel: () => void;
  onToggleModelsManageMode: (mode: "simple" | "advanced") => void;
  onFormPatch: (path: Array<string | number>, value: unknown) => void;
  onReload: () => void;
  onSave: () => void;
  onApply: () => void;
  onUpdate: () => void;
};

type SupplierSummary = {
  supplierCount: number;
  modelCount: number;
  primaryModel: string;
  imageModel: string;
  supplierIds: string[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function resolveSupplierSchema(schema: JsonSchema | null): JsonSchema | null {
  if (!schema || schemaType(schema) !== "object") {
    return null;
  }
  const models = schema.properties?.models;
  if (!models || schemaType(models) !== "object") {
    return null;
  }
  const suppliers = models.properties?.providers;
  if (!suppliers || schemaType(suppliers) !== "object") {
    return null;
  }
  if (suppliers.additionalProperties && typeof suppliers.additionalProperties === "object") {
    return suppliers.additionalProperties;
  }
  return null;
}

function resolveModelItemSchema(supplierSchema: JsonSchema | null): JsonSchema | null {
  if (!supplierSchema || schemaType(supplierSchema) !== "object") {
    return null;
  }
  const modelsNode = supplierSchema.properties?.models;
  if (!modelsNode || schemaType(modelsNode) !== "array") {
    return null;
  }
  if (
    modelsNode.items &&
    typeof modelsNode.items === "object" &&
    !Array.isArray(modelsNode.items)
  ) {
    return modelsNode.items as JsonSchema;
  }
  return null;
}

function getSupplierModels(supplierValue: unknown): ModelEntry[] {
  const supplier = asRecord(supplierValue);
  const models = supplier?.models;
  if (!Array.isArray(models)) {
    return [];
  }
  const entries: ModelEntry[] = [];
  for (const item of models) {
    const record = asRecord(item) ?? {};
    const id = typeof record.id === "string" ? record.id.trim() : "";
    const name = typeof record.name === "string" ? record.name.trim() : "";
    if (!id) {
      continue;
    }
    entries.push({
      id,
      name: name || id,
      raw: record,
    });
  }
  return entries;
}

function resolveSummary(formValue: Record<string, unknown> | null): SupplierSummary {
  const models = asRecord(formValue?.models);
  const suppliers = asRecord(models?.providers);
  const supplierIds = suppliers ? Object.keys(suppliers).sort((a, b) => a.localeCompare(b)) : [];
  let modelCount = 0;
  for (const supplierId of supplierIds) {
    modelCount += getSupplierModels(suppliers?.[supplierId]).length;
  }

  const agents = asRecord(formValue?.agents);
  const defaults = asRecord(agents?.defaults);
  const model = asRecord(defaults?.model);
  const imageModel = asRecord(defaults?.imageModel);

  return {
    supplierCount: supplierIds.length,
    modelCount,
    primaryModel:
      typeof model?.primary === "string" && model.primary.trim() ? model.primary.trim() : "-",
    imageModel:
      typeof imageModel?.primary === "string" && imageModel.primary.trim()
        ? imageModel.primary.trim()
        : "-",
    supplierIds,
  };
}

function hasFormChanges(
  current: Record<string, unknown> | null,
  original: Record<string, unknown> | null,
): boolean {
  if (!current || !original) {
    return false;
  }
  try {
    return JSON.stringify(current) !== JSON.stringify(original);
  } catch {
    return false;
  }
}

function renderSupplierField(props: {
  title: string;
  value: string;
  placeholder: string;
  onChange: (next: string) => void;
  secret?: boolean;
  disabled?: boolean;
}) {
  return html`
    <label class="sup-field">
      <span>${props.title}</span>
      <input
        type=${props.secret ? "password" : "text"}
        .value=${props.value}
        placeholder=${props.placeholder}
        ?disabled=${props.disabled}
        @input=${(event: Event) => props.onChange((event.target as HTMLInputElement).value)}
      />
    </label>
  `;
}

export function renderProvidersConfig(props: ProvidersConfigProps) {
  const validity = props.valid == null ? "unknown" : props.valid ? "valid" : "invalid";
  const summary = resolveSummary(props.formValue);
  const analysis = analyzeConfigSchema(props.schema);
  const supplierSchema = resolveSupplierSchema(analysis.schema);
  const modelItemSchema = resolveModelItemSchema(supplierSchema);
  const unsupported = new Set(analysis.unsupportedPaths);
  const suppliers = asRecord(asRecord(props.formValue?.models)?.providers);
  const normalizedFilter = props.filterText.trim().toLowerCase();
  const filteredIds = summary.supplierIds.filter(
    (id) => !normalizedFilter || id.toLowerCase().includes(normalizedFilter),
  );
  const selectedId =
    props.selectedId && summary.supplierIds.includes(props.selectedId)
      ? props.selectedId
      : (filteredIds[0] ?? null);
  const selectedValue = selectedId ? suppliers?.[selectedId] : null;
  const selectedRecord = asRecord(selectedValue);
  const selectedModels = getSupplierModels(selectedValue);

  const hasChanges = hasFormChanges(props.formValue, props.originalValue);
  const canSave = props.connected && !props.saving && hasChanges;
  const canApply = props.connected && !props.applying && !props.updating && hasChanges;
  const canUpdate = props.connected && !props.applying && !props.updating;
  const supplierApi =
    typeof selectedRecord?.api === "string" && selectedRecord.api.trim()
      ? selectedRecord.api.trim()
      : "openai-completions";

  const showSupplierDialog = props.dialogMode !== "none";
  const showModelDialog = props.modelDialogMode !== "none";

  return html`
    <section class="providers-page">
      <div class="providers-hero">
        <div>
          <h2>${t("Supplier Console", "供应商控制台")}</h2>
          <p>
            ${t(
              "Manage suppliers, credentials, and model mappings in one workspace.",
              "在一个工作区管理供应商、密钥与模型映射。",
            )}
          </p>
        </div>
        <span
          class="pill pill--sm ${
            validity === "valid" ? "pill--ok" : validity === "invalid" ? "pill--danger" : ""
          }"
        >
          ${validity}
        </span>
      </div>

      ${
        props.defaultSupplierMissing
          ? html`
              <div class="providers-default-callout callout warn">
                <div>
                  <strong>${t("Default supplier is not set.", "默认供应商未设置。")}</strong>
                  <div class="muted">
                    ${t(
                      "Please select a supplier and set it as default before running agents.",
                      "请先选择一个供应商并设为默认后再运行智能体。",
                    )}
                  </div>
                </div>
                <button class="btn btn--sm" @click=${props.onFocusDefaultSupplier}>
                  ${t("Set default now", "去设置默认供应商")}
                </button>
              </div>
            `
          : nothing
      }

      ${
        props.defaultSupplierNotice
          ? html`
              <div class="providers-default-callout callout warn">
                <div>${props.defaultSupplierNotice}</div>
                <button class="btn btn--sm" @click=${props.onDismissDefaultSupplierNotice}>
                  ${t("Got it", "我知道了")}
                </button>
              </div>
            `
          : nothing
      }

      <div class="providers-kpi-grid">
        <article class="providers-kpi-card">
          <div class="providers-kpi-card__label">${t("Suppliers", "供应商数量")}</div>
          <div class="providers-kpi-card__value mono">${summary.supplierCount}</div>
        </article>
        <article class="providers-kpi-card">
          <div class="providers-kpi-card__label">${t("Models", "模型数量")}</div>
          <div class="providers-kpi-card__value mono">${summary.modelCount}</div>
        </article>
        <article class="providers-kpi-card">
          <div class="providers-kpi-card__label">${t("Primary Model", "主模型")}</div>
          <div class="providers-kpi-card__value mono">${summary.primaryModel}</div>
        </article>
        <article class="providers-kpi-card">
          <div class="providers-kpi-card__label">${t("Image Model", "图像模型")}</div>
          <div class="providers-kpi-card__value mono">${summary.imageModel}</div>
        </article>
      </div>

      <div class="sup-workbench">
        <aside class="sup-list-pane">
          <div class="sup-list-pane__header">
            <h3>${t("Supplier List", "供应商列表")}</h3>
            <button class="btn btn--sm" @click=${props.onOpenAddDialog}>
              ${t("Add Supplier", "新增供应商")}
            </button>
          </div>
          <label class="sup-filter">
            <span>${t("Search", "搜索")}</span>
            <input
              type="text"
              .value=${props.filterText}
              placeholder=${t("Search supplier id", "搜索供应商 ID")}
              @input=${(event: Event) =>
                props.onFilterChange((event.target as HTMLInputElement).value)}
            />
          </label>
          <div class="sup-list">
            ${
              filteredIds.length === 0
                ? html`<div class="sup-list__empty">${t("No suppliers", "暂无供应商")}</div>`
                : filteredIds.map((supplierId) => {
                    const modelCount = getSupplierModels(suppliers?.[supplierId]).length;
                    const isSelected = supplierId === selectedId;
                    const isDefault = supplierId === props.defaultSupplierId;
                    return html`
                      <button
                        class="sup-list__item ${isSelected ? "active" : ""}"
                        @click=${() => props.onSelectSupplier(supplierId)}
                      >
                        <div class="sup-list__item-main">
                          <div class="sup-list__item-title mono">${supplierId}</div>
                          <div class="sup-list__item-sub muted">
                            ${t("Models", "模型")}: ${modelCount}
                          </div>
                        </div>
                        ${
                          isDefault
                            ? html`<span class="pill pill--sm pill--ok">${t("Default", "默认")}</span>`
                            : nothing
                        }
                      </button>
                    `;
                  })
            }
          </div>
        </aside>

        <section class="sup-detail-pane">
          ${
            !selectedId || !selectedRecord
              ? html`<div class="providers-empty">${t("Select a supplier to edit.", "请选择一个供应商后再编辑。")}</div>`
              : html`
                  <div class="sup-detail-header">
                    <div>
                      <h3 class="mono">${selectedId}</h3>
                      <p class="muted">
                        ${t("Edit supplier endpoint and auth settings.", "编辑供应商接口与认证设置。")}
                      </p>
                    </div>
                    <div class="sup-detail-header__actions">
                      <button
                        class="btn btn--sm"
                        ?disabled=${selectedId === props.defaultSupplierId}
                        @click=${() => props.onSetDefaultSupplier(selectedId)}
                      >
                        ${
                          selectedId === props.defaultSupplierId
                            ? t("Default Supplier", "默认供应商")
                            : t("Set As Default", "设为默认供应商")
                        }
                      </button>
                      <button
                        class="btn btn--sm"
                        @click=${() => props.onOpenRenameDialog(selectedId)}
                      >
                        ${t("Rename", "重命名")}
                      </button>
                      <button
                        class="btn btn--sm providers-btn-danger"
                        @click=${() => props.onOpenDeleteDialog(selectedId)}
                      >
                        ${t("Delete", "删除")}
                      </button>
                    </div>
                  </div>

                  <div class="sup-fields-grid">
                    ${renderSupplierField({
                      title: t("API Key", "API 密钥"),
                      value: typeof selectedRecord.apiKey === "string" ? selectedRecord.apiKey : "",
                      placeholder: t("Enter API key", "输入 API 密钥"),
                      secret: true,
                      disabled: props.loading,
                      onChange: (next) =>
                        props.onFormPatch(["models", "providers", selectedId, "apiKey"], next),
                    })}
                    ${renderSupplierField({
                      title: t("API URL", "API 地址"),
                      value:
                        typeof selectedRecord.baseUrl === "string" ? selectedRecord.baseUrl : "",
                      placeholder: t("https://api.example.com/v1", "https://api.example.com/v1"),
                      disabled: props.loading,
                      onChange: (next) =>
                        props.onFormPatch(["models", "providers", selectedId, "baseUrl"], next),
                    })}
                    <label class="sup-field">
                      <span>${t("API Type", "接口类型")}</span>
                      <select
                        .value=${supplierApi}
                        ?disabled=${props.loading}
                        @change=${(event: Event) =>
                          props.onFormPatch(
                            ["models", "providers", selectedId, "api"],
                            (event.target as HTMLSelectElement).value,
                          )}
                      >
                        <option value="openai-completions">openai-completions</option>
                        <option value="openai-responses">openai-responses</option>
                        <option value="anthropic-messages">anthropic-messages</option>
                        <option value="google-generative-ai">google-generative-ai</option>
                      </select>
                    </label>
                  </div>

                  <section class="sup-models">
                    <div class="sup-models__header">
                      <div>
                        <h4>${t("Models", "模型")}</h4>
                        <p class="muted">
                          ${t(
                            "Manage model ID and name in a simplified list.",
                            "以简化方式管理模型 ID 与名称。",
                          )}
                        </p>
                      </div>
                      <div class="sup-models__tools">
                        <div class="sup-models__mode">
                          <button
                            class="btn btn--sm ${props.modelsManageMode === "simple" ? "primary" : ""}"
                            @click=${() => props.onToggleModelsManageMode("simple")}
                          >
                            ${t("Simple", "简化")}
                          </button>
                          <button
                            class="btn btn--sm ${props.modelsManageMode === "advanced" ? "primary" : ""}"
                            @click=${() => props.onToggleModelsManageMode("advanced")}
                          >
                            ${t("Advanced", "高级")}
                          </button>
                        </div>
                        <button class="btn btn--sm" @click=${() => props.onOpenAddModelDialog(selectedId)}>
                          ${t("Add Model", "新增模型")}
                        </button>
                      </div>
                    </div>

                    <div class="sup-models__list">
                      ${
                        selectedModels.length === 0
                          ? html`<div class="sup-models__empty">${t(
                              "No models configured.",
                              "暂无模型，请先新增模型。",
                            )}</div>`
                          : selectedModels.map(
                              (model, index) => html`
                              <article class="sup-models__item">
                                <div class="sup-models__meta">
                                  <div class="sup-models__id mono">${model.id}</div>
                                  <div class="sup-models__name">${model.name}</div>
                                </div>
                                <div class="sup-models__actions">
                                  <button
                                    class="btn btn--sm"
                                    @click=${() => props.onOpenEditModelDialog(selectedId, index)}
                                  >
                                    ${t("Edit", "编辑")}
                                  </button>
                                  <button
                                    class="btn btn--sm providers-btn-danger"
                                    @click=${() => props.onOpenDeleteModelDialog(selectedId, index)}
                                  >
                                    ${t("Delete", "删除")}
                                  </button>
                                </div>

                                ${
                                  props.modelsManageMode === "advanced" && modelItemSchema
                                    ? html`
                                        <details class="sup-models__advanced">
                                          <summary>${t("Advanced Fields", "高级字段")}</summary>
                                          <div class="sup-models__advanced-content">
                                            ${Object.entries(modelItemSchema.properties ?? {})
                                              .filter(([key]) => !["id", "name"].includes(key))
                                              .map(([key, node]) =>
                                                renderNode({
                                                  schema: node,
                                                  value: model.raw[key],
                                                  path: [
                                                    "models",
                                                    "providers",
                                                    selectedId,
                                                    "models",
                                                    index,
                                                    key,
                                                  ],
                                                  hints: props.uiHints,
                                                  unsupported,
                                                  disabled: props.loading,
                                                  onPatch: props.onFormPatch,
                                                }),
                                              )}
                                          </div>
                                        </details>
                                      `
                                    : nothing
                                }
                              </article>
                            `,
                            )
                      }
                    </div>
                    <div class="sup-models__footer muted">
                      ${t("Model count", "模型数量")}: <span class="mono">${selectedModels.length}</span>
                    </div>
                  </section>

                  <details class="sup-advanced">
                    <summary>${t("Advanced Supplier Settings", "供应商高级设置")}</summary>
                    <div class="sup-advanced__content">
                      ${
                        supplierSchema && supplierSchema.properties
                          ? Object.entries(supplierSchema.properties)
                              .filter(
                                ([key]) => !["apiKey", "baseUrl", "api", "models"].includes(key),
                              )
                              .map(([key, node]) =>
                                renderNode({
                                  schema: node,
                                  value: selectedRecord[key],
                                  path: ["models", "providers", selectedId, key],
                                  hints: props.uiHints,
                                  unsupported,
                                  disabled: props.loading,
                                  onPatch: props.onFormPatch,
                                }),
                              )
                          : nothing
                      }
                    </div>
                  </details>
                `
          }
        </section>
      </div>

      ${
        props.issues.length > 0
          ? html`<div class="callout danger"><pre class="code-block">${JSON.stringify(
              props.issues,
              null,
              2,
            )}</pre></div>`
          : nothing
      }

      <div class="providers-actionbar">
        <div class="providers-actionbar__left">
          ${
            hasChanges
              ? html`<span class="providers-change-indicator">${t("Unsaved changes", "有未保存更改")}</span>`
              : html`<span class="muted">${t("No changes", "无更改")}</span>`
          }
        </div>
        <div class="providers-actionbar__right">
          <button class="btn btn--sm" ?disabled=${props.loading} @click=${props.onReload}>
            ${props.loading ? t("Loading…", "加载中…") : t("Reload", "重新加载")}
          </button>
          <button class="btn btn--sm primary" ?disabled=${!canSave} @click=${props.onSave}>
            ${props.saving ? t("Saving…", "保存中…") : t("Save", "保存")}
          </button>
          <button class="btn btn--sm" ?disabled=${!canApply} @click=${props.onApply}>
            ${props.applying ? t("Applying…", "应用中…") : t("Apply", "应用")}
          </button>
          <button class="btn btn--sm" ?disabled=${!canUpdate} @click=${props.onUpdate}>
            ${props.updating ? t("Updating…", "更新中…") : t("Update", "更新")}
          </button>
        </div>
      </div>
    </section>

    ${
      showSupplierDialog
        ? html`
            <div class="exec-approval-overlay" role="dialog" aria-modal="true">
              <div class="sup-modal">
                <div class="sup-modal__header">
                  <h3>
                    ${
                      props.dialogMode === "add"
                        ? t("Add Supplier", "添加供应商")
                        : props.dialogMode === "rename"
                          ? t("Rename Supplier", "重命名供应商")
                          : t("Delete Supplier", "删除供应商")
                    }
                  </h3>
                </div>
                ${
                  props.dialogMode === "delete"
                    ? html`<p class="muted">
                        ${t(
                          `Confirm delete supplier "${props.dialogTargetId ?? ""}"?`,
                          `确认删除供应商 "${props.dialogTargetId ?? ""}" 吗？`,
                        )}
                      </p>`
                    : html`
                        <label class="sup-field">
                          <span>${t("Supplier Name", "供应商名称")}</span>
                          <input
                            type="text"
                            .value=${props.draftName}
                            placeholder=${t("Example: openai", "例如：openai")}
                            @input=${(event: Event) =>
                              props.onDraftNameChange((event.target as HTMLInputElement).value)}
                          />
                        </label>
                        ${
                          props.dialogMode === "add"
                            ? html`
                                <label class="sup-field">
                                  <span>${t("Supplier Type", "供应商类型")}</span>
                                  <select
                                    .value=${props.draftType}
                                    @change=${(event: Event) =>
                                      props.onDraftTypeChange(
                                        (event.target as HTMLSelectElement)
                                          .value as SupplierPresetType,
                                      )}
                                  >
                                    ${Object.entries(SUPPLIER_PRESETS).map(
                                      ([key, preset]) =>
                                        html`<option value=${key}>${preset.label}</option>`,
                                    )}
                                  </select>
                                </label>
                              `
                            : nothing
                        }
                      `
                }
                <div class="sup-modal__actions">
                  <button class="btn btn--sm" @click=${props.onCloseDialog}>
                    ${t("Cancel", "取消")}
                  </button>
                  <button
                    class="btn btn--sm ${props.dialogMode === "delete" ? "providers-btn-danger" : "primary"}"
                    @click=${() => {
                      if (props.dialogMode === "add") {
                        props.onConfirmAddSupplier();
                        return;
                      }
                      if (props.dialogMode === "rename") {
                        props.onConfirmRenameSupplier();
                        return;
                      }
                      props.onConfirmDeleteSupplier();
                    }}
                  >
                    ${
                      props.dialogMode === "add"
                        ? t("Create", "创建")
                        : props.dialogMode === "rename"
                          ? t("Rename", "重命名")
                          : t("Delete", "删除")
                    }
                  </button>
                </div>
              </div>
            </div>
          `
        : nothing
    }

    ${
      showModelDialog
        ? html`
            <div class="exec-approval-overlay" role="dialog" aria-modal="true">
              <div class="sup-modal sup-model-modal">
                <div class="sup-modal__header">
                  <h3>
                    ${
                      props.modelDialogMode === "add"
                        ? t("Add Model", "添加模型")
                        : props.modelDialogMode === "edit"
                          ? t("Edit Model", "编辑模型")
                          : t("Delete Model", "删除模型")
                    }
                  </h3>
                </div>

                ${
                  props.modelDialogMode === "delete"
                    ? html`
                        <p class="muted">
                          ${t(
                            `Confirm delete model "${props.modelDraftId || ""}"?`,
                            `确认删除模型 "${props.modelDraftId || ""}" 吗？`,
                          )}
                        </p>
                      `
                    : html`
                        <label class="sup-field">
                          <span>${t("Model ID", "模型 ID")}</span>
                          <input
                            type="text"
                            .value=${props.modelDraftId}
                            placeholder=${t("e.g. deepseek-chat", "例如：deepseek-chat")}
                            @input=${(event: Event) =>
                              props.onModelDraftIdChange((event.target as HTMLInputElement).value)}
                          />
                        </label>
                        <label class="sup-field">
                          <span>${t("Model Name", "模型名称")}</span>
                          <input
                            type="text"
                            .value=${props.modelDraftName}
                            placeholder=${t("leave empty to use Model ID", "留空则自动使用模型 ID")}
                            @input=${(event: Event) =>
                              props.onModelDraftNameChange(
                                (event.target as HTMLInputElement).value,
                              )}
                          />
                        </label>
                      `
                }

                <div class="sup-modal__actions">
                  <button class="btn btn--sm" @click=${props.onCloseModelDialog}>
                    ${t("Cancel", "取消")}
                  </button>
                  <button
                    class="btn btn--sm ${props.modelDialogMode === "delete" ? "providers-btn-danger" : "primary"}"
                    @click=${() => {
                      if (props.modelDialogMode === "add") {
                        props.onConfirmAddModel();
                        return;
                      }
                      if (props.modelDialogMode === "edit") {
                        props.onConfirmEditModel();
                        return;
                      }
                      props.onConfirmDeleteModel();
                    }}
                  >
                    ${
                      props.modelDialogMode === "add"
                        ? t("Create", "创建")
                        : props.modelDialogMode === "edit"
                          ? t("Save", "保存")
                          : t("Delete", "删除")
                    }
                  </button>
                </div>
              </div>
            </div>
          `
        : nothing
    }
  `;
}
