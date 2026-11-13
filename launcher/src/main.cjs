const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { classifyUpdaterLine } = require('./update-state.cjs');

const APP_ID = 'gg.mxgg.techmania.launcher';
let mainWindow;
let updateRunning = false;

function executablePath() {
  return process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
}

function gameRoot() {
  const arg = process.argv.find((value) => value.startsWith('--game-root='));
  if (arg) return path.resolve(arg.slice('--game-root='.length));
  if (process.env.MXGG_GAME_ROOT) return path.resolve(process.env.MXGG_GAME_ROOT);
  return app.isPackaged ? path.dirname(executablePath()) : path.resolve(__dirname, '..', '..', '..');
}

function paths() {
  const root = gameRoot();
  return {
    root,
    game: path.join(root, 'TECHMANIA.exe'),
    updater: path.join(root, 'TECHMANIA-Updater.ps1'),
    release: path.join(root, '.techmania-release'),
    log: path.join(root, 'TECHMANIA-Launcher.log')
  };
}

function writeLog(message) {
  const line = `${new Date().toISOString()} ${message}\n`;
  try {
    fs.appendFileSync(paths().log, line, 'utf8');
  } catch {
    // The renderer will still show the actionable error if the cabinet path is read-only.
  }
}

function sendState(state) {
  if (!mainWindow?.isDestroyed()) mainWindow.webContents.send('launcher:state', state);
}

function installedVersion() {
  try {
    return fs.readFileSync(paths().release, 'utf8').trim() || 'not recorded';
  } catch {
    return 'not recorded';
  }
}

function launchGame() {
  const target = paths();
  if (!fs.existsSync(target.game)) {
    sendState({ stage: 'error', message: 'TECHMANIA.exe is missing. Put the launcher beside the game executable.' });
    return false;
  }

  writeLog('Launching TECHMANIA.exe');
  try {
    const child = spawn(target.game, [], { cwd: target.root, detached: true, stdio: 'ignore' });
    child.once('spawn', () => {
      child.unref();
      setTimeout(() => app.quit(), 300);
    });
    child.once('error', (error) => {
      writeLog(`TECHMANIA failed to start: ${error.message}`);
      sendState({ stage: 'error', progress: 0, message: 'TECHMANIA could not start. Open the log for details.' });
    });
    return true;
  } catch (error) {
    writeLog(`TECHMANIA failed to start: ${error.message}`);
    sendState({ stage: 'error', progress: 0, message: 'TECHMANIA could not start. Open the log for details.' });
    return false;
  }
}

function registerStartup() {
  if (!app.isPackaged) return;
  const target = executablePath();
  try {
    app.setLoginItemSettings({ openAtLogin: true, path: target, args: ['--autostart'] });
    writeLog(`Startup registration enabled for ${target}`);
  } catch (error) {
    writeLog(`Startup registration failed: ${error.message}`);
  }
}

async function runUpdater() {
  if (updateRunning) return { started: false };
  updateRunning = true;
  const target = paths();
  writeLog(`Launcher started in ${target.root}`);

  if (!fs.existsSync(target.game) || !fs.existsSync(target.updater)) {
    const missing = !fs.existsSync(target.game) ? 'TECHMANIA.exe' : 'TECHMANIA-Updater.ps1';
    updateRunning = false;
    sendState({ stage: 'error', progress: 0, message: `${missing} is missing. Keep the launcher beside the TECHMANIA files.` });
    return { started: false };
  }

  sendState({ stage: 'check', progress: 4, message: 'Reading the installed cabinet release…', version: installedVersion() });
  const powerShell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const child = spawn(powerShell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', target.updater], {
    cwd: target.root,
    windowsHide: true
  });
  let failureReported = false;

  const output = readline.createInterface({ input: child.stdout });
  output.on('line', (line) => {
    writeLog(line);
    const state = classifyUpdaterLine(line);
    if (state) {
      if (state.stage === 'error') failureReported = true;
      sendState(state);
    }
  });
  child.stderr.on('data', (chunk) => writeLog(chunk.toString().trim()));

  child.on('error', (error) => {
    updateRunning = false;
    failureReported = true;
    writeLog(`Updater failed to start: ${error.message}`);
    sendState({ stage: 'error', progress: 0, message: 'Windows could not start the updater. Open the log for details.' });
  });

  child.on('close', (code) => {
    updateRunning = false;
    if (code !== 0) {
      if (!failureReported) {
        sendState({ stage: 'error', progress: 0, message: 'The update stopped before installation finished. Retry, or launch the installed build offline.' });
      }
      return;
    }
    sendState({ stage: 'ready', progress: 100, message: 'Client and T2 are ready.', version: installedVersion() });
    setTimeout(() => sendState({ stage: 'launching', progress: 100, message: 'Starting TECHMANIA…' }), 550);
    setTimeout(launchGame, 1150);
  });

  return { started: true };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 360,
    height: 360,
    minWidth: 360,
    minHeight: 360,
    maxWidth: 360,
    maxHeight: 360,
    backgroundColor: '#17191f',
    show: false,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    center: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
}

if (!app.requestSingleInstanceLock()) app.quit();

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.whenReady().then(() => {
  app.setAppUserModelId(APP_ID);
  registerStartup();
  createWindow();
  ipcMain.handle('launcher:info', () => ({ installedVersion: installedVersion(), startupEnabled: app.isPackaged, root: paths().root }));
  ipcMain.handle('launcher:start', runUpdater);
  ipcMain.handle('launcher:launch-offline', () => launchGame());
  ipcMain.handle('launcher:open-log', async () => {
    if (!fs.existsSync(paths().log)) fs.writeFileSync(paths().log, '', 'utf8');
    return shell.openPath(paths().log);
  });
});

app.on('window-all-closed', () => app.quit());
