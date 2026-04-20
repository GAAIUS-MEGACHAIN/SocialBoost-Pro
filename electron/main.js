// SocialBoost Pro — Electron main process.
// Two modes:
//  - SBP_MODE=online (default): loads hosted preview URL
//  - SBP_MODE=standalone: spins up a local Express+lowdb backend on 127.0.0.1:PORT
//    and serves the React build from ./web-dist, wiring the frontend's
//    BACKEND_URL to the local server (via injected window.__SBP_BACKEND_URL).

const { app, BrowserWindow, Menu, shell, dialog } = require("electron");
const path = require("path");
const url = require("url");

const MODE = process.env.SBP_MODE || "online";
const ONLINE_URL = process.env.SBP_ONLINE_URL || "https://smm-panel-hub-10.preview.emergentagent.com";
const STANDALONE_PORT = parseInt(process.env.SBP_STANDALONE_PORT || "47219", 10);

let mainWindow;
let standaloneServer;

async function startStandaloneBackend() {
  const { startServer } = require("./standalone/server");
  standaloneServer = await startServer(STANDALONE_PORT);
  return `http://127.0.0.1:${STANDALONE_PORT}`;
}

function buildMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        { role: "reload" },
        { role: "forcereload" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Mode",
      submenu: [
        {
          label: "Online (connect to live panel)",
          type: "radio",
          checked: MODE === "online",
          click: () => restartInMode("online"),
        },
        {
          label: "Standalone (offline JSON storage)",
          type: "radio",
          checked: MODE === "standalone",
          click: () => restartInMode("standalone"),
        },
      ],
    },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
    {
      label: "Help",
      submenu: [
        {
          label: "About SocialBoost Pro",
          click: () => dialog.showMessageBox({
            type: "info",
            title: "About",
            message: "SocialBoost Pro Desktop",
            detail: "Mode: " + MODE + "\nOnline URL: " + ONLINE_URL + "\nStandalone port: " + STANDALONE_PORT,
          }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function restartInMode(mode) {
  process.env.SBP_MODE = mode;
  app.relaunch({ args: process.argv.slice(1).concat(["--mode=" + mode]) });
  app.exit(0);
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

  // Open external links in the user's browser
  mainWindow.webContents.setWindowOpenHandler(({ url: u }) => {
    shell.openExternal(u);
    return { action: "deny" };
  });

  let target;
  if (MODE === "standalone") {
    const backendUrl = await startStandaloneBackend();
    // Standalone serves both the static web build AND the API under /api
    target = backendUrl + "/";
  } else {
    target = ONLINE_URL;
  }

  try {
    await mainWindow.loadURL(target);
  } catch (e) {
    dialog.showErrorBox("Load failed", "Could not load " + target + ": " + e.message);
  }
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (standaloneServer && standaloneServer.close) standaloneServer.close();
  if (process.platform !== "darwin") app.quit();
});
