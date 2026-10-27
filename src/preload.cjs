const { contextBridge, ipcRenderer } = require('electron');

const api = {
  system: {
    info: () => ipcRenderer.invoke('system:info'),
    openTerminal: () => ipcRenderer.invoke('system:open-terminal'),
    reboot: () => ipcRenderer.invoke('system:reboot'),
    exportReport: () => ipcRenderer.invoke('system:export-report'),
    saveReport: (payload) => ipcRenderer.invoke('system:save-report', payload || {}),
    quickFix: (type) => ipcRenderer.invoke('system:quick-fix', { type })
  },
  devices: {
    scan: () => ipcRenderer.invoke('devices:scan')
  },
  diagnostics: {
    run: (options) => ipcRenderer.invoke('diagnostics:run', options || {})
  },
  drivers: {
    install: (payload) => ipcRenderer.invoke('drivers:install', payload),
    installCanon: (payload) => ipcRenderer.invoke('drivers:install-canon', payload),
    onProgress: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('install:progress', handler);
      return () => ipcRenderer.removeListener('install:progress', handler);
    }
  },
  printers: {
    list: () => ipcRenderer.invoke('printers:list'),
    printTestPage: (payload) => ipcRenderer.invoke('printers:print-test-page', payload),
    clearQueue: (payload) => ipcRenderer.invoke('printers:clear-queue', payload)
  },
  ai: {
    testConnection: (payload) => ipcRenderer.invoke('ai:test-connection', payload),
    getFreeModels: () => ipcRenderer.invoke('ai:get-free-models')
  },
  agent: {
    chat: (payload) => ipcRenderer.invoke('agent:chat', payload),
    executeAction: (action) => ipcRenderer.invoke('agent:execute-action', { action })
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
