const { app, BrowserWindow, ipcMain, Notification, screen, dialog } = require('electron')
const Store = require('electron-store')
const { spawn, spawnSync } = require('child_process')
const { createHash, randomUUID } = require('crypto')
const os   = require('os')
const path = require('path')
const fs   = require('fs')
const { HOSTS_PATH, applyWebsiteBlock, normalizeWebsiteDomains, restoreWebsiteBlock } = require('./website-blocker')

const store = new Store()
const ACTIVATE_LICENSE_URL = process.env.ACTIVATE_LICENSE_URL || 'https://kcysjrjllelgcrwuwwuy.functions.supabase.co/activate-license'
const ENABLE_FOCUS_PRO_TRIAL_BUTTON = process.env.ENABLE_FOCUS_PRO_TRIAL_BUTTON !== 'false'
const LICENSE_STORE_KEY = 'license'
const DEVICE_FINGERPRINT_STORE_KEY = 'deviceFingerprint'
let cachedDeviceFingerprint = null

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
let snapMoveTimeout = null
let suppressMoveSnap = false
let exitLockEnabled = store.get('strictExitLockEnabled', false)
let screenLockEnabled = store.get('strictScreenLockEnabled', false)
let interactionLockEnabled = store.get('strictInteractionLockEnabled', false)
let websiteLockEnabled = store.get('strictWebsiteLockEnabled', false)
let websiteLockDomains = normalizeWebsiteDomains(store.get('strictWebsiteLockDomains', ['youtube.com', 'facebook.com', 'twitter.com']))
let websiteLockError = ''
let launchAtStartupEnabled = store.get('launchAtStartupEnabled', false)
const hostsBackupPath = path.join(app.getPath('userData'), 'hosts.strict-mode.backup')

function createDefaultFeatureState() {
    return {
        windowModeBar: false,
        windowModeCollapsed: false,
        pomodoroSound: false,
        pomodoroSoundIntensity: false,
        customAccentColors: false,
        customTextColors: false,
        customThemes: false,
        customFonts: false,
        customBackground: false,
        strictScreenLock: false,
        strictInteractionLock: false,
        strictWebsiteBlock: false
    }
}

function createDefaultLicenseState() {
    return {
        planCode: 'free',
        planName: 'Free',
        status: 'inactive',
        isPro: false,
        isTrial: false,
        licenseKeyMasked: '',
        deviceFingerprint: '',
        activatedAt: null,
        features: createDefaultFeatureState()
    }
}

function getStoredLicenseState() {
    const storedLicense = store.get(LICENSE_STORE_KEY, {}) || {}
    return {
        ...createDefaultLicenseState(),
        ...storedLicense,
        features: {
            ...createDefaultFeatureState(),
            ...(storedLicense.features || {})
        }
    }
}

function saveLicenseState(nextState) {
    const normalizedLicenseState = {
        ...createDefaultLicenseState(),
        ...nextState,
        features: {
            ...createDefaultFeatureState(),
            ...((nextState && nextState.features) || {})
        }
    }
    store.set(LICENSE_STORE_KEY, normalizedLicenseState)
    return normalizedLicenseState
}

function broadcastLicenseState() {
    const payload = getStoredLicenseState()
    if (win && !win.isDestroyed()) win.webContents.send('license-state-updated', payload)
    if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.webContents.send('license-state-updated', payload)
    if (strictModeWindow && !strictModeWindow.isDestroyed()) strictModeWindow.webContents.send('license-state-updated', payload)
    if (lockScreenWindow && !lockScreenWindow.isDestroyed()) lockScreenWindow.webContents.send('license-state-updated', payload)
    interactionLockWindows = interactionLockWindows.filter(currentWindow => currentWindow && !currentWindow.isDestroyed())
    interactionLockWindows.forEach(currentWindow => currentWindow.webContents.send('license-state-updated', payload))
}

function readWindowsMachineGuid() {
    if (process.platform !== 'win32') return ''

    try {
        const query = spawnSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], {
            encoding: 'utf8',
            windowsHide: true
        })

        if (query.error || query.status !== 0 || !query.stdout) return ''

        const match = query.stdout.match(/MachineGuid\s+REG_SZ\s+([^\r\n]+)/i)
        return match ? String(match[1]).trim() : ''
    } catch (_) {
        return ''
    }
}

function resolveFallbackDeviceSeed() {
    let fallbackSeed = store.get(DEVICE_FINGERPRINT_STORE_KEY, '')
    if (fallbackSeed) return fallbackSeed

    fallbackSeed = randomUUID()
    store.set(DEVICE_FINGERPRINT_STORE_KEY, fallbackSeed)
    return fallbackSeed
}

function getDeviceFingerprint() {
    if (cachedDeviceFingerprint) return cachedDeviceFingerprint

    const machineGuid = readWindowsMachineGuid()
    const seed = machineGuid || resolveFallbackDeviceSeed()
    cachedDeviceFingerprint = createHash('sha256').update(seed).digest('hex')
    store.set(DEVICE_FINGERPRINT_STORE_KEY, cachedDeviceFingerprint)
    return cachedDeviceFingerprint
}

function maskLicenseKey(licenseKey) {
    if (typeof licenseKey !== 'string' || !licenseKey.trim()) return ''
    if (licenseKey.length <= 8) return licenseKey
    return `${licenseKey.slice(0, 4)}-****-****-${licenseKey.slice(-4)}`
}

function createFocusProTrialLicenseState(deviceFingerprint) {
    return saveLicenseState({
        planCode: 'focus_pro',
        planName: 'Focus Pro Trial',
        status: 'active',
        isPro: true,
        isTrial: true,
        licenseKeyMasked: 'TRIAL',
        deviceFingerprint,
        activatedAt: new Date().toISOString(),
        features: {
            windowModeBar: true,
            windowModeCollapsed: true,
            pomodoroSound: true,
            pomodoroSoundIntensity: true,
            customAccentColors: true,
            customTextColors: true,
            customThemes: true,
            customFonts: true,
            customBackground: true,
            strictScreenLock: true,
            strictInteractionLock: true,
            strictWebsiteBlock: true
        }
    })
}

function clearLicenseState() {
    return saveLicenseState({
        ...createDefaultLicenseState(),
        deviceFingerprint: getDeviceFingerprint()
    })
}

async function activateFocusProLicense(payload = {}) {
    const licenseKey = typeof payload.licenseKey === 'string' ? payload.licenseKey.trim() : ''

    if (!licenseKey) {
        return {
            ok: false,
            code: 'MISSING_LICENSE_KEY',
            message: 'El codigo de licencia es obligatorio.'
        }
    }

    const requestBody = {
        licenseKey,
        deviceFingerprint: getDeviceFingerprint(),
        deviceName: os.hostname(),
        osName: os.platform(),
        osVersion: os.release(),
        appVersion: app.getVersion()
    }

    try {
        const response = await fetch(ACTIVATE_LICENSE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        })

        const result = await response.json().catch(() => ({}))

        if (!response.ok || result?.ok === false) {
            return {
                ok: false,
                code: result?.code || 'ACTIVATION_FAILED',
                message: result?.message || 'No se pudo activar Focus Pro.'
            }
        }

        const nextLicenseState = saveLicenseState({
            planCode: result?.plan?.code || 'focus_pro',
            planName: result?.plan?.name || 'Focus Pro',
            status: result?.license?.status || 'active',
            isPro: true,
            licenseKeyMasked: result?.license?.licenseKeyMasked || maskLicenseKey(licenseKey),
            deviceFingerprint: requestBody.deviceFingerprint,
            activatedAt: result?.activation?.activatedAt || new Date().toISOString(),
            features: {
                ...createDefaultFeatureState(),
                ...(result?.features || {})
            }
        })

        broadcastLicenseState()

        return {
            ok: true,
            message: result?.message || 'PRO activado correctamente',
            license: nextLicenseState
        }
    } catch (error) {
        return {
            ok: false,
            code: 'NETWORK_ERROR',
            message: error?.message || 'No se pudo conectar con el servidor de activacion.'
        }
    }
}

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

function getSnappedBounds(rawBounds, threshold = 18) {
    const safeBounds = normalizeWindowBounds(rawBounds)
    const workArea = screen.getDisplayMatching(safeBounds).workArea
    const distances = {
        left: Math.abs(safeBounds.x - workArea.x),
        right: Math.abs((safeBounds.x + safeBounds.width) - (workArea.x + workArea.width)),
        top: Math.abs(safeBounds.y - workArea.y),
        bottom: Math.abs((safeBounds.y + safeBounds.height) - (workArea.y + workArea.height))
    }

    let nextX = safeBounds.x
    let nextY = safeBounds.y

    if (distances.left <= threshold || distances.right <= threshold) {
        nextX = distances.left <= distances.right
            ? workArea.x
            : workArea.x + workArea.width - safeBounds.width
    }

    if (distances.top <= threshold || distances.bottom <= threshold) {
        nextY = distances.top <= distances.bottom
            ? workArea.y
            : workArea.y + workArea.height - safeBounds.height
    }

    return {
        ...safeBounds,
        x: nextX,
        y: nextY
    }
}

function applySnapToMainWindow(delay = 140) {
    if (!win || win.isDestroyed()) return
    if (snapMoveTimeout) clearTimeout(snapMoveTimeout)

    snapMoveTimeout = setTimeout(() => {
        snapMoveTimeout = null
        if (!win || win.isDestroyed()) return

        const currentBounds = win.getBounds()
        const snappedBounds = getSnappedBounds(currentBounds)
        const didChange = (
            snappedBounds.x !== currentBounds.x ||
            snappedBounds.y !== currentBounds.y ||
            snappedBounds.width !== currentBounds.width ||
            snappedBounds.height !== currentBounds.height
        )

        if (!didChange) return

        suppressMoveSnap = true
        win.setBounds(snappedBounds)
        schedulePersistWindowBounds(snappedBounds)
        if (interactionLockEnabled) updateInteractionLockWindows()
        setTimeout(() => {
            suppressMoveSnap = false
        }, 0)
    }, delay)
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
        font: store.get('fontFamily', 'Inter'),
        license: getStoredLicenseState()
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
contextIsolation:false,
backgroundThrottling:false
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
    broadcastLicenseState()
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
if (!suppressMoveSnap) applySnapToMainWindow()
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

settingsWindow.webContents.once('did-finish-load', () => {
settingsWindow.webContents.send('license-state-updated', getStoredLicenseState())
})

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
strictModeWindow.webContents.send('license-state-updated', getStoredLicenseState())
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

/* ---- Fondo personalizado ---- */
ipcMain.handle('select-custom-bg', async () => {
    const parentWin = settingsWindow || win
    const result = await dialog.showOpenDialog(parentWin, {
        title: 'Seleccionar fondo',
        filters: [{ name: 'Imágenes', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] }],
        properties: ['openFile']
    })
    if (result.canceled || !result.filePaths.length) return { canceled: true }

    const src = result.filePaths[0]
    const ext = path.extname(src)
    const dest = path.join(app.getPath('userData'), `custom-bg${ext}`)
    fs.copyFileSync(src, dest)
    return { canceled: false, filePath: dest }
})

ipcMain.handle('remove-custom-bg', () => {
    const userData = app.getPath('userData')
    for (const f of fs.readdirSync(userData)) {
        if (f.startsWith('custom-bg.')) {
            try { fs.unlinkSync(path.join(userData, f)) } catch (_) {}
        }
    }
    return { ok: true }
})

ipcMain.on('save-settings', (event, data) => {

if(win) win.webContents.send('apply-colors', data)
if(strictModeWindow) strictModeWindow.webContents.send('apply-colors', data)
if(lockScreenWindow) lockScreenWindow.webContents.send('apply-colors', data)
interactionLockWindows = interactionLockWindows.filter(currentWindow => currentWindow && !currentWindow.isDestroyed())
interactionLockWindows.forEach(currentWindow => currentWindow.webContents.send('apply-colors', data))
if(settingsWindow) settingsWindow.close()

})

ipcMain.handle('get-license-state', () => {
    const currentLicenseState = getStoredLicenseState()
    if (!currentLicenseState.deviceFingerprint) {
        currentLicenseState.deviceFingerprint = getDeviceFingerprint()
        saveLicenseState(currentLicenseState)
    }
    return currentLicenseState
})

ipcMain.handle('activate-license', async (event, payload = {}) => {
    return activateFocusProLicense(payload)
})

ipcMain.handle('get-trial-license-availability', () => {
    return {
        enabled: ENABLE_FOCUS_PRO_TRIAL_BUTTON
    }
})

ipcMain.handle('activate-trial-license', () => {
    if (!ENABLE_FOCUS_PRO_TRIAL_BUTTON) {
        return {
            ok: false,
            message: 'La prueba Pro esta desactivada en esta build.'
        }
    }

    const nextLicenseState = createFocusProTrialLicenseState(getDeviceFingerprint())
    broadcastLicenseState()
    return {
        ok: true,
        license: nextLicenseState
    }
})

ipcMain.handle('deactivate-trial-license', () => {
    const currentLicenseState = getStoredLicenseState()
    if (!currentLicenseState.isTrial) {
        return {
            ok: false,
            message: 'No hay una prueba Pro activa para desactivar.'
        }
    }

    const nextLicenseState = clearLicenseState()
    broadcastLicenseState()
    return {
        ok: true,
        license: nextLicenseState
    }
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
if (exitLockEnabled) {
if (win && !win.isDestroyed()) win.webContents.send('strict-exit-lock-blocked')
return
}
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
    '          Write-Output ([PSCustomObject]@{title=$p.Title;artist=$p.Artist;position=[math]::Round($t.Position.TotalSeconds,1);duration=[math]::Round($t.EndTime.TotalSeconds,1);status=$pb.PlaybackStatus.ToString();isPlaying=($pb.PlaybackStatus.ToString() -eq "Playing");capturedAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()}|ConvertTo-Json -Compress)',
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

/* Estado para interpolar posición cuando Windows SMTC devuelve datos cacheados */
const mediaBridge = {
    lastRawPos: NaN,
    lastRawPosChangedAt: 0,
    lastTitle: ''
}

function startMediaPolling() {
    if (mediaPollInterval) return
    mediaPollInterval = setInterval(() => {
        if (!win || win.isDestroyed() || pollPending) return
        pollPending = true
        psCmd('status', response => {
            pollPending = false
            try {
                const data = JSON.parse(response)
                if (!data || !win || win.isDestroyed()) return

                const rawPos    = Number(data.position)
                const rawDur    = Number(data.duration)
                const isPlaying = !!data.isPlaying
                const title     = data.title || ''
                const now       = Date.now()

                const posChanged   = !Number.isFinite(mediaBridge.lastRawPos)
                    || Math.abs(rawPos - mediaBridge.lastRawPos) > 0.05
                const trackChanged = title !== mediaBridge.lastTitle

                if (posChanged || trackChanged) {
                    mediaBridge.lastRawPos          = rawPos
                    mediaBridge.lastRawPosChangedAt = now
                    mediaBridge.lastTitle           = title
                }

                /* Si está reproduciendo y Windows repite la misma posición → interpolar */
                if (isPlaying && !posChanged && !trackChanged
                    && Number.isFinite(mediaBridge.lastRawPos)) {
                    const elapsed      = (now - mediaBridge.lastRawPosChangedAt) / 1000
                    const interpolated = mediaBridge.lastRawPos + elapsed
                    data.position = (Number.isFinite(rawDur) && rawDur > 0)
                        ? Math.min(interpolated, rawDur)
                        : interpolated
                }

                /* capturedAt fresco para que el renderer no compense de más */
                data.capturedAt = now

                win.webContents.send('media-info', data)
            } catch(_) {}
        })
    }, 350)
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
    if (snapMoveTimeout) {
        clearTimeout(snapMoveTimeout)
        snapMoveTimeout = null
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