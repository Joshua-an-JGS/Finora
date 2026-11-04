const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  getAppVersion: () => {
    try {
      return ipcRenderer.sendSync('get-app-version-sync');
    } catch {
      return null;
    }
  },
  onReady: (callback) => ipcRenderer.on('backend-ready', (_event, value) => callback(value)),
  onInitError: (callback) => ipcRenderer.on('backend-error', (_event, error) => callback(error)),
  onSplashFadeComplete: () => ipcRenderer.send('splash-fade-complete'),
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    onEvent: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('updater:event', handler);
      return () => ipcRenderer.removeListener('updater:event', handler);
    }
  }
});


