import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { resolveWecomKfConfig, type WecomKfStartParams } from "./src/config.js";
import { createWecomKfRuntime } from "./src/runtime.js";

const wecomConfigSchema = {
  parse(value: unknown) {
    return resolveWecomKfConfig(value);
  },
};

const plugin = {
  id: "wecom-kf",
  name: "WeCom KF",
  description: "WeCom customer service callback integration",
  configSchema: wecomConfigSchema,
  register(api: OpenClawPluginApi) {
    const runtime = createWecomKfRuntime({
      logger: api.logger,
      stateDir: api.runtime.state.resolveStateDir(),
      wehelperDir: api.resolvePath("../wehelper"),
    });

    const loadConfig = async () => {
      const full = await api.runtime.config.loadConfig();
      const raw =
        full?.plugins &&
        typeof full.plugins === "object" &&
        (full.plugins as Record<string, unknown>).entries &&
        typeof (full.plugins as Record<string, unknown>).entries === "object"
          ? ((full.plugins as Record<string, unknown>).entries as Record<string, unknown>)[
              "wecom-kf"
            ]
          : undefined;

      const pluginConfig =
        raw && typeof raw === "object" && !Array.isArray(raw)
          ? (raw as Record<string, unknown>).config
          : undefined;
      return resolveWecomKfConfig(pluginConfig);
    };

    api.registerGatewayMethod("wecom_kf.status", async ({ respond }) => {
      try {
        const cfg = await loadConfig();
        respond(true, runtime.status(cfg));
      } catch (err) {
        respond(false, { error: err instanceof Error ? err.message : String(err) });
      }
    });

    api.registerGatewayMethod("wecom_kf.start", async ({ params, respond }) => {
      try {
        const cfg = await loadConfig();
        const overrides =
          params && typeof params === "object"
            ? ((params as Record<string, unknown>).config as WecomKfStartParams | undefined)
            : undefined;
        const status = await runtime.start(cfg, overrides);
        respond(true, status);
      } catch (err) {
        respond(false, { error: err instanceof Error ? err.message : String(err) });
      }
    });

    api.registerGatewayMethod("wecom_kf.stop", async ({ respond }) => {
      try {
        const cfg = await loadConfig();
        const status = await runtime.stop(cfg);
        respond(true, status);
      } catch (err) {
        respond(false, { error: err instanceof Error ? err.message : String(err) });
      }
    });
  },
};

export default plugin;
