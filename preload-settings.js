/* =====================
   preload-settings.js — ventana de configuración (settings.html)
   ===================== */
const { contextBridge, ipcRenderer, shell } = require('electron')

const ALLOWED_RECEIVE = new Set([
    'license-state-updated'
])

contextBridge.exposeInMainWorld('electronAPI', {
    /* ---- send ---- */
    closeSettings: ()     => ipcRenderer.send('close-settings'),
    saveSettings:  (data) => ipcRenderer.send('save-settings', data),

    /* ---- invoke ---- */
    getLicenseState:             () => ipcRenderer.invoke('get-license-state'),
    activateLicense:             (data) => ipcRenderer.invoke('activate-license', data),
    activateTrialLicense:        () => ipcRenderer.invoke('activate-trial-license'),
    deactivateTrialLicense:      () => ipcRenderer.invoke('deactivate-trial-license'),
    getTrialLicenseAvailability: () => ipcRenderer.invoke('get-trial-license-availability'),
    getLaunchAtStartup:          () => ipcRenderer.invoke('get-launch-at-startup'),
    setLaunchAtStartup:          (v) => ipcRenderer.invoke('set-launch-at-startup', v),
    selectCustomBg:              () => ipcRenderer.invoke('select-custom-bg'),
    removeCustomBg:              () => ipcRenderer.invoke('remove-custom-bg'),

    /* ---- shell ---- */
    openExternal: (url) => shell.openExternal(url),

    /* ---- on ---- */
    on: (channel, callback) => {
        if (!ALLOWED_RECEIVE.has(channel)) return
        ipcRenderer.on(channel, (_, ...args) => callback(...args))
    }
})
