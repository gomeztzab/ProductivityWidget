/* =====================
   SETTINGS IPC (guard: el bot�n puede no existir en esta vista)
   ===================== */

const { ipcRenderer } = require('electron')

const configBtn = document.getElementById("configBtn")
const viewModesBtn = document.getElementById("viewModesBtn")
const viewModesPanel = document.getElementById("viewModesPanel")
const viewModesCloseBtn = document.getElementById("viewModesCloseBtn")
const viewModesCurrentLabel = document.getElementById("viewModesCurrentLabel")
const viewModeOptions = Array.from(document.querySelectorAll('.view-modes__option'))
const collapsedExpandBtn = document.getElementById('collapsedExpandBtn')
const minimizeBtn = document.getElementById("minimizeBtn")
const closeBtn  = document.getElementById("closeBtn")
const strictModeBtn = document.getElementById("strictModeBtn")
const strictModeBtnLabel = strictModeBtn ? strictModeBtn.querySelector("span") : null
const expandViewModeBtn = document.getElementById('expandViewModeBtn')
const clockCard = document.querySelector('.clock')
const clockTimeWrap = document.querySelector('.clock__time')
const clockValue = document.getElementById('clock')
const clockPeriod = document.getElementById('clockPeriod')
const VIEW_MODE_STORAGE_KEY = 'dashboardViewModeDraft'
const VIEW_MODE_LABELS = {
    full: 'viewModes.full',
    compact: 'viewModes.compact',
    mini: 'viewModes.mini',
    bar: 'viewModes.bar',
    collapsed: 'viewModes.collapsed'
}
const VIEW_MODE_WIDTHS = {
    full: null,
    compact: 432,
    mini: 210,
    bar: 760,
    collapsed: 82
}
const VIEW_MODE_HEIGHTS = {
    full: 740,
    compact: 360,
    mini: 196,
    bar: 178,
    collapsed: 82
}
const VIEW_MODE_WIDTH_GROWTH = {
    full: 40,
    compact: 0,
    mini: 0,
    bar: 0,
    collapsed: 0
}
let selectedViewMode = localStorage.getItem(VIEW_MODE_STORAGE_KEY) || 'full'
let collapsedDragState = null
let pendingDragPosition = null
let dragPositionRaf = 0
const strictModeState = {
    exit: false,
    screen: false,
    interaction: false,
    website: false
}
const FREE_ACCENT_COLORS = new Set(['#3b82f6', '#10b981', '#111111'])
const FREE_TEXT_COLORS = new Set(['#ffffff', '#e0f2fe', '#e5e7eb', '#111111'])
const FREE_THEMES = new Set(['glass', 'light'])
const FREE_FONTS = new Set(['Inter', 'Nunito'])
const PREMIUM_VIEW_MODE_FEATURES = {
    bar: 'windowModeBar',
    collapsed: 'windowModeCollapsed'
}
let currentLicenseState = createEmptyLicenseState()

function createEmptyLicenseState() {
    return {
        planCode: 'free',
        planName: 'Free',
        status: 'inactive',
        isPro: false,
        licenseKeyMasked: '',
        deviceFingerprint: '',
        activatedAt: null,
        features: {}
    }
}

function normalizeLicenseState(payload) {
    return {
        ...createEmptyLicenseState(),
        ...(payload || {}),
        features: {
            ...((payload && payload.features) || {})
        }
    }
}

function hasLicenseFeature(featureKey) {
    return Boolean(currentLicenseState?.isPro && currentLicenseState?.features?.[featureKey])
}

function canUseViewMode(mode) {
    const featureKey = PREMIUM_VIEW_MODE_FEATURES[mode]
    return !featureKey || hasLicenseFeature(featureKey)
}

function ensureAllowedAccentColor(color) {
    return !hasLicenseFeature('customAccentColors') && !FREE_ACCENT_COLORS.has(color) ? '#3b82f6' : color
}

function ensureAllowedTextColor(color) {
    return !hasLicenseFeature('customTextColors') && !FREE_TEXT_COLORS.has(color) ? '#ffffff' : color
}

function ensureAllowedTheme(theme) {
    return !hasLicenseFeature('customThemes') && !FREE_THEMES.has(theme) ? 'glass' : theme
}

function ensureAllowedFont(font) {
    return !hasLicenseFeature('customFonts') && !FREE_FONTS.has(font) ? 'Inter' : font
}

function ensureAllowedCustomBg(bgPath) {
    return hasLicenseFeature('customBackground') ? bgPath : ''
}

function ensureAllowedViewMode(mode) {
    return canUseViewMode(mode) ? mode : 'full'
}

function openLicenseSettings() {
    ipcRenderer.send('open-settings')
}

function ensureViewModePremiumBadge(option) {
    let badge = option.querySelector('.view-modes__badge')
    if (!badge) {
        badge = document.createElement('span')
        badge.className = 'view-modes__badge'
        option.appendChild(badge)
    }
    badge.textContent = i18n.t('premium.badge')
    return badge
}

function removeViewModePremiumBadge(option) {
    const badge = option.querySelector('.view-modes__badge')
    if (badge) {
        badge.remove()
    }
}

function syncViewModeAccess() {
    viewModeOptions.forEach(option => {
        const locked = !canUseViewMode(option.dataset.mode)

        option.classList.toggle('view-modes__option--locked', locked)
        option.setAttribute('aria-disabled', locked ? 'true' : 'false')
        option.title = locked ? i18n.t('premium.availableInPro') : ''

        if (locked) {
            ensureViewModePremiumBadge(option)
        } else {
            removeViewModePremiumBadge(option)
        }
    })
}

function sanitizeDashboardPremiumState() {
    const allowedAccent = ensureAllowedAccentColor(localStorage.getItem('accentColor') || '#3b82f6')
    const allowedText = ensureAllowedTextColor(localStorage.getItem('textColor') || '#ffffff')
    const allowedTheme = ensureAllowedTheme(localStorage.getItem('dashTheme') || 'glass')
    const allowedFont = ensureAllowedFont(localStorage.getItem('fontFamily') || 'Inter')
    const allowedViewMode = ensureAllowedViewMode(localStorage.getItem(VIEW_MODE_STORAGE_KEY) || selectedViewMode || 'full')

    localStorage.setItem('accentColor', allowedAccent)
    localStorage.setItem('textColor', allowedText)
    localStorage.setItem('dashTheme', allowedTheme)
    localStorage.setItem('fontFamily', allowedFont)
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, allowedViewMode)

    document.documentElement.style.setProperty('--accent-color', allowedAccent)
    document.documentElement.style.setProperty('--text-color', allowedText)
    document.documentElement.setAttribute('data-theme', allowedTheme)
    applyFont(allowedFont)
    renderViewModeSelection(allowedViewMode)
    applyReminderSettings()
    applyCustomBg(localStorage.getItem('customBgPath') || '')
}

async function syncLicenseState() {
    try {
        const payload = await ipcRenderer.invoke('get-license-state')
        currentLicenseState = normalizeLicenseState(payload)
    } catch (_) {
        currentLicenseState = createEmptyLicenseState()
    }

    sanitizeDashboardPremiumState()
    syncViewModeAccess()
}

function setViewModesPanelOpen(open) {
    if (!viewModesPanel) return
    const canOpen = selectedViewMode === 'full'
    const shouldOpen = open && canOpen

    viewModesPanel.classList.toggle('view-modes--hidden', !shouldOpen)
    viewModesPanel.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true')
    if (viewModesBtn) viewModesBtn.classList.toggle('dashboard__ctrl-btn--active', shouldOpen)
}

function syncViewModesButtonState() {
    if (!viewModesBtn) return

    const enabled = selectedViewMode === 'full'
    viewModesBtn.disabled = !enabled
    viewModesBtn.setAttribute('aria-disabled', enabled ? 'false' : 'true')
    viewModesBtn.classList.toggle('dashboard__ctrl-btn--disabled', !enabled)
    viewModesBtn.title = enabled ? i18n.t('btn.viewModes') : i18n.t('btn.viewModes.disabled')

    if (!enabled) {
        setViewModesPanelOpen(false)
    }
}

function renderViewModeSelection(mode = selectedViewMode) {
    const normalizedMode = VIEW_MODE_LABELS[mode] ? mode : 'full'
    selectedViewMode = ensureAllowedViewMode(normalizedMode)
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, selectedViewMode)
    document.body.dataset.viewModeDraft = selectedViewMode

    viewModeOptions.forEach(option => {
        const selected = option.dataset.mode === selectedViewMode
        option.classList.toggle('view-modes__option--selected', selected)
        option.setAttribute('aria-pressed', selected ? 'true' : 'false')
    })

    if (viewModesCurrentLabel) {
        viewModesCurrentLabel.textContent = i18n.t(VIEW_MODE_LABELS[selectedViewMode] || VIEW_MODE_LABELS.full)
    }

    if (expandViewModeBtn) {
        expandViewModeBtn.hidden = !['compact', 'mini', 'bar'].includes(selectedViewMode)
    }

    syncViewModesButtonState()
    syncViewModeAccess()
    fitBarClockTime()
    scheduleWindowWidthSync()
}

function fitBarClockTime() {
    if (!clockCard || !clockTimeWrap || !clockPeriod) return

    if (selectedViewMode !== 'bar') {
        clockTimeWrap.style.fontSize = ''
        clockTimeWrap.style.letterSpacing = ''
        clockPeriod.style.fontSize = ''
        clockPeriod.style.marginLeft = ''
        return
    }

    const availableWidth = Math.max(96, Math.floor(clockCard.clientWidth - 32))
    let fontSize = 34
    let letterSpacing = -0.4
    let periodSize = 11

    clockTimeWrap.style.fontSize = `${fontSize}px`
    clockTimeWrap.style.letterSpacing = `${letterSpacing}px`
    clockPeriod.style.fontSize = `${periodSize}px`
    clockPeriod.style.marginLeft = '2px'

    while (clockTimeWrap.scrollWidth > availableWidth && fontSize > 20) {
        fontSize -= 1
        letterSpacing = Math.max(-0.8, letterSpacing - 0.02)
        periodSize = Math.max(9, periodSize - 0.2)

        clockTimeWrap.style.fontSize = `${fontSize}px`
        clockTimeWrap.style.letterSpacing = `${letterSpacing}px`
        clockPeriod.style.fontSize = `${periodSize}px`
    }
}

function syncStrictModeButtonState() {
    if (!strictModeBtn) return
    const active = strictModeState.exit || strictModeState.screen || strictModeState.interaction || strictModeState.website
    strictModeBtn.classList.toggle('pomodoro__strict-btn--active', active)
    if (strictModeBtnLabel) {
        strictModeBtnLabel.textContent = strictModeState.interaction ? i18n.t('pomodoro.disablePro') : i18n.t('pomodoro.strictMode')
    }
}

function applyExitLockState({ exitLockEnabled } = {}) {
    const locked = Boolean(exitLockEnabled)
    strictModeState.exit = locked
    document.body.classList.toggle('strict-exit-lock', locked)
    if (minimizeBtn) {
        minimizeBtn.classList.toggle('dashboard__ctrl-btn--hidden', locked)
        minimizeBtn.setAttribute('aria-hidden', locked ? 'true' : 'false')
        minimizeBtn.tabIndex = locked ? -1 : 0
    }
    if (closeBtn) {
        closeBtn.classList.toggle('dashboard__ctrl-btn--hidden', locked)
        closeBtn.setAttribute('aria-hidden', locked ? 'true' : 'false')
        closeBtn.tabIndex = locked ? -1 : 0
    }
    syncStrictModeButtonState()
}

function applyScreenLockState({ screenLockEnabled } = {}) {
    strictModeState.screen = Boolean(screenLockEnabled)
    syncStrictModeButtonState()
}

function applyInteractionLockState({ interactionLockEnabled } = {}) {
    strictModeState.interaction = Boolean(interactionLockEnabled)
    syncStrictModeButtonState()
}

function applyWebsiteLockState({ websiteLockEnabled } = {}) {
    strictModeState.website = Boolean(websiteLockEnabled)
    syncStrictModeButtonState()
}

if(configBtn) {
    configBtn.addEventListener("click", () => ipcRenderer.send("open-settings"))
}
if(viewModesBtn) {
    viewModesBtn.addEventListener('click', () => {
        if (selectedViewMode !== 'full') return
        const shouldOpen = viewModesPanel?.classList.contains('view-modes--hidden')
        setViewModesPanelOpen(shouldOpen)
    })
}
if(viewModesCloseBtn) {
    viewModesCloseBtn.addEventListener('click', () => setViewModesPanelOpen(false))
}
viewModeOptions.forEach(option => {
    option.addEventListener('click', () => {
        if (!canUseViewMode(option.dataset.mode)) {
            openLicenseSettings()
            return
        }
        renderViewModeSelection(option.dataset.mode)
        setViewModesPanelOpen(false)
    })
})
if(expandViewModeBtn) {
    expandViewModeBtn.addEventListener('click', () => renderViewModeSelection('full'))
}
if(collapsedExpandBtn) {
    collapsedExpandBtn.addEventListener('mousedown', async event => {
        if (selectedViewMode !== 'collapsed' || event.button !== 0) return
        event.preventDefault()

        const startPosition = await ipcRenderer.invoke('get-window-position')
        collapsedDragState = {
            startMouseX: event.screenX,
            startMouseY: event.screenY,
            startWindowX: startPosition.x,
            startWindowY: startPosition.y,
            dragged: false
        }

        collapsedExpandBtn.classList.add('collapsed-view--dragging')
    })
}
if(minimizeBtn) {
    minimizeBtn.addEventListener("click", () => {
        if (strictModeState.exit) return
        Discipline.onMinimizeBtnClick()
    })
}
if(closeBtn) {
    closeBtn.addEventListener("click", () => Discipline.onCloseBtnClick())
}
if(strictModeBtn) {
    strictModeBtn.addEventListener("click", () => {
        if (strictModeState.interaction) {
            ipcRenderer.send('set-strict-interaction-lock', false)
            return
        }
        ipcRenderer.send("open-strict-mode")
    })
}

document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && viewModesPanel && !viewModesPanel.classList.contains('view-modes--hidden')) {
        setViewModesPanelOpen(false)
    }
})

document.addEventListener('click', event => {
    if (!viewModesPanel || viewModesPanel.classList.contains('view-modes--hidden')) return
    if (viewModesPanel.contains(event.target) || viewModesBtn?.contains(event.target)) return
    setViewModesPanelOpen(false)
})

document.addEventListener('mousemove', event => {
    if (!collapsedDragState || selectedViewMode !== 'collapsed') return

    const deltaX = event.screenX - collapsedDragState.startMouseX
    const deltaY = event.screenY - collapsedDragState.startMouseY

    if (!collapsedDragState.dragged && Math.hypot(deltaX, deltaY) >= 4) {
        collapsedDragState.dragged = true
    }

    if (!collapsedDragState.dragged) return

    scheduleDragPosition({
        x: collapsedDragState.startWindowX + deltaX,
        y: collapsedDragState.startWindowY + deltaY
    })
})

document.addEventListener('mouseup', () => {
    if (!collapsedDragState) return

    const dragged = collapsedDragState.dragged
    collapsedDragState = null
    collapsedExpandBtn?.classList.remove('collapsed-view--dragging')

    if (pendingDragPosition) {
        ipcRenderer.send('set-window-position', pendingDragPosition)
        pendingDragPosition = null
    }

    if (dragPositionRaf) {
        cancelAnimationFrame(dragPositionRaf)
        dragPositionRaf = 0
    }

    if (!dragged && selectedViewMode === 'collapsed') {
        renderViewModeSelection('full')
    }
})

/* colores/tema/fuente guardados */
const savedAccent = ensureAllowedAccentColor(localStorage.getItem("accentColor") || '#3b82f6')
const savedText   = ensureAllowedTextColor(localStorage.getItem("textColor") || '#ffffff')
const savedTheme  = ensureAllowedTheme(localStorage.getItem("dashTheme") || "glass")
let savedFont     = ensureAllowedFont(localStorage.getItem("fontFamily") || "Inter")
if(savedAccent) document.documentElement.style.setProperty("--accent-color", savedAccent)
if(savedText)   document.documentElement.style.setProperty("--text-color",   savedText)
document.documentElement.setAttribute("data-theme", savedTheme)

/* ---- Fondo personalizado ---- */
function applyCustomBg(bgPath) {
    const dashboard = document.querySelector('.dashboard')
    if (!dashboard) return
    const allowed = ensureAllowedCustomBg(bgPath)
    if (allowed) {
        const fileUrl = 'file:///' + allowed.replace(/\\/g, '/')
        dashboard.style.setProperty('--custom-bg-image', `url("${fileUrl}")`)
        dashboard.classList.add('dashboard--custom-bg')
    } else {
        dashboard.style.removeProperty('--custom-bg-image')
        dashboard.classList.remove('dashboard--custom-bg')
    }
}
applyCustomBg(localStorage.getItem('customBgPath') || '')

/* ---- font + window width ---- */
const FONT_WIDTHS = {
    Inter: 960,
    Outfit: 980,
    'DM Sans': 966,
    Nunito: 996,
    Sora: 1040,
    Manrope: 976,
    'Plus Jakarta Sans': 1012,
    'Space Grotesk': 1036,
    Urbanist: 992,
    'Playfair Display': 1088,
    'JetBrains Mono': 1110,
    'Bricolage Grotesque': 1024
}
const dashboardEl = document.querySelector(".dashboard")
let widthSyncRaf = 0
let widthSyncTimeout = 0
let lastSentWindowSize = null

function sendWindowSize(width, height) {
    const nextSize = {
        width: Math.round(width),
        height: Math.round(height)
    }

    if (
        lastSentWindowSize &&
        lastSentWindowSize.width === nextSize.width &&
        lastSentWindowSize.height === nextSize.height
    ) {
        return
    }

    lastSentWindowSize = nextSize
    ipcRenderer.send("set-window-size", nextSize)
}

function syncWindowWidth() {
    if (!dashboardEl) return
    const dashboardWidth = Math.max(
        dashboardEl.scrollWidth,
        Math.ceil(dashboardEl.getBoundingClientRect().width)
    )
    const bodyStyles = window.getComputedStyle(document.body)
    const bodyPaddingX =
        (parseFloat(bodyStyles.paddingLeft) || 0) +
        (parseFloat(bodyStyles.paddingRight) || 0)
    const bodyPaddingY =
        (parseFloat(bodyStyles.paddingTop) || 0) +
        (parseFloat(bodyStyles.paddingBottom) || 0)
    const baseWidth = VIEW_MODE_WIDTHS[selectedViewMode] || FONT_WIDTHS[savedFont] || 960
    const measuredWidth = Math.max(
        baseWidth,
        Math.ceil(dashboardWidth + bodyPaddingX + 6)
    )
    const widthGrowthLimit = VIEW_MODE_WIDTH_GROWTH[selectedViewMode] ?? 0
    const desiredWidth = widthGrowthLimit > 0
        ? Math.min(baseWidth + widthGrowthLimit, measuredWidth)
        : measuredWidth
    const desiredHeight = Math.max(
        VIEW_MODE_HEIGHTS[selectedViewMode] || 740,
        Math.ceil(dashboardEl.scrollHeight + bodyPaddingY + 8)
    )
    sendWindowSize(desiredWidth, desiredHeight)
}

function scheduleWindowWidthSync() {
    if (widthSyncRaf) cancelAnimationFrame(widthSyncRaf)
    widthSyncRaf = requestAnimationFrame(() => {
        widthSyncRaf = 0
        if (widthSyncTimeout) clearTimeout(widthSyncTimeout)
        widthSyncTimeout = setTimeout(() => {
            widthSyncTimeout = 0
            syncWindowWidth()
        }, 20)
    })
}

function flushPendingDragPosition() {
    dragPositionRaf = 0
    if (!pendingDragPosition) return
    ipcRenderer.send('set-window-position', pendingDragPosition)
    pendingDragPosition = null
}

function scheduleDragPosition(position) {
    pendingDragPosition = position
    if (dragPositionRaf) return
    dragPositionRaf = requestAnimationFrame(flushPendingDragPosition)
}

function applyFont(font) {
    savedFont = font
    document.documentElement.style.setProperty('--font-family', `'${font}', sans-serif`)
    fitBarClockTime()
    scheduleWindowWidthSync()
}
applyFont(savedFont)
renderViewModeSelection(selectedViewMode)
setViewModesPanelOpen(false)
syncViewModeAccess()
void syncLicenseState()

if (dashboardEl && typeof ResizeObserver !== "undefined") {
    const resizeObserver = new ResizeObserver(() => {
        fitBarClockTime()
        scheduleWindowWidthSync()
    })
    resizeObserver.observe(dashboardEl)
}

window.addEventListener("resize", () => {
    fitBarClockTime()
    scheduleWindowWidthSync()
})

if (document.fonts?.ready) {
    document.fonts.ready.then(() => {
        fitBarClockTime()
        scheduleWindowWidthSync()
    })
}

ipcRenderer.on("apply-colors", (event, payload = {}) => {
    const { accentColor, textColor, theme, font, customBgPath, focusDuration, breakDuration, language } = payload
    if(accentColor) document.documentElement.style.setProperty("--accent-color", ensureAllowedAccentColor(accentColor))
    if(textColor)   document.documentElement.style.setProperty("--text-color",   ensureAllowedTextColor(textColor))
    if(theme)       document.documentElement.setAttribute("data-theme", ensureAllowedTheme(theme))
    if(font)        applyFont(ensureAllowedFont(font))
    if (customBgPath !== undefined) applyCustomBg(customBgPath)
    if (focusDuration || breakDuration) applyPomodoroDurations(focusDuration, breakDuration)
    applyReminderSettings(payload)
    if (language) {
        i18n.setLang(language)
        applyLanguageToPage()
    }
    scheduleWindowWidthSync()
})

ipcRenderer.on('strict-exit-lock-state', (_, payload) => {
    applyExitLockState(payload)
})

ipcRenderer.on('strict-screen-lock-state', (_, payload) => {
    applyScreenLockState(payload)
})

ipcRenderer.on('strict-interaction-lock-state', (_, payload) => {
    applyInteractionLockState(payload)
})

ipcRenderer.on('strict-website-lock-state', (_, payload) => {
    applyWebsiteLockState(payload)
})

ipcRenderer.on('license-state-updated', (_, payload = {}) => {
    currentLicenseState = normalizeLicenseState(payload)
    sanitizeDashboardPremiumState()
    syncViewModeAccess()
})

ipcRenderer.on('strict-exit-lock-blocked', () => {
    if (strictModeBtn) {
        strictModeBtn.classList.add('pomodoro__strict-btn--pulse')
        setTimeout(() => strictModeBtn.classList.remove('pomodoro__strict-btn--pulse'), 520)
    }
})


