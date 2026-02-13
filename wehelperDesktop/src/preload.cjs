const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("wehelperDesktop", {
  version: "0.1.0",
});
