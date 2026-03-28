/* =====================
   preload.js — ventana principal (index.html)
   Expone únicamente los canales IPC necesarios via contextBridge.
   nodeIntegration desactivado; contextIsolation activado.
   ===================== */
const { contextBridge, ipcRenderer } = require('electron')

const ALLOWED_RECEIVE = new Set([
    'apply-colors',
    'strict-exit-lock-state',
    'strict-screen-lock-state',
    'strict-interaction-lock-state',
    'strict-website-lock-state',
    'license-state-updated',
    'strict-exit-lock-blocked',
    'strict-screen-lock-activated',
    'strict-interaction-lock-activated'
])

contextBridge.exposeInMainWorld('electronAPI', {
    /* ---- send (fire-and-forget) ---- */
    openSettings:             ()      => ipcRenderer.send('open-settings'),
    openStrictMode:           ()      => ipcRenderer.send('open-strict-mode'),
    closeApp:                 ()      => ipcRenderer.send('close-app'),
    minimizeApp:              ()      => ipcRenderer.send('minimize-app'),
    setStrictInteractionLock: (v)     => ipcRenderer.send('set-strict-interaction-lock', v),
    setWindowPosition:        (pos)   => ipcRenderer.send('set-window-position', pos),
    setWindowSize:            (size)  => ipcRenderer.send('set-window-size', size),
    pomodoroAlert:            (data)  => ipcRenderer.send('pomodoro-alert', data),
    exportStats:              (data)  => ipcRenderer.send('export-stats', data),

    /* ---- invoke (request/response) ---- */
    getLicenseState:    () => ipcRenderer.invoke('get-license-state'),
    getWindowPosition:  () => ipcRenderer.invoke('get-window-position'),

    /* ---- on (receive from main) ---- */
    on: (channel, callback) => {
        if (!ALLOWED_RECEIVE.has(channel)) return
        ipcRenderer.on(channel, (_, ...args) => callback(...args))
    }
})
