// Ensure Electron runs in full GUI mode even if invoked in an environment that has ELECTRON_RUN_AS_NODE set
delete process.env.ELECTRON_RUN_AS_NODE;

const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const http = require('http');
const { spawn } = require('child_process');

const logDir = path.join(process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local'), 'FINORA', 'Logs');
fs.mkdirSync(logDir, { recursive: true });
const logFile = path.join(logDir, 'electron_boot.log');

function logBoot(msg) {
  try {
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

logBoot('Electron entry point reached');

// 1. Single Instance Protection
let gotTheLock = true;
try {
  gotTheLock = app.requestSingleInstanceLock();
  logBoot(`gotTheLock result: ${gotTheLock}`);
} catch (err) {
  logBoot(`app.requestSingleInstanceLock exception: ${err.message}`);
}

if (!gotTheLock) {
  logBoot('Instance lock not acquired, quitting second instance');
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let splashWindow = null;
let backendProcess = null;
let assignedPort = 0;
let isQuitting = false;

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// 2. Discover Free Localhost Port
function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

// 3. Resolve Application Directories & Backend Executable
function getBackendExecutablePath() {
  const isPackaged = app.isPackaged;
  if (isPackaged) {
    const packagedPath = path.join(process.resourcesPath, 'backend', 'PaySlipStudio.Api.exe');
    if (fs.existsSync(packagedPath)) return packagedPath;
  }

  // Development / unpacked paths
  const devPaths = [
    path.join(__dirname, '..', 'backend', 'dist-win-x64', 'PaySlipStudio.Api.exe'),
    path.join(__dirname, '..', 'backend', 'PaySlipStudio.Api', 'bin', 'Release', 'net10.0', 'win-x64', 'PaySlipStudio.Api.exe'),
    path.join(__dirname, '..', 'backend', 'PaySlipStudio.Api', 'bin', 'Debug', 'net10.0', 'PaySlipStudio.Api.exe')
  ];

  for (const p of devPaths) {
    if (fs.existsSync(p)) return p;
  }

  throw new Error(`FINORA Backend binary not found. Checked: ${devPaths.join(', ')}`);
}

// 4. Launch Backend Silently (Zero Terminal / Console Window)
function startBackend(port) {
  const exePath = getBackendExecutablePath();
  const exeDir = path.dirname(exePath);
  logBoot(`Starting backend exe: ${exePath} in ${exeDir} on port ${port}`);

  const env = {
    ...process.env,
    FINORA_DESKTOP_MODE: 'true',
    FINORA_PORT: String(port),
    ASPNETCORE_URLS: `http://127.0.0.1:${port}`
  };

  backendProcess = spawn(exePath, ['--desktop', '--urls', `http://127.0.0.1:${port}`], {
    cwd: exeDir,
    windowsHide: true,
    detached: false,
    stdio: 'ignore',
    env
  });

  backendProcess.on('error', (err) => {
    logBoot(`Backend spawn error: ${err.message}`);
    console.error('Failed to spawn FINORA backend:', err);
    if (!isQuitting) {
      dialog.showErrorBox(
        'FINORA Initialization Error',
        `The internal FINORA payroll engine could not start.\n\nDetails: ${err.message}`
      );
      app.quit();
    }
  });

  backendProcess.on('exit', (code, signal) => {
    logBoot(`Backend process exited. Code: ${code}, Signal: ${signal}`);
    if (!isQuitting) {
      console.warn(`Backend exited unexpectedly with code ${code}, signal ${signal}`);
    }
  });
}

// 5. Poll Backend Health Check
function waitForBackend(port, timeoutMs = 30000) {
  logBoot(`Waiting for backend on port ${port}...`);
  const startTime = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (Date.now() - startTime > timeoutMs) {
        logBoot('Backend timeout reached (30s)');
        return reject(new Error('Backend startup timed out after 30 seconds.'));
      }

      const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
        if (res.statusCode === 200) {
          logBoot(`Backend is healthy! Status code: ${res.statusCode}`);
          resolve();
        } else {
          setTimeout(check, 350);
        }
      });

      req.on('error', () => {
        setTimeout(check, 350);
      });

      req.setTimeout(1000, () => {
        req.destroy();
        setTimeout(check, 350);
      });
    };

    check();
  });
}

// Handle dynamic version requests synchronously
ipcMain.on('get-app-version-sync', (event) => {
  event.returnValue = app.getVersion();
});

// 6. Create Splash Window
let autoUpdater = null;
try {
  const updaterModule = require('electron-updater');
  autoUpdater = updaterModule.autoUpdater;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;
  logBoot('electron-updater initialized successfully');
} catch (err) {
  logBoot(`Failed to initialize electron-updater: ${err.message}`);
}

function setupUpdaterEvents() {
  if (!autoUpdater) return;

  autoUpdater.on('checking-for-update', () => {
    logBoot('autoUpdater: checking-for-update');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:event', { type: 'checking' });
    }
  });

  autoUpdater.on('update-available', (info) => {
    logBoot(`autoUpdater: update-available v${info.version}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:event', {
        type: 'available',
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes,
        files: info.files
      });
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    logBoot(`autoUpdater: update-not-available (current: ${app.getVersion()})`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:event', {
        type: 'not-available',
        version: app.getVersion()
      });
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:event', {
        type: 'progress',
        percent: Math.round(progressObj.percent || 0),
        transferred: progressObj.transferred || 0,
        total: progressObj.total || 0,
        bytesPerSecond: progressObj.bytesPerSecond || 0
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    logBoot(`autoUpdater: update-downloaded v${info.version}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:event', {
        type: 'downloaded',
        version: info.version,
        releaseNotes: info.releaseNotes
      });
    }
  });

  autoUpdater.on('error', (err) => {
    logBoot(`autoUpdater: error ${err.message}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:event', {
        type: 'error',
        message: err.message
      });
    }
  });
}

setupUpdaterEvents();

// Register IPC handlers for software updates
ipcMain.handle('updater:check', async () => {
  if (!autoUpdater) return { success: false, message: 'Updater not available in development environment' };
  try {
    const result = await autoUpdater.checkForUpdates();
    return { success: true, updateInfo: result?.updateInfo };
  } catch (err) {
    logBoot(`updater:check error: ${err.message}`);
    const isOffline = err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED' || err.message?.includes('net::ERR');
    return {
      success: false,
      isOffline,
      message: isOffline
        ? 'Unable to check for updates. Please check your internet connection and try again.'
        : err.message
    };
  }
});

ipcMain.handle('updater:download', async () => {
  if (!autoUpdater) return { success: false, message: 'Updater not available' };
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (err) {
    logBoot(`updater:download error: ${err.message}`);
    return { success: false, message: err.message };
  }
});

ipcMain.handle('updater:install', async () => {
  if (!autoUpdater) return { success: false, message: 'Updater not available' };
  try {
    logBoot('updater:install invoked, shutting down backend cleanly');
    cleanupBackend();
    autoUpdater.quitAndInstall(false, true);
    return { success: true };
  } catch (err) {
    logBoot(`updater:install error: ${err.message}`);
    return { success: false, message: err.message };
  }
});

// 6. Create Splash Window
function createSplashWindow() {
  const iconPath = path.join(__dirname, '..', 'build', 'icon.ico');
  splashWindow = new BrowserWindow({
    width: 520,
    height: 360,
    frame: false,
    transparent: true,
    resizable: false,
    center: true,
    show: false,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  splashWindow.loadFile(path.join(__dirname, 'splash.html'), {
    search: '?v=' + app.getVersion()
  });
  splashWindow.once('ready-to-show', () => {
    splashWindow.show();
  });
}

// 7. Create Main Application Window
function createMainWindow(port) {
  const iconPath = path.join(__dirname, '..', 'build', 'icon.ico');

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    title: 'FINORA — Finance & Payroll Management System',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#F8F9FA',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    }
  });

  Menu.setApplicationMenu(null);

  mainWindow.loadURL(`http://127.0.0.1:${port}`);

  mainWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show();
    mainWindow.focus();

    // Automatic Update Check (initial 6s delay, then every 24 hours)
    setTimeout(() => {
      if (autoUpdater && app.isPackaged) {
        logBoot('Triggering automatic background update check');
        autoUpdater.checkForUpdates().catch(e => logBoot('Background auto-update check error: ' + e.message));
      }
    }, 6000);

    setInterval(() => {
      if (autoUpdater && app.isPackaged) {
        logBoot('Triggering periodic 24h background update check');
        autoUpdater.checkForUpdates().catch(e => logBoot('Periodic auto-update check error: ' + e.message));
      }
    }, 24 * 60 * 60 * 1000);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 8. Lifecycle Management & Safe Termination
function cleanupBackend() {
  isQuitting = true;
  if (backendProcess && !backendProcess.killed) {
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(backendProcess.pid), '/f', '/t'], {
          windowsHide: true,
          stdio: 'ignore'
        });
      } else {
        backendProcess.kill('SIGTERM');
      }
    } catch {
      // ignore
    }
  }
}

app.on('before-quit', cleanupBackend);
app.on('will-quit', cleanupBackend);

app.on('window-all-closed', () => {
  cleanupBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 9. Startup Sequence
app.whenReady().then(async () => {
  logBoot('app.whenReady fired');
  createSplashWindow();

  try {
    assignedPort = await getAvailablePort();
    logBoot(`Assigned dynamic port: ${assignedPort}`);
    startBackend(assignedPort);
    await waitForBackend(assignedPort);

    logBoot('Informing splash window that backend is ready');
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.webContents.send('backend-ready', true);
    }

    // Small delay for smooth transition
    setTimeout(() => {
      logBoot('Creating main window');
      createMainWindow(assignedPort);
    }, 600);
  } catch (err) {
    logBoot(`Startup error: ${err.message}`);
    console.error('FINORA failed to initialize:', err);
    cleanupBackend();
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.webContents.send('backend-error', err.message);
      setTimeout(() => {
        if (splashWindow && !splashWindow.isDestroyed()) {
          splashWindow.close();
        }
        dialog.showErrorBox(
          'FINORA Startup Failure',
          `Could not initialize FINORA application services.\n\nError: ${err.message}`
        );
        app.quit();
      }, 2000);
    } else {
      dialog.showErrorBox(
        'FINORA Startup Failure',
        `Could not initialize FINORA application services.\n\nError: ${err.message}`
      );
      app.quit();
    }
  }
});

