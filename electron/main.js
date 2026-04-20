// SocialBoost Pro — Electron main process. STANDALONE ONLY.
// Embeds a full Node.js + Express + lowdb backend that makes real outbound calls
// to Stripe, PayPal and SMM supplier APIs when the machine has internet.
//
// No "wrap the live website" mode. If you want the live hosted panel,
// open your browser.

const { app, BrowserWindow, Menu, shell, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

const PORT = parseInt(process.env.SBP_PORT || "47219", 10);

let mainWindow;
let server;

async function startEmbeddedBackend() {
  const { startServer } = require("./standalone/server");
  server = await startServer(PORT);
  return `http://127.0.0.1:${PORT}`;
}

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "File", submenu: [{ role: "reload" }, { role: "forcereload" }, { type: "separator" }, { role: "quit" }] },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
    {
      label: "Help", submenu: [{
        label: "About SocialBoost Pro",
        click: () => dialog.showMessageBox({
          type: "info",
          title: "About",
          message: "SocialBoost Pro Desktop",
          detail: `Standalone build. Local backend on http://127.0.0.1:${PORT}\nData: ~/.socialboost-pro/db.json`,
        }),
      }, {
        label: "Open data folder",
        click: () => shell.openPath(require("os").homedir() + "/.socialboost-pro"),
      }],
    },
  ]));
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "SocialBoost Pro",
    backgroundColor: "#FAFAFA",
    icon: path.join(__dirname, "assets", "icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  const target = await startEmbeddedBackend();
  try {
    await mainWindow.loadURL(target + "/");
  } catch (e) {
    dialog.showErrorBox("Load failed", "Could not load " + target + ": " + e.message);
  }
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => {
  if (server && server.close) server.close();
  if (process.platform !== "darwin") app.quit();
});
