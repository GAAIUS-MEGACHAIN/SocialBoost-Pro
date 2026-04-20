// Preload — runs in renderer context, used to expose a small API if needed.
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("SBP", {
  mode: process.env.SBP_MODE || "online",
  version: "1.0.0",
});
