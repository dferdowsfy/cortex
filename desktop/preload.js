const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    enableProxy: () => ipcRenderer.invoke('proxy-enable'),
    disableProxy: () => ipcRenderer.invoke('proxy-disable'),
    getProxyStatus: () => ipcRenderer.invoke('proxy-status'),
    openDashboard: () => ipcRenderer.invoke('open-dashboard')
});
