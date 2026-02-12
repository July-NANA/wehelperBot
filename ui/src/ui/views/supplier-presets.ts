export type SupplierPresetType =
  | "openai-compatible"
  | "openai-responses"
  | "anthropic"
  | "gemini"
  | "azure-openai"
  | "ollama"
  | "custom";

type SupplierPreset = {
  label: string;
  api: "openai-completions" | "openai-responses" | "anthropic-messages" | "google-generative-ai";
  baseUrl: string;
  apiKey: string;
};

export const SUPPLIER_PRESETS: Record<SupplierPresetType, SupplierPreset> = {
  "openai-compatible": {
    label: "OpenAI Compatible",
    api: "openai-completions",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "${OPENAI_API_KEY}",
  },
  "openai-responses": {
    label: "OpenAI Responses",
    api: "openai-responses",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "${OPENAI_API_KEY}",
  },
  anthropic: {
    label: "Anthropic",
    api: "anthropic-messages",
    baseUrl: "https://api.anthropic.com",
    apiKey: "${ANTHROPIC_API_KEY}",
  },
  gemini: {
    label: "Gemini",
    api: "google-generative-ai",
    baseUrl: "https://generativelanguage.googleapis.com",
    apiKey: "${GEMINI_API_KEY}",
  },
  "azure-openai": {
    label: "Azure OpenAI",
    api: "openai-responses",
    baseUrl: "https://{resource}.openai.azure.com/openai/v1",
    apiKey: "${AZURE_OPENAI_API_KEY}",
  },
  ollama: {
    label: "Ollama",
    api: "openai-completions",
    baseUrl: "http://127.0.0.1:11434/v1",
    apiKey: "",
  },
  custom: {
    label: "Custom / New API",
    api: "openai-completions",
    baseUrl: "",
    apiKey: "",
  },
};

export function createSupplierFromPreset(type: SupplierPresetType): Record<string, unknown> {
  const preset = SUPPLIER_PRESETS[type];
  return {
    api: preset.api,
    baseUrl: preset.baseUrl,
    apiKey: preset.apiKey,
    models: [],
  };
}
