const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mxgg', {
  info: () => ipcRenderer.invoke('launcher:info'),
  start: () => ipcRenderer.invoke('launcher:start'),
  launchOffline: () => ipcRenderer.invoke('launcher:launch-offline'),
  openLog: () => ipcRenderer.invoke('launcher:open-log'),
  onState: (listener) => ipcRenderer.on('launcher:state', (_event, state) => listener(state))
});
