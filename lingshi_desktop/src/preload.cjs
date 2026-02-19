const { contextBridge } = require("electron");

const parseDesktopBootstrap = () => {
  const prefixes = ["--lingshi-desktop-bootstrap=", "--wehelper-desktop-bootstrap="];
  for (const arg of process.argv) {
    for (const prefix of prefixes) {
      if (!arg.startsWith(prefix)) {
        continue;
      }
      try {
        if (prefix === "--wehelper-desktop-bootstrap=") {
          console.warn(
            "[deprecation] --wehelper-desktop-bootstrap is deprecated, please use --lingshi-desktop-bootstrap.",
          );
        }
        return JSON.parse(decodeURIComponent(arg.slice(prefix.length)));
      } catch {
        return null;
      }
    }
  }
  return null;
};

const bridge = {
  version: "0.1.0",
  desktopBootstrap: parseDesktopBootstrap(),
};

contextBridge.exposeInMainWorld("lingshiDesktop", bridge);
contextBridge.exposeInMainWorld("wehelperDesktop", bridge);

const injectedLocale =
  bridge.desktopBootstrap?.locale ||
  process.env.LINGSHI_UI_LOCALE ||
  process.env.WEHELPER_UI_LOCALE ||
  "zh-CN";
contextBridge.exposeInMainWorld("OPENCLAW_UI_LOCALE", injectedLocale);
contextBridge.exposeInMainWorld("OPENCLAW_LOCALE", injectedLocale);
