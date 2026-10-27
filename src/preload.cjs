const { contextBridge, ipcRenderer } = require('electron');

const api = {
  system: {
    info: () => ipcRenderer.invoke('system:info'),
    openTerminal: () => ipcRenderer.invoke('system:open-terminal')
  },
  devices: {
    scan: () => ipcRenderer.invoke('devices:scan')
  },
  diagnostics: {
    run: (options) => ipcRenderer.invoke('diagnostics:run', options || {})
  },
  drivers: {
    install: (payload) => ipcRenderer.invoke('drivers:install', payload)
  },
  logs: {
    list: () => ipcRenderer.invoke('logs:list'),
    clear: () => ipcRenderer.invoke('logs:clear')
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (settings) => ipcRenderer.invoke('settings:save', settings)
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
    close: () => ipcRenderer.send('window:close')
  }
};

contextBridge.exposeInMainWorld('driverHub', api);
