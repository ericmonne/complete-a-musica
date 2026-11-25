const { contextBridge, ipcRenderer } = require('electron');

const desktopEnv = ipcRenderer.sendSync('get-desktop-env');

contextBridge.exposeInMainWorld('desktopEnv', desktopEnv);
