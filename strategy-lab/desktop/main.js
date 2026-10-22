// Strategy Lab as a Mac app. Runs the same local server as `npm start` inside the
// app and shows it in a native window. While the app is open (window closed or
// not), the paper autopilot keeps checking whether its daily rebalance is due.

import { app, BrowserWindow, Menu, dialog, nativeTheme, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// Packaged: the server is copied to Contents/Resources/strategy-lab. From source: the parent folder.
const serverRoot = app.isPackaged ? path.join(process.resourcesPath, "strategy-lab") : path.resolve(here, "..");
const userData = app.getPath("userData"); // ~/Library/Application Support/Strategy Lab
const settingsFile = path.join(userData, "settings.json");
// The packaged app keeps keys and data in the user data folder. Run from source,
// it shares strategy-lab/.env and strategy-lab/autopilot-data with `npm start`.
const envFile = app.isPackaged ? path.join(userData, ".env") : path.join(serverRoot, ".env");
// A fixed port keeps the page's origin, and so its saved strategies and backtests, the same on every launch.
const PORT = Number(process.env.STRATEGY_LAB_PORT) || 5183;
const url = `http://127.0.0.1:${PORT}`;

let win = null;

const readSettings = () => {
  try {
    return JSON.parse(fs.readFileSync(settingsFile, "utf8"));
  } catch {
    return {};
  }
};
const writeSettings = (s) => {
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(settingsFile, JSON.stringify(s, null, 2));
};

async function startServer() {
  if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
  if (app.isPackaged) process.env.AUTOPILOT_DIR ||= path.join(userData, "autopilot-data");
  Object.assign(process.env, { PORT: String(PORT), HOST: "127.0.0.1", STRATEGY_LAB_SETTINGS: settingsFile });
  const { listening } = await import(pathToFileURL(path.join(serverRoot, "server.js")).href);
  await listening;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    title: "Strategy Lab",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 20, y: 21 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0d1014" : "#f6f7f9",
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.loadURL(url);
  win.once("ready-to-show", () => win.show());
  // Links to other sites open in the default browser, not inside the app.
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:/.test(target)) shell.openExternal(target);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, target) => {
    if (!target.startsWith(url)) {
      e.preventDefault();
      if (/^https?:/.test(target)) shell.openExternal(target);
    }
  });
  win.on("closed", () => (win = null));
}

async function addProjectFolder() {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: "Add Project Folder",
    message: "Choose an autopilot folder with a config.json, such as strategy-lab/paper-test in your copy of the repo.",
    properties: ["openDirectory"],
  });
  if (canceled || !filePaths[0]) return;
  const dir = filePaths[0];
  if (!fs.existsSync(path.join(dir, "config.json"))) {
    dialog.showMessageBox(win, { type: "warning", message: "That folder isn't a Strategy Lab project", detail: "A project folder contains the autopilot's config.json and journal.jsonl." });
    return;
  }
  const s = readSettings();
  s.projectDirs = [...new Set([...(s.projectDirs || []), dir])];
  writeSettings(s);
  win?.reload();
}

function removeProjectFolders() {
  const s = readSettings();
  if (!s.projectDirs?.length) {
    dialog.showMessageBox(win, { message: "No added project folders", detail: "Folders found automatically (this computer's autopilot and paper-test next to the app's source) always show." });
    return;
  }
  const choice = dialog.showMessageBoxSync(win, {
    type: "question",
    buttons: ["Remove All", "Cancel"],
    defaultId: 1,
    message: "Stop showing the project folders you added?",
    detail: `${s.projectDirs.join("\n")}\n\nThe folders themselves are not touched.`,
  });
  if (choice !== 0) return;
  writeSettings({ ...s, projectDirs: [] });
  win?.reload();
}

function openKeysFile() {
  if (!fs.existsSync(envFile)) {
    fs.mkdirSync(path.dirname(envFile), { recursive: true });
    fs.copyFileSync(path.join(serverRoot, ".env.example"), envFile);
  }
  shell.openPath(envFile);
  dialog.showMessageBox(win, {
    message: "Add your keys, save, then restart",
    detail: "Paste your Alpaca paper keys (and optionally an Anthropic API key) into the file that just opened, save it, then choose Strategy Lab › Restart.",
  });
}

function buildMenu() {
  const go = (view) => win?.webContents.executeJavaScript(`document.querySelector('.tab[data-view="${view}"]')?.click()`);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { label: "API Keys…", click: openKeysFile },
        { label: "Show Data Folder", click: () => shell.openPath(process.env.AUTOPILOT_DIR || path.join(serverRoot, "autopilot-data")) },
        { label: "Restart", click: () => { app.relaunch(); app.exit(0); } },
        { type: "separator" },
        { role: "hide" }, { role: "hideOthers" }, { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "File",
      submenu: [
        { label: "Add Project Folder…", accelerator: "CmdOrCtrl+O", click: addProjectFolder },
        { label: "Remove Added Project Folders…", click: removeProjectFolders },
        { type: "separator" },
        { role: "close" },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { label: "Overview", accelerator: "CmdOrCtrl+1", click: () => go("overview") },
        { label: "Build & Test", accelerator: "CmdOrCtrl+2", click: () => go("build") },
        { label: "Rebalance", accelerator: "CmdOrCtrl+3", click: () => go("rebalance") },
        { label: "Monitor", accelerator: "CmdOrCtrl+4", click: () => go("monitor") },
        { label: "Library", accelerator: "CmdOrCtrl+5", click: () => go("library") },
        { type: "separator" },
        { role: "reload" }, { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
  ]));
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.setName("Strategy Lab");
  app.on("second-instance", () => {
    if (!win) return createWindow();
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(async () => {
    buildMenu();
    try {
      await startServer();
    } catch (err) {
      const detail = err.code === "EADDRINUSE"
        ? `Port ${PORT} is already in use by another program. Quit it, or start the app with STRATEGY_LAB_PORT set to a free port.`
        : err.stack || err.message;
      dialog.showErrorBox("Strategy Lab couldn't start", detail);
      return app.exit(1);
    }
    createWindow();
    // Mac convention: clicking the Dock icon reopens the window.
    app.on("activate", () => win || createWindow());
  });
  // Closing the window keeps the app (and the autopilot's checks) running on macOS; Cmd+Q quits.
  app.on("window-all-closed", () => process.platform === "darwin" || app.quit());
}
