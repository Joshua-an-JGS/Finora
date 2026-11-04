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
  onInitError: (callback) => ipcRenderer.on('backend-error', (_event, error) => callback(error))
});


