const { app, BrowserWindow, ipcMain, Notification, screen } = require('electron')
const Store = require('electron-store')
const { spawn } = require('child_process')
const os   = require('os')
const path = require('path')
const fs   = require('fs')
const { HOSTS_PATH, applyWebsiteBlock, normalizeWebsiteDomains, restoreWebsiteBlock } = require('./website-blocker')

const store = new Store()

let win
let settingsWindow
let strictModeWindow
let lockScreenWindow
let interactionLockWindows = []
let flashTimeout = null
let forceQuit = false
let forceCloseLockScreen = false
let forceCloseInteractionLock = false
let websiteLockCleanupInProgress = false
let persistBoundsTimeout = null
let exitLockEnabled = store.get('strictExitLockEnabled', false)
let screenLockEnabled = store.get('strictScreenLockEnabled', false)
let interactionLockEnabled = store.get('strictInteractionLockEnabled', false)
let websiteLockEnabled = store.get('strictWebsiteLockEnabled', false)
let websiteLockDomains = normalizeWebsiteDomains(store.get('strictWebsiteLockDomains', ['youtube.com', 'facebook.com', 'twitter.com']))
let websiteLockError = ''
let launchAtStartupEnabled = store.get('launchAtStartupEnabled', false)
const hostsBackupPath = path.join(app.getPath('userData'), 'hosts.strict-mode.backup')

function getLoginItemSettingsPayload(enabled) {
    const payload = {
        openAtLogin: Boolean(enabled),
        openAsHidden: false
    }

    if (process.platform === 'win32' && process.defaultApp && process.argv[1]) {
        payload.path = process.execPath
        payload.args = [path.resolve(process.argv[1])]
    }

    return payload
}

function setLaunchAtStartupEnabled(enabled) {
    const nextEnabled = Boolean(enabled)
    app.setLoginItemSettings(getLoginItemSettingsPayload(nextEnabled))
    launchAtStartupEnabled = nextEnabled
    store.set('launchAtStartupEnabled', launchAtStartupEnabled)
    return { enabled: launchAtStartupEnabled, supported: true }
}

function broadcastExitLockState() {
    const payload = { exitLockEnabled }
    if (win && !win.isDestroyed()) win.webContents.send('strict-exit-lock-state', payload)
    if (strictModeWindow && !strictModeWindow.isDestroyed()) strictModeWindow.webContents.send('strict-exit-lock-state', payload)
}

function broadcastScreenLockState() {
    const payload = { screenLockEnabled }
    if (strictModeWindow && !strictModeWindow.isDestroyed()) strictModeWindow.webContents.send('strict-screen-lock-state', payload)
    if (lockScreenWindow && !lockScreenWindow.isDestroyed()) lockScreenWindow.webContents.send('strict-screen-lock-state', payload)
}

function broadcastInteractionLockState() {
    const payload = { interactionLockEnabled }
    if (win && !win.isDestroyed()) win.webContents.send('strict-interaction-lock-state', payload)
    if (strictModeWindow && !strictModeWindow.isDestroyed()) strictModeWindow.webContents.send('strict-interaction-lock-state', payload)
    interactionLockWindows = interactionLockWindows.filter(currentWindow => currentWindow && !currentWindow.isDestroyed())
    interactionLockWindows.forEach(currentWindow => currentWindow.webContents.send('strict-interaction-lock-state', payload))
}

function broadcastWebsiteLockState() {
    const payload = {
        websiteLockEnabled,
        domains: websiteLockDomains,
        error: websiteLockError,
        hostsPath: HOSTS_PATH
    }
    if (win && !win.isDestroyed()) win.webContents.send('strict-website-lock-state', payload)
    if (strictModeWindow && !strictModeWindow.isDestroyed()) strictModeWindow.webContents.send('strict-website-lock-state', payload)
}

function closeLockScreenWindow() {
    if (!lockScreenWindow || lockScreenWindow.isDestroyed()) return
    forceCloseLockScreen = true
    lockScreenWindow.close()
}

function closeInteractionLockWindow() {
    interactionLockWindows = interactionLockWindows.filter(currentWindow => currentWindow && !currentWindow.isDestroyed())
    if (!interactionLockWindows.length) return
    forceCloseInteractionLock = true
    interactionLockWindows.forEach(currentWindow => currentWindow.close())
}

function formatWebsiteLockError(error) {
    if (!error) return 'No se pudo actualizar el archivo hosts.'
    if (error.code === 1223) return 'La elevacion a administrador fue cancelada.'
    return error.message || 'No se pudo actualizar el archivo hosts.'
}

async function deactivateWebsiteLock() {
    if (!websiteLockEnabled && !fs.existsSync(hostsBackupPath)) {
        websiteLockError = ''
        return { ok: true, enabled: false }
    }

    try {
        await restoreWebsiteBlock(hostsBackupPath)
        websiteLockEnabled = false
        websiteLockError = ''
        store.set('strictWebsiteLockEnabled', false)
        broadcastWebsiteLockState()
        return { ok: true, enabled: false }
    } catch (error) {
        websiteLockError = formatWebsiteLockError(error)
        broadcastWebsiteLockState()
        return { ok: false, enabled: websiteLockEnabled, error: websiteLockError }
    }
}

async function activateWebsiteLock(domains) {
    const normalizedDomains = normalizeWebsiteDomains(domains)
    if (!normalizedDomains.length) {
        websiteLockError = 'Agrega al menos un dominio valido para bloquear.'
        websiteLockDomains = []
        store.set('strictWebsiteLockDomains', websiteLockDomains)
        broadcastWebsiteLockState()
        return { ok: false, enabled: false, error: websiteLockError }
    }

    try {
        await applyWebsiteBlock(normalizedDomains, hostsBackupPath)
        websiteLockEnabled = true
        websiteLockDomains = normalizedDomains
        websiteLockError = ''
        store.set('strictWebsiteLockEnabled', true)
        store.set('strictWebsiteLockDomains', websiteLockDomains)
        broadcastWebsiteLockState()
        return { ok: true, enabled: true, domains: websiteLockDomains }
    } catch (error) {
        websiteLockEnabled = false
        websiteLockDomains = normalizedDomains
        websiteLockError = formatWebsiteLockError(error)
        store.set('strictWebsiteLockEnabled', false)
        store.set('strictWebsiteLockDomains', websiteLockDomains)
        broadcastWebsiteLockState()
        return { ok: false, enabled: false, error: websiteLockError }
    }
}

function getDisplayIntersection(rectA, rectB) {
    const x = Math.max(rectA.x, rectB.x)
    const y = Math.max(rectA.y, rectB.y)
    const right = Math.min(rectA.x + rectA.width, rectB.x + rectB.width)
    const bottom = Math.min(rectA.y + rectA.height, rectB.y + rectB.height)
    const width = right - x
    const height = bottom - y

    if (width <= 0 || height <= 0) return null
    return { x, y, width, height }
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max)
}

function getDisplayWorkAreas() {
    return screen.getAllDisplays().map(display => display.workArea)
}

function getLargestWorkArea() {
    return getDisplayWorkAreas().reduce((largest, area) => {
        if (!largest) return area
        return area.width * area.height >= largest.width * largest.height ? area : largest
    }, null)
}

function hasEnoughVisibleArea(bounds) {
    const minVisibleArea = Math.max(1600, Math.round(bounds.width * bounds.height * 0.2))

    return getDisplayWorkAreas().some(workArea => {
        const intersection = getDisplayIntersection(workArea, bounds)
        return intersection && (intersection.width * intersection.height) >= minVisibleArea
    })
}

function centerBoundsInWorkArea(bounds, workArea) {
    const width = Math.min(bounds.width, workArea.width)
    const height = Math.min(bounds.height, workArea.height)

    return {
        width,
        height,
        x: Math.round(workArea.x + ((workArea.width - width) / 2)),
        y: Math.round(workArea.y + ((workArea.height - height) / 2))
    }
}

function normalizeWindowBounds(rawBounds = {}) {
    const fallbackArea = getLargestWorkArea() || screen.getPrimaryDisplay().workArea
    const maxWidth = Math.max(72, fallbackArea.width)
    const maxHeight = Math.max(72, fallbackArea.height)
    const width = clamp(Math.round(rawBounds.width || 960), 72, maxWidth)
    const height = clamp(Math.round(rawBounds.height || 740), 72, maxHeight)
    const seedBounds = {
        x: Number.isFinite(rawBounds.x) ? Math.round(rawBounds.x) : fallbackArea.x,
        y: Number.isFinite(rawBounds.y) ? Math.round(rawBounds.y) : fallbackArea.y,
        width,
        height
    }

    const matchingArea = screen.getDisplayMatching(seedBounds).workArea
    const clampedBounds = {
        width,
        height,
        x: clamp(seedBounds.x, matchingArea.x, Math.max(matchingArea.x, matchingArea.x + matchingArea.width - width)),
        y: clamp(seedBounds.y, matchingArea.y, Math.max(matchingArea.y, matchingArea.y + matchingArea.height - height))
    }

    if (hasEnoughVisibleArea(clampedBounds)) {
        return clampedBounds
    }

    return centerBoundsInWorkArea(clampedBounds, screen.getPrimaryDisplay().workArea)
}

function persistWindowBounds(bounds) {
    store.set('windowPosition', { x: bounds.x, y: bounds.y })
    store.set('windowWidth', bounds.width)
    store.set('windowHeight', bounds.height)
}

function schedulePersistWindowBounds(bounds, delay = 120) {
    if (persistBoundsTimeout) clearTimeout(persistBoundsTimeout)
    persistBoundsTimeout = setTimeout(() => {
        persistBoundsTimeout = null
        persistWindowBounds(bounds)
    }, delay)
}

function ensureMainWindowVisible() {
    if (!win || win.isDestroyed()) return
    const safeBounds = normalizeWindowBounds(win.getBounds())
    win.setBounds(safeBounds)
    persistWindowBounds(safeBounds)
    if (!win.isVisible()) win.show()
    if (win.isMinimized()) win.restore()
    win.focus()
}

function getInteractionLockRects() {
    if (!win || win.isDestroyed()) return []

    const mainBounds = win.getBounds()
    return screen.getAllDisplays().flatMap(({ bounds }) => {
        const hole = getDisplayIntersection(bounds, mainBounds)
        if (!hole) return [bounds]

        const rects = [
            { x: bounds.x, y: bounds.y, width: bounds.width, height: hole.y - bounds.y },
            { x: bounds.x, y: hole.y, width: hole.x - bounds.x, height: hole.height },
            {
                x: hole.x + hole.width,
                y: hole.y,
                width: bounds.x + bounds.width - (hole.x + hole.width),
                height: hole.height
            },
            {
                x: bounds.x,
                y: hole.y + hole.height,
                width: bounds.width,
                height: bounds.y + bounds.height - (hole.y + hole.height)
            }
        ]

        return rects.filter(rect => rect.width > 0 && rect.height > 0)
    })
}

function createInteractionLockWindow() {
    const currentWindow = new BrowserWindow({
        show: false,
        frame: false,
        transparent: true,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        closable: true,
        skipTaskbar: true,
        alwaysOnTop: true,
        focusable: true,
        hasShadow: false,
        backgroundColor: '#00000000',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    })

    currentWindow.setAlwaysOnTop(true, 'screen-saver')
    currentWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    currentWindow.loadFile('interaction-lock.html')

    currentWindow.webContents.once('did-finish-load', () => {
        syncLockScreenTheme(currentWindow)
        currentWindow.webContents.send('strict-interaction-lock-state', { interactionLockEnabled })
    })

    currentWindow.on('focus', () => {
        if (!interactionLockEnabled || forceCloseInteractionLock) return
        currentWindow.webContents.send('strict-interaction-lock-blocked')
        if (win && !win.isDestroyed()) {
            setTimeout(() => {
                if (interactionLockEnabled && win && !win.isDestroyed()) win.focus()
            }, 40)
        }
    })

    currentWindow.on('close', (event) => {
        if (!interactionLockEnabled || forceCloseInteractionLock) return
        event.preventDefault()
        currentWindow.webContents.send('strict-interaction-lock-blocked')
        if (win && !win.isDestroyed()) win.focus()
    })

    currentWindow.on('closed', () => {
        interactionLockWindows = interactionLockWindows.filter(windowRef => windowRef !== currentWindow && windowRef && !windowRef.isDestroyed())
        if (!interactionLockWindows.length) {
            forceCloseInteractionLock = false
            if (interactionLockEnabled) {
                interactionLockEnabled = false
                store.set('strictInteractionLockEnabled', false)
                broadcastInteractionLockState()
            }
        }
    })

    return currentWindow
}

function updateInteractionLockWindows() {
    if (!interactionLockEnabled || !win || win.isDestroyed()) return

    const rects = getInteractionLockRects()
    interactionLockWindows = interactionLockWindows.filter(currentWindow => currentWindow && !currentWindow.isDestroyed())

    while (interactionLockWindows.length < rects.length) {
        interactionLockWindows.push(createInteractionLockWindow())
    }

    interactionLockWindows.forEach((currentWindow, index) => {
        const rect = rects[index]
        if (!rect) {
            currentWindow.hide()
            return
        }

        currentWindow.setBounds(rect)
        currentWindow.showInactive()
    })

    if (win && !win.isDestroyed()) {
        win.setAlwaysOnTop(true, 'screen-saver')
        win.focus()
    }
}

async function disableOtherStrictModes(exceptMode) {
    if (exceptMode !== 'exit' && exitLockEnabled) {
        exitLockEnabled = false
        store.set('strictExitLockEnabled', false)
        broadcastExitLockState()
    }

    if (exceptMode !== 'screen' && screenLockEnabled) {
        screenLockEnabled = false
        store.set('strictScreenLockEnabled', false)
        closeLockScreenWindow()
        broadcastScreenLockState()
    }

    if (exceptMode !== 'interaction' && interactionLockEnabled) {
        interactionLockEnabled = false
        store.set('strictInteractionLockEnabled', false)
        closeInteractionLockWindow()
        broadcastInteractionLockState()
    }

    if (exceptMode !== 'website' && websiteLockEnabled) {
        const result = await deactivateWebsiteLock()
        if (!result.ok) return false
    }

    return true
}

async function setExitLockEnabled(enabled) {
    if (enabled) {
        const canContinue = await disableOtherStrictModes('exit')
        if (!canContinue) return
    }
    exitLockEnabled = Boolean(enabled)
    store.set('strictExitLockEnabled', exitLockEnabled)
    broadcastExitLockState()
}

function syncLockScreenTheme(targetWindow) {
    if (!targetWindow || targetWindow.isDestroyed() || !win || win.isDestroyed()) return
    const payload = {
        accentColor: store.get('accentColor', '#3b82f6'),
        textColor: store.get('textColor', '#ffffff'),
        theme: store.get('dashTheme', 'glass'),
        font: store.get('fontFamily', 'Inter')
    }
    targetWindow.webContents.send('apply-colors', payload)
}

function openLockScreenWindow() {
    if (lockScreenWindow && !lockScreenWindow.isDestroyed()) {
        lockScreenWindow.focus()
        return
    }

    lockScreenWindow = new BrowserWindow({
        fullscreen: true,
        frame: false,
        transparent: false,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        closable: true,
        skipTaskbar: true,
        alwaysOnTop: true,
        backgroundColor: '#020617',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    })

    lockScreenWindow.setAlwaysOnTop(true, 'screen-saver')
    lockScreenWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    lockScreenWindow.loadFile('lock-screen.html')

    lockScreenWindow.webContents.once('did-finish-load', () => {
        syncLockScreenTheme(lockScreenWindow)
        broadcastScreenLockState()
    })

    lockScreenWindow.on('close', (event) => {
        if (!screenLockEnabled || forceCloseLockScreen) return
        event.preventDefault()
        if (lockScreenWindow && !lockScreenWindow.isDestroyed()) {
            lockScreenWindow.webContents.send('strict-screen-lock-blocked')
            lockScreenWindow.focus()
        }
    })

    lockScreenWindow.on('closed', () => {
        lockScreenWindow = null
        if (screenLockEnabled) {
            screenLockEnabled = false
            store.set('strictScreenLockEnabled', false)
            broadcastScreenLockState()
        }
        forceCloseLockScreen = false
    })
}

async function setScreenLockEnabled(enabled) {
    if (enabled) {
        const canContinue = await disableOtherStrictModes('screen')
        if (!canContinue) return
    }
    screenLockEnabled = Boolean(enabled)
    store.set('strictScreenLockEnabled', screenLockEnabled)

    if (screenLockEnabled) {
        if (win && !win.isDestroyed()) {
            win.webContents.send('strict-screen-lock-activated')
        }
        openLockScreenWindow()
    } else if (lockScreenWindow && !lockScreenWindow.isDestroyed()) {
        forceCloseLockScreen = true
        lockScreenWindow.close()
    }

    broadcastScreenLockState()
}

async function setInteractionLockEnabled(enabled) {
    if (enabled) {
        const canContinue = await disableOtherStrictModes('interaction')
        if (!canContinue) return
    }
    interactionLockEnabled = Boolean(enabled)
    store.set('strictInteractionLockEnabled', interactionLockEnabled)

    if (interactionLockEnabled) {
        if (win && !win.isDestroyed()) {
            win.webContents.send('strict-interaction-lock-activated')
        }
        updateInteractionLockWindows()
    } else {
        closeInteractionLockWindow()
        if (win && !win.isDestroyed()) win.setAlwaysOnTop(true)
    }

    broadcastInteractionLockState()
}

function createWindow(){

const position = store.get('windowPosition') || { x:100, y:100 }
const initialBounds = normalizeWindowBounds({
    x: position.x,
    y: position.y,
    width: store.get('windowWidth') || 960,
    height: store.get('windowHeight') || 740
})

win = new BrowserWindow({

x: initialBounds.x,
y: initialBounds.y,
width: initialBounds.width,
height: initialBounds.height,

show:false,

frame:false,
transparent:true,
alwaysOnTop:true,
resizable:false,

webPreferences:{
nodeIntegration:true,
contextIsolation:false
}

})

persistWindowBounds(initialBounds)

win.loadFile('index.html')

win.once('ready-to-show', () => {
    ensureMainWindowVisible()
})

win.webContents.once('did-finish-load', () => {
    ensureMainWindowVisible()
    spawnPS()
    broadcastExitLockState()
    broadcastWebsiteLockState()
    if (screenLockEnabled) {
        win.webContents.send('strict-screen-lock-activated')
        openLockScreenWindow()
    }
    if (interactionLockEnabled) {
        win.webContents.send('strict-interaction-lock-activated')
        updateInteractionLockWindows()
    }
})

win.on('move', () => {

if(win){
const { x, y, width, height } = win.getBounds()
schedulePersistWindowBounds({ x, y, width, height })
if (interactionLockEnabled) updateInteractionLockWindows()
}

})

win.on('resize', () => {
const { x, y, width, height } = win.getBounds()
schedulePersistWindowBounds({ x, y, width, height })
if (interactionLockEnabled) updateInteractionLockWindows()
})

win.on('focus', () => {
    win.flashFrame(false)
    if (flashTimeout) {
        clearTimeout(flashTimeout)
        flashTimeout = null
    }
    if (interactionLockEnabled) updateInteractionLockWindows()
})

win.on('blur', () => {
    if (!interactionLockEnabled) return
    setTimeout(() => {
        if (interactionLockEnabled && win && !win.isDestroyed()) {
            win.focus()
            updateInteractionLockWindows()
        }
    }, 80)
})

win.on('close', (event) => {
    if (!exitLockEnabled || forceQuit) return
    event.preventDefault()
    if (win && !win.isDestroyed()) win.webContents.send('strict-exit-lock-blocked')
})

}

function openSettings(){

if(settingsWindow) return

settingsWindow = new BrowserWindow({

width: 960,
height: 740,
resizable: false,
frame: false,
transparent: true,
alwaysOnTop: true,

webPreferences:{
nodeIntegration:true,
contextIsolation:false
}

})

settingsWindow.loadFile("settings.html")

settingsWindow.on('closed', () => {
settingsWindow = null
})

}

function openStrictMode(){

if(strictModeWindow) {
strictModeWindow.focus()
return
}

strictModeWindow = new BrowserWindow({

width: 540,
height: 680,
resizable: false,
frame: false,
transparent: true,
alwaysOnTop: true,

webPreferences:{
nodeIntegration:true,
contextIsolation:false
}

})

strictModeWindow.loadFile("strict-mode.html")

strictModeWindow.webContents.once('did-finish-load', () => {
strictModeWindow.webContents.send('strict-exit-lock-state', { exitLockEnabled })
strictModeWindow.webContents.send('strict-screen-lock-state', { screenLockEnabled })
strictModeWindow.webContents.send('strict-interaction-lock-state', { interactionLockEnabled })
strictModeWindow.webContents.send('strict-website-lock-state', {
    websiteLockEnabled,
    domains: websiteLockDomains,
    error: websiteLockError,
    hostsPath: HOSTS_PATH
})
})

strictModeWindow.on('closed', () => {
strictModeWindow = null
})

}

ipcMain.on('open-settings', openSettings)
ipcMain.on('open-strict-mode', openStrictMode)

ipcMain.on('close-settings', () => {

if(settingsWindow){
settingsWindow.close()
}

})

ipcMain.on('close-strict-mode', () => {

if(strictModeWindow){
strictModeWindow.close()
}

})

ipcMain.on('set-strict-exit-lock', (event, enabled) => {
void setExitLockEnabled(enabled)
})

ipcMain.on('set-strict-screen-lock', (event, enabled) => {
void setScreenLockEnabled(enabled)
})

ipcMain.on('set-strict-interaction-lock', (event, enabled) => {
void setInteractionLockEnabled(enabled)
})

ipcMain.on('set-strict-website-domains', (event, domains = []) => {
    websiteLockDomains = normalizeWebsiteDomains(domains)
    websiteLockError = ''
    store.set('strictWebsiteLockDomains', websiteLockDomains)
    broadcastWebsiteLockState()
})

ipcMain.handle('set-strict-website-lock', async (event, payload = {}) => {
    const enabled = Boolean(payload.enabled)
    const requestedDomains = Array.isArray(payload.domains) ? payload.domains : websiteLockDomains

    if (enabled) {
        const canContinue = await disableOtherStrictModes('website')
        if (!canContinue) {
            return { ok: false, enabled: false, error: websiteLockError || 'No se pudo desactivar el otro modo estricto activo.' }
        }
        return activateWebsiteLock(requestedDomains)
    }

    return deactivateWebsiteLock()
})

ipcMain.on('save-settings', (event, data) => {

if(win) win.webContents.send('apply-colors', data)
if(strictModeWindow) strictModeWindow.webContents.send('apply-colors', data)
if(lockScreenWindow) lockScreenWindow.webContents.send('apply-colors', data)
interactionLockWindows = interactionLockWindows.filter(currentWindow => currentWindow && !currentWindow.isDestroyed())
interactionLockWindows.forEach(currentWindow => currentWindow.webContents.send('apply-colors', data))
if(settingsWindow) settingsWindow.close()

})

ipcMain.handle('get-launch-at-startup', () => {
    return {
        enabled: launchAtStartupEnabled,
        supported: process.platform === 'win32'
    }
})

ipcMain.handle('set-launch-at-startup', (event, enabled) => {
    try {
        return setLaunchAtStartupEnabled(enabled)
    } catch (error) {
        return {
            enabled: launchAtStartupEnabled,
            supported: process.platform === 'win32',
            error: error.message || 'No se pudo actualizar el inicio automatico.'
        }
    }
})

ipcMain.on('close-app', () => {
if (exitLockEnabled) {
if (win && !win.isDestroyed()) win.webContents.send('strict-exit-lock-blocked')
return
}
app.quit()
})

ipcMain.on('minimize-app', () => {
if(win && !win.isDestroyed()) win.minimize()
})

ipcMain.on('set-window-width', (event, width) => {
    if (!win || win.isDestroyed()) return
    const currentBounds = win.getBounds()
    const nextBounds = normalizeWindowBounds({
        ...currentBounds,
        width: Math.max(72, Math.min(1300, Math.round(width)))
    })
    if (
        nextBounds.x === currentBounds.x &&
        nextBounds.y === currentBounds.y &&
        nextBounds.width === currentBounds.width &&
        nextBounds.height === currentBounds.height
    ) return
    win.setBounds(nextBounds)
    schedulePersistWindowBounds(nextBounds)
    if (interactionLockEnabled) updateInteractionLockWindows()
})

ipcMain.on('set-window-size', (event, size = {}) => {
    if (!win || win.isDestroyed()) return
    const currentBounds = win.getBounds()
    const nextBounds = normalizeWindowBounds({
        ...currentBounds,
        width: Number.isFinite(size.width) ? size.width : currentBounds.width,
        height: Number.isFinite(size.height) ? size.height : currentBounds.height
    })
    if (
        nextBounds.x === currentBounds.x &&
        nextBounds.y === currentBounds.y &&
        nextBounds.width === currentBounds.width &&
        nextBounds.height === currentBounds.height
    ) return
    win.setBounds(nextBounds)
    schedulePersistWindowBounds(nextBounds)
    if (interactionLockEnabled) updateInteractionLockWindows()
})

ipcMain.handle('get-window-position', () => {
    if (!win || win.isDestroyed()) return { x: 0, y: 0 }
    const [x, y] = win.getPosition()
    return { x, y }
})

ipcMain.on('set-window-position', (event, position = {}) => {
    if (!win || win.isDestroyed()) return
    const currentBounds = win.getBounds()
    const nextBounds = normalizeWindowBounds({
        ...currentBounds,
        x: Number.isFinite(position.x) ? Math.round(position.x) : currentBounds.x,
        y: Number.isFinite(position.y) ? Math.round(position.y) : currentBounds.y
    })
    if (nextBounds.x === currentBounds.x && nextBounds.y === currentBounds.y) return
    win.setBounds(nextBounds)
    schedulePersistWindowBounds(nextBounds)
    if (interactionLockEnabled) updateInteractionLockWindows()
})

ipcMain.on('focus-main-window', () => {
    if (!win || win.isDestroyed()) return
    win.focus()
    if (interactionLockEnabled) updateInteractionLockWindows()
})

ipcMain.on('pomodoro-alert', (event, payload = {}) => {
    const title = payload.title || 'Pomodoro'
    const body  = payload.body || 'El temporizador terminó.'

    if (Notification.isSupported()) {
        new Notification({ title, body, silent: true }).show()
    }

    if (win && !win.isDestroyed()) {
        win.flashFrame(true)
        if (flashTimeout) clearTimeout(flashTimeout)
        flashTimeout = setTimeout(() => {
            if (win && !win.isDestroyed()) win.flashFrame(false)
            flashTimeout = null
        }, 6000)
    }
})

/* =====================
   MEDIA BRIDGE — proceso PowerShell persistente
   Add-Type + RequestAsync solo al arrancar (1 vez).
   Cada poll/control = stdin → stdout, sin fork.
   ===================== */
const PS_BRIDGE = [
    '$ErrorActionPreference="SilentlyContinue"',
    'Add-Type -AssemblyName System.Runtime.WindowsRuntime',
    "$_atg=([System.WindowsRuntimeSystemExtensions].GetMethods()|Where-Object{$_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'})[0]",
    'function __Await($t,$rt){try{$m=$_atg.MakeGenericMethod($rt);$n=$m.Invoke($null,@($t));$n.Wait(-1)|Out-Null;return $n.Result}catch{return $null}}',
    '[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media,ContentType=WindowsRuntime]|Out-Null',
    '[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties,Windows.Media,ContentType=WindowsRuntime]|Out-Null',
    'try{$_mgr=__Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])}catch{$_mgr=$null}',
    'Write-Output "INIT_OK"',
    '[Console]::Out.Flush()',
    'while($true){',
    '  $cmd=[Console]::ReadLine()',
    '  if($null -eq $cmd){break}',
    '  $cmd=$cmd.Trim()',
    '  try{',
    '    $s=$_mgr.GetCurrentSession()',
    '    switch($cmd){',
    '      "status"{',
    '        if($s){',
    '          $p=__Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])',
    '          $t=$s.GetTimelineProperties()',
    '          $pb=$s.GetPlaybackInfo()',
    '          Write-Output ([PSCustomObject]@{title=$p.Title;artist=$p.Artist;position=[math]::Round($t.Position.TotalSeconds,1);duration=[math]::Round($t.EndTime.TotalSeconds,1);status=$pb.PlaybackStatus.ToString()}|ConvertTo-Json -Compress)',
    '        }else{Write-Output "{}"}',
    '      }',
    '      "toggle"{if($s){$s.TryTogglePlayPauseAsync()|Out-Null};Write-Output "{}"}',
    '      "next"{if($s){$s.TrySkipNextAsync()|Out-Null};Write-Output "{}"}',
    '      "prev"{if($s){$s.TrySkipPreviousAsync()|Out-Null};Write-Output "{}"}',
    '      default{Write-Output "{}"}',
    '    }',
    '  }catch{Write-Output "{}"}',
    '  Write-Output "###END###"',
    '  [Console]::Out.Flush()',
    '}'
].join('\n')

const scriptPath = path.join(os.tmpdir(), 'pw-media-bridge.ps1')
let psProc      = null
let psBuffer    = ''
const psCbs     = []
let pollPending = false
let psReady     = false

function spawnPS() {
    psReady = false
    fs.writeFileSync(scriptPath, PS_BRIDGE, 'utf8')
    psProc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', scriptPath], {
        stdio: ['pipe', 'pipe', 'ignore']
    })
    psProc.stdout.on('data', chunk => {
        psBuffer += chunk.toString()
        if (!psReady) {
            const initIdx = psBuffer.indexOf('INIT_OK')
            if (initIdx === -1) return
            psReady = true
            psBuffer = psBuffer.slice(initIdx + 7).replace(/^\r?\n/, '')
            startMediaPolling()
        }
        let idx
        while ((idx = psBuffer.indexOf('###END###')) !== -1) {
            const response = psBuffer.slice(0, idx).trim()
            psBuffer = psBuffer.slice(idx + 9).replace(/^\r?\n/, '')
            const cb = psCbs.shift()
            if (cb) cb(response)
        }
    })
    psProc.on('close', () => {
        psProc  = null
        psReady = false
        psBuffer = ''
        pollPending = false
        while (psCbs.length) { const cb = psCbs.shift(); if (cb) cb('{}') }
        setTimeout(spawnPS, 5000)
    })
}

function psCmd(command, cb) {
    if (!psProc || !psReady) { if (cb) cb('{}'); return }
    psCbs.push(cb || (() => {}))
    psProc.stdin.write(command + '\n')
}

let mediaPollInterval = null

function startMediaPolling() {
    if (mediaPollInterval) return
    mediaPollInterval = setInterval(() => {
        if (!win || win.isDestroyed() || pollPending) return
        pollPending = true
        psCmd('status', response => {
            pollPending = false
            try {
                const data = JSON.parse(response)
                if (win && !win.isDestroyed()) win.webContents.send('media-info', data)
            } catch(_) {}
        })
    }, 1000)
}

ipcMain.on('media-control', (event, action) => {
    psCmd(action, () => {})
})

async function bootstrapApp() {
    if (fs.existsSync(hostsBackupPath)) {
        await deactivateWebsiteLock()
    } else if (websiteLockEnabled) {
        websiteLockEnabled = false
        store.set('strictWebsiteLockEnabled', false)
    }

    createWindow()
}

app.on('before-quit', (event) => {
    if (!websiteLockCleanupInProgress && (websiteLockEnabled || fs.existsSync(hostsBackupPath))) {
        event.preventDefault()
        websiteLockCleanupInProgress = true
        deactivateWebsiteLock().finally(() => {
            app.quit()
        })
        return
    }

    forceQuit = true
    forceCloseLockScreen = true
    forceCloseInteractionLock = true
    if (persistBoundsTimeout) {
        clearTimeout(persistBoundsTimeout)
        persistBoundsTimeout = null
    }
    if (win && !win.isDestroyed()) persistWindowBounds(win.getBounds())
    if (mediaPollInterval) { clearInterval(mediaPollInterval); mediaPollInterval = null }
    try { if (psProc) { psProc.kill(); psProc = null } } catch(_) {}
    try { fs.unlinkSync(scriptPath) } catch(_) {}
})

app.whenReady().then(() => {
    try {
        app.setLoginItemSettings(getLoginItemSettingsPayload(launchAtStartupEnabled))
    } catch (_) {}
    void bootstrapApp()
})

app.on('window-all-closed', () => {
if(process.platform !== 'darwin') app.quit()
})