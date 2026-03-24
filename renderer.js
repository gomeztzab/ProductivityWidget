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

function syncViewModeAccess() {
    viewModeOptions.forEach(option => {
        const locked = !canUseViewMode(option.dataset.mode)
        const badge = ensureViewModePremiumBadge(option)

        option.classList.toggle('view-modes__option--locked', locked)
        option.setAttribute('aria-disabled', locked ? 'true' : 'false')
        option.title = locked ? i18n.t('premium.availableInPro') : ''
        badge.hidden = !locked
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
        ipcRenderer.send("minimize-app")
    })
}
if(closeBtn) {
    closeBtn.addEventListener("click", () => ipcRenderer.send("close-app"))
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
    const { accentColor, textColor, theme, font, focusDuration, breakDuration, language } = payload
    if(accentColor) document.documentElement.style.setProperty("--accent-color", ensureAllowedAccentColor(accentColor))
    if(textColor)   document.documentElement.style.setProperty("--text-color",   ensureAllowedTextColor(textColor))
    if(theme)       document.documentElement.setAttribute("data-theme", ensureAllowedTheme(theme))
    if(font)        applyFont(ensureAllowedFont(font))
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


/* =====================
   CLOCK
   ===================== */

function updateClock() {
    const now = new Date()
    let h = now.getHours()
    const period = h >= 12 ? "PM" : "AM"
    h = h % 12 || 12
    const m = String(now.getMinutes()).padStart(2, "0")
    const s = String(now.getSeconds()).padStart(2, "0")

    if (clockValue) clockValue.textContent = `${String(h).padStart(2,"0")}:${m}:${s}`
    if (clockPeriod) clockPeriod.textContent = period
    document.getElementById("date").textContent = now.toLocaleDateString(i18n.t('clock.locale'), {
        weekday: "long", month: "long", day: "numeric"
    })

    fitBarClockTime()
}

setInterval(updateClock, 1000)
updateClock()


/* =====================
   STATS
   Persistencia diaria + historial 30 días + 3 páginas navegables.
   Módulo IIFE — sin dependencias externas.
   ===================== */
const Stats = (() => {
    const PAGE_TITLES = ['stats.timer', 'stats.tasks', 'stats.history']

    /* ---- Estado diario (clave = fecha del día) ---- */
    function _todayKey() { return `stats_${new Date().toDateString()}` }

    const _defaults = { pomodoros: 0, focusedSecs: 0, breaks: 0 }
    let _daily = Object.assign({}, _defaults, JSON.parse(localStorage.getItem(_todayKey()) || '{}'))

    function _saveDaily() {
        localStorage.setItem(_todayKey(), JSON.stringify(_daily))
        _updateHistory()
    }

    /* ---- Historial (últimos 30 días) ---- */
    function _getHistory() {
        return JSON.parse(localStorage.getItem('stats_history') || '[]')
    }

    function _updateHistory() {
        let hist  = _getHistory()
        const key = new Date().toDateString()
        const idx = hist.findIndex(e => e.date === key)
        const entry = { date: key, pomodoros: _daily.pomodoros, focusedSecs: _daily.focusedSecs }
        if (idx >= 0) hist[idx] = entry; else hist.push(entry)
        if (hist.length > 30) hist = hist.slice(-30)
        localStorage.setItem('stats_history', JSON.stringify(hist))
    }

    /* ---- Cálculos de historial ---- */
    function _streak() {
        const todayTs = new Date().setHours(0, 0, 0, 0)
        const sorted  = _getHistory()
            .filter(e => e.pomodoros > 0)
            .map(e => new Date(e.date).setHours(0, 0, 0, 0))
            .sort((a, b) => b - a)
        if (!sorted.length) return 0
        let streak = 0, cursor = todayTs
        for (const d of sorted) {
            const diff = (cursor - d) / 86400000
            if (diff === 0 || diff === 1) { streak++; cursor = d }
            else break
        }
        return streak
    }

    function _best() {
        return Math.max(0, ..._getHistory().map(e => e.pomodoros))
    }

    function _totalHours() {
        const secs = _getHistory().reduce((s, e) => s + (e.focusedSecs || 0), 0)
        const h    = secs / 3600
        return h >= 10 ? h.toFixed(0) : h.toFixed(1)
    }

    /* ---- Navegación de páginas ---- */
    let _page     = 0
    let _pagesEls = []
    let _dotsEls  = []
    let _titleEl  = null

    function _setPage(n) {
        _page = n
        _pagesEls.forEach((el, i) => el.classList.toggle('stats__page--active', i === n))
        _dotsEls.forEach((d, i)  => d.classList.toggle('stats__dot--active',   i === n))
        if (_titleEl) _titleEl.textContent = i18n.t(PAGE_TITLES[n])
        _renderCurrent()
    }

    /* ---- Renders por página ---- */
    function _renderPage0() {
        const h = Math.floor(_daily.focusedSecs / 3600)
        const m = Math.floor((_daily.focusedSecs % 3600) / 60)
        document.getElementById('statPomodoros').textContent = _daily.pomodoros
        document.getElementById('statFocused').textContent  = h > 0 ? `${h}h ${m}m` : `${m}m`
        document.getElementById('statBreaks').textContent   = _daily.breaks
    }

    function _renderPage1() {
        const { all, done, pending, rate } = getTaskStats()
        document.getElementById('statTasksDone').textContent    = done
        document.getElementById('statTasksPending').textContent = pending
        document.getElementById('statTasksRate').textContent    = rate + '%'
    }

    function _renderPage2() {
        document.getElementById('statStreak').textContent = _streak() + 'd'
        document.getElementById('statBest').textContent   = _best()
        document.getElementById('statTotal').textContent  = _totalHours() + 'h'
    }

    function _renderCurrent() {
        if (_page === 0) _renderPage0()
        else if (_page === 1) _renderPage1()
        else _renderPage2()
    }

    /* Backup periódico cada 60s (no guardar en cada tick de foco) */
    setInterval(_saveDaily, 60000)
    window.addEventListener('beforeunload', _saveDaily)

    /* ---- API pública ---- */
    return {
        addPomodoro()     { _daily.pomodoros++;   _saveDaily(); if (_page === 0) _renderPage0() },
        addFocusedTime(s) { _daily.focusedSecs += s; if (_page === 0) _renderPage0() },
        addBreak()        { _daily.breaks++;      _saveDaily(); if (_page === 0) _renderPage0() },
        refreshTasks()    { if (_page === 1) _renderPage1() },
        getPomodoros()    { return _daily.pomodoros },
        init() {
            _titleEl  = document.querySelector('.stats__title')
            _pagesEls = Array.from(document.querySelectorAll('.stats__page'))
            _dotsEls  = Array.from(document.querySelectorAll('.stats__dot'))
            _dotsEls.forEach((d, i) => d.addEventListener('click', () => _setPage(i)))
            _setPage(0)
        }
    }
})()


/* =====================
   TODO LIST
   ===================== */

let TodoList = null

function getTaskStats() {
    if (!TodoList || typeof TodoList.getStats !== 'function') {
        return { all: 0, done: 0, pending: 0, rate: 0, activeTask: null }
    }
    return TodoList.getStats()
}

TodoList = (() => {
    const taskList = document.getElementById('taskList')
    const taskInput = document.getElementById('taskInput')
    const addTaskBtn = document.getElementById('addTaskBtn')
    const taskPrioritySelect = document.getElementById('taskPrioritySelect')
    const taskSortSelect = document.getElementById('taskSortSelect')
    const taskFilters = Array.from(document.querySelectorAll('.todo__filter'))
    const todoCard = document.querySelector('.todo')
    const todoCompactToggleBtn = document.getElementById('todoCompactToggleBtn')
    const todoCompactSummaryBtn = document.getElementById('todoCompactSummaryBtn')
    const todoSummaryText = document.getElementById('todoSummaryText')
    const todoCompactCount = document.getElementById('todoCompactCount')
    const todoCompactActive = document.getElementById('todoCompactActive')
    const todoActiveTask = document.getElementById('todoActiveTask')
    const todoEmptyState = document.getElementById('todoEmptyState')

    const TODO_STORAGE_KEY = 'todoStateV2'
    const LEGACY_TASKS_STORAGE_KEY = 'tasks'
    const CHECK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>`
    const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 }
    const PRIORITY_LABELS = { high: 'todo.priorityHigh', medium: 'todo.priorityMedium', low: 'todo.priorityLow' }
    const PRIORITY_SEQUENCE = ['high', 'medium', 'low']
    const VALID_FILTERS = new Set(['all', 'pending', 'completed'])
    const VALID_SORTS = new Set(['manual', 'priority'])

    let state = {
        ...readState(),
        compact: true
    }

    function createTaskId() {
        return `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
    }

    function readState() {
        let parsed = null
        let legacy = []

        try {
            parsed = JSON.parse(localStorage.getItem(TODO_STORAGE_KEY) || 'null')
        } catch {
            parsed = null
        }

        try {
            legacy = JSON.parse(localStorage.getItem(LEGACY_TASKS_STORAGE_KEY) || '[]')
        } catch {
            legacy = []
        }

        if (parsed && typeof parsed === 'object') {
            return normalizeState(parsed)
        }

        return normalizeState({ tasks: Array.isArray(legacy) ? legacy : [] })
    }

    function normalizeState(raw = {}) {
        const tasks = Array.isArray(raw.tasks) ? raw.tasks.map(normalizeTask).filter(Boolean) : []
        let activeAssigned = false

        const normalizedTasks = tasks.map(task => {
            const normalizedTask = { ...task }

            if (normalizedTask.done) {
                normalizedTask.active = false
                return normalizedTask
            }

            if (normalizedTask.active && !activeAssigned) {
                activeAssigned = true
                return normalizedTask
            }

            normalizedTask.active = false
            return normalizedTask
        })

        return {
            tasks: normalizedTasks,
            filter: VALID_FILTERS.has(raw.filter) ? raw.filter : 'all',
            sort: VALID_SORTS.has(raw.sort) ? raw.sort : 'manual',
            compact: Boolean(raw.compact)
        }
    }

    function normalizeTask(task) {
        if (typeof task === 'string') {
            const text = task.trim()
            return text ? { id: createTaskId(), text, done: false, priority: 'medium', active: false } : null
        }

        if (!task || typeof task !== 'object') return null

        const text = String(task.text || '').trim()
        if (!text) return null

        return {
            id: typeof task.id === 'string' && task.id ? task.id : createTaskId(),
            text,
            done: Boolean(task.done),
            priority: PRIORITY_LABELS[task.priority] ? task.priority : 'medium',
            active: !task.done && Boolean(task.active)
        }
    }

    function saveState() {
        localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(state))
    }

    function getStats() {
        const all = state.tasks.length
        const done = state.tasks.filter(task => task.done).length
        const pending = all - done
        const rate = all > 0 ? Math.round(done / all * 100) : 0
        const activeTask = state.tasks.find(task => task.active && !task.done) || null

        return { all, done, pending, rate, activeTask }
    }

    function getVisibleTasks() {
        const filteredTasks = state.tasks
            .map((task, index) => ({ task, sourceIndex: index }))
            .filter(({ task }) => {
                if (state.filter === 'pending') return !task.done
                if (state.filter === 'completed') return task.done
                return true
            })

        if (state.sort === 'priority') {
            filteredTasks.sort((left, right) => {
                if (left.task.done !== right.task.done) {
                    return Number(left.task.done) - Number(right.task.done)
                }

                const priorityDiff = PRIORITY_ORDER[left.task.priority] - PRIORITY_ORDER[right.task.priority]
                if (priorityDiff !== 0) return priorityDiff
                return left.sourceIndex - right.sourceIndex
            })
        }

        return filteredTasks
    }

    function render() {
        if (!taskList) return

        const visibleTasks = getVisibleTasks()
        const { all, pending, done, activeTask } = getStats()
        const emptyMessage = all === 0
            ? i18n.t('todo.emptyAdd')
            : i18n.t('todo.emptyFilter')

        if (todoCard) {
            todoCard.classList.toggle('todo--compact', state.compact)
        }

        if (todoCompactToggleBtn) {
            todoCompactToggleBtn.textContent = state.compact ? i18n.t('todo.expand') : i18n.t('todo.compact')
            todoCompactToggleBtn.setAttribute('aria-pressed', state.compact ? 'true' : 'false')
        }

        if (taskSortSelect) {
            taskSortSelect.value = state.sort
        }

        taskFilters.forEach(button => {
            const selected = button.dataset.filter === state.filter
            button.classList.toggle('todo__filter--active', selected)
            button.setAttribute('aria-pressed', selected ? 'true' : 'false')
        })

        if (todoSummaryText) {
            todoSummaryText.textContent = i18n.t('todo.summary', { pending, done })
        }

        if (todoCompactCount) {
            todoCompactCount.textContent = all === 0 ? i18n.t('todo.noTasks') : i18n.t('todo.pendingOf', { pending, all })
        }

        if (todoCompactActive) {
            todoCompactActive.textContent = activeTask ? i18n.t('todo.inFocus', { task: activeTask.text }) : i18n.t('todo.noFocus')
        }

        if (todoActiveTask) {
            todoActiveTask.innerHTML = activeTask
                ? `
                    <span class="todo__active-task-kicker">${i18n.t('todo.activeTask.kicker')}</span>
                    <strong class="todo__active-task-title">${escapeHtml(activeTask.text)}</strong>
                    <span class="todo__active-task-meta">${i18n.t('todo.activeTask.meta', { priority: i18n.t(PRIORITY_LABELS[activeTask.priority]).toLowerCase() })}</span>
                `
                : `
                    <span class="todo__active-task-kicker">${i18n.t('todo.activeTask.kicker')}</span>
                    <strong class="todo__active-task-title">${i18n.t('todo.activeTask.noActive')}</strong>
                    <span class="todo__active-task-meta">${i18n.t('todo.activeTask.select')}</span>
                `
            todoActiveTask.classList.toggle('todo__active-task--idle', !activeTask)
        }

        taskList.innerHTML = visibleTasks
            .map(({ task, sourceIndex }) => renderTask(task, sourceIndex))
            .join('')

        if (todoEmptyState) {
            todoEmptyState.textContent = emptyMessage
            todoEmptyState.hidden = visibleTasks.length > 0
        }

        Stats.refreshTasks()
        scheduleWindowWidthSync()
    }

    function renderTask(task, sourceIndex) {
        const isCompleted = task.done
        const isActive = task.active && !task.done
        const isManualSort = state.sort === 'manual'
        const moveUpDisabled = !isManualSort || sourceIndex === 0
        const moveDownDisabled = !isManualSort || sourceIndex === state.tasks.length - 1

        return `
            <li class="todo__item${isCompleted ? ' todo__item--completed' : ''}${isActive ? ' todo__item--active' : ''}" data-task-id="${task.id}" data-source-index="${sourceIndex}">
                <button class="todo__checkbox${isCompleted ? ' todo__checkbox--checked' : ''}" data-action="toggle" type="button" aria-label="${isCompleted ? i18n.t('todo.markPending') : i18n.t('todo.markCompleted')}">${isCompleted ? CHECK_SVG : ''}</button>
                <div class="todo__content">
                    <div class="todo__meta-row">
                        <button class="todo__priority todo__priority--${task.priority}" data-action="priority" type="button">${i18n.t(PRIORITY_LABELS[task.priority])}</button>
                        ${isActive ? `<span class="todo__focus-badge">${i18n.t('todo.focusBadge')}</span>` : ''}
                    </div>
                    <span class="todo__text">${escapeHtml(task.text)}</span>
                </div>
                <div class="todo__actions">
                    <button class="todo__action${isActive ? ' todo__action--focus-active' : ' todo__action--focus'}" data-action="focus" type="button" ${isCompleted ? 'disabled' : ''}>${isActive ? i18n.t('todo.removeFocus') : i18n.t('todo.setFocus')}</button>
                    <button class="todo__action" data-action="move-up" type="button" ${moveUpDisabled ? 'disabled' : ''}>↑</button>
                    <button class="todo__action" data-action="move-down" type="button" ${moveDownDisabled ? 'disabled' : ''}>↓</button>
                    <button class="todo__remove" data-action="remove" type="button" title="${i18n.t('todo.remove')}">&times;</button>
                </div>
            </li>
        `
    }

    function commit(nextState, options = {}) {
        state = normalizeState(nextState)
        saveState()
        render()

        if (options.focusInput && taskInput) {
            taskInput.focus()
        }
    }

    function addTask() {
        if (!taskInput) return

        const text = taskInput.value.trim()
        if (!text) return

        const hasActivePendingTask = state.tasks.some(task => task.active && !task.done)
        const nextTask = {
            id: createTaskId(),
            text,
            done: false,
            priority: PRIORITY_LABELS[taskPrioritySelect?.value] ? taskPrioritySelect.value : 'medium',
            active: !hasActivePendingTask
        }

        commit({
            ...state,
            tasks: [nextTask, ...state.tasks],
            compact: false
        }, { focusInput: true })

        taskInput.value = ''
        if (taskPrioritySelect) taskPrioritySelect.value = 'medium'
    }

    function cyclePriority(taskId) {
        commit({
            ...state,
            tasks: state.tasks.map(task => {
                if (task.id !== taskId) return task
                const currentIndex = PRIORITY_SEQUENCE.indexOf(task.priority)
                const nextPriority = PRIORITY_SEQUENCE[(currentIndex + 1) % PRIORITY_SEQUENCE.length]
                return { ...task, priority: nextPriority }
            })
        })
    }

    function toggleTask(taskId) {
        commit({
            ...state,
            tasks: state.tasks.map(task => {
                if (task.id !== taskId) return task
                const done = !task.done
                return { ...task, done, active: done ? false : task.active }
            })
        })
    }

    function toggleActiveTask(taskId) {
        commit({
            ...state,
            tasks: state.tasks.map(task => {
                if (task.done) return { ...task, active: false }
                if (task.id === taskId) return { ...task, active: !task.active }
                return { ...task, active: false }
            })
        })
    }

    function removeTask(taskId) {
        commit({
            ...state,
            tasks: state.tasks.filter(task => task.id !== taskId)
        })
    }

    function moveTask(taskId, direction, sourceIndex) {
        if (state.sort !== 'manual') return

        const currentIndex = Number.isInteger(sourceIndex)
            ? sourceIndex
            : state.tasks.findIndex(task => task.id === taskId)

        if (currentIndex === -1) return

        const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
        if (targetIndex < 0 || targetIndex >= state.tasks.length) return

        const nextTasks = [...state.tasks]
        ;[nextTasks[currentIndex], nextTasks[targetIndex]] = [nextTasks[targetIndex], nextTasks[currentIndex]]
        commit({ ...state, tasks: nextTasks })
    }

    function setFilter(filter) {
        if (!VALID_FILTERS.has(filter)) return
        commit({ ...state, filter })
    }

    function setSort(sort) {
        if (!VALID_SORTS.has(sort)) return
        commit({ ...state, sort })
    }

    function toggleCompact() {
        commit({ ...state, compact: !state.compact })
    }

    function expandFromCompact() {
        if (selectedViewMode === 'compact') {
            commit({ ...state, compact: false })
            renderViewModeSelection('full')
            requestAnimationFrame(() => taskInput?.focus())
            return
        }

        commit({ ...state, compact: false }, { focusInput: true })
    }

    if (addTaskBtn) {
        addTaskBtn.addEventListener('click', addTask)
    }

    if (taskInput) {
        taskInput.addEventListener('keydown', event => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            addTask()
        })
    }

    if (taskSortSelect) {
        taskSortSelect.addEventListener('change', event => setSort(event.target.value))
    }

    taskFilters.forEach(button => {
        button.addEventListener('click', () => setFilter(button.dataset.filter))
    })

    if (todoCompactToggleBtn) {
        todoCompactToggleBtn.addEventListener('click', toggleCompact)
    }

    if (todoCompactSummaryBtn) {
        todoCompactSummaryBtn.addEventListener('click', expandFromCompact)
    }

    if (taskList) {
        taskList.addEventListener('click', event => {
            const trigger = event.target.closest('[data-action]')
            if (!trigger) return

            const item = trigger.closest('.todo__item')
            if (!item) return

            const taskId = item.dataset.taskId
            const action = trigger.dataset.action
            const sourceIndex = Number.parseInt(item.dataset.sourceIndex || '-1', 10)

            if (action === 'toggle') toggleTask(taskId)
            else if (action === 'priority') cyclePriority(taskId)
            else if (action === 'focus') toggleActiveTask(taskId)
            else if (action === 'move-up') moveTask(taskId, 'up', sourceIndex)
            else if (action === 'move-down') moveTask(taskId, 'down', sourceIndex)
            else if (action === 'remove') removeTask(taskId)
        })
    }

    render()

    return {
        getStats,
        render
    }
})()


/* =====================
   POMODORO
   ===================== */

function parseStoredDuration(value, defaultMinutes) {
    if (typeof value === "string" && value.endsWith("s")) {
        return parseInt(value, 10) || defaultMinutes * 60
    }
    return (parseInt(value, 10) || defaultMinutes) * 60
}

function formatDurationText(seconds) {
    if (seconds < 60) return i18n.t('duration.seconds', { n: seconds })
    const minutes = Math.round(seconds / 60)
    return i18n.t('duration.min', { n: minutes })
}

function normalizeReminderFlag(value, fallback) {
    if (typeof value === "boolean") return value
    if (typeof value === "string") return value !== "false"
    return fallback
}

function readBooleanSetting(key, defaultValue = true) {
    const value = localStorage.getItem(key)
    return value == null ? defaultValue : value !== "false"
}

let reminderSoundEnabled = readBooleanSetting("reminderSoundEnabled", true)
let reminderNotificationsEnabled = readBooleanSetting("reminderNotificationsEnabled", true)
let reminderSoundLevel = localStorage.getItem("reminderSoundLevel") || "soft"

function applyReminderSettings(settings = {}) {
    reminderSoundEnabled = Object.prototype.hasOwnProperty.call(settings, "reminderSoundEnabled")
        ? normalizeReminderFlag(settings.reminderSoundEnabled, true)
        : readBooleanSetting("reminderSoundEnabled", true)

    reminderNotificationsEnabled = Object.prototype.hasOwnProperty.call(settings, "reminderNotificationsEnabled")
        ? normalizeReminderFlag(settings.reminderNotificationsEnabled, true)
        : readBooleanSetting("reminderNotificationsEnabled", true)

    if (settings.reminderSoundLevel) {
        reminderSoundLevel = settings.reminderSoundLevel
    } else {
        reminderSoundLevel = localStorage.getItem("reminderSoundLevel") || "soft"
    }

    if (!hasLicenseFeature('pomodoroSound')) {
        reminderSoundEnabled = false
    }

    if (!hasLicenseFeature('pomodoroSoundIntensity')) {
        reminderSoundLevel = 'soft'
    }
}

function refreshReminderSettingsFromStorage() {
    applyReminderSettings({
        reminderSoundEnabled: localStorage.getItem("reminderSoundEnabled"),
        reminderNotificationsEnabled: localStorage.getItem("reminderNotificationsEnabled"),
        reminderSoundLevel: localStorage.getItem("reminderSoundLevel") || reminderSoundLevel
    })
}

function applyPomodoroDurations(focusDuration, breakDuration) {
    FOCUS_TIME = parseStoredDuration(focusDuration ?? localStorage.getItem("focusDuration"), 25)
    BREAK_TIME = parseStoredDuration(breakDuration ?? localStorage.getItem("breakDuration"), 5)
    resetTimer()
}

let FOCUS_TIME = parseStoredDuration(localStorage.getItem("focusDuration"), 25)
let BREAK_TIME = parseStoredDuration(localStorage.getItem("breakDuration"), 5)
const CIRCUMFERENCE = 502   /* 2 * Math.PI * 80 */

let time      = FOCUS_TIME
let totalTime = FOCUS_TIME
let interval  = null
let isBreak   = false

/* stats eliminadas — gestionadas por módulo Stats */

const progressCircle = document.querySelector(".pomodoro__circle-progress")
const pomodoroLabel  = document.querySelector(".pomodoro__label")
const startBtn       = document.getElementById("startTimerBtn")
const resetBtn       = document.getElementById("resetTimerBtn")
const breakBtn       = document.getElementById("breakBtn")
const pomodoroNotice = document.getElementById("pomodoroNotice")
const pomodoroNoticeKicker = document.getElementById("pomodoroNoticeKicker")
const pomodoroNoticeTitle = document.getElementById("pomodoroNoticeTitle")
const pomodoroNoticeBody = document.getElementById("pomodoroNoticeBody")
const pomodoroNoticeActionBtn = document.getElementById("pomodoroNoticeAction")
const pomodoroNoticeDismissBtn = document.getElementById("pomodoroNoticeDismiss")
let reminderAudioCtx = null
let pomodoroNoticeAction = null

applyReminderSettings()

function showPomodoroNotice({ kicker, title, body, actionLabel, action }) {
    if (!pomodoroNotice) return
    pomodoroNoticeAction = typeof action === "function" ? action : null
    if (pomodoroNoticeKicker) pomodoroNoticeKicker.textContent = kicker
    if (pomodoroNoticeTitle) pomodoroNoticeTitle.textContent = title
    if (pomodoroNoticeBody) pomodoroNoticeBody.textContent = body
    if (pomodoroNoticeActionBtn) pomodoroNoticeActionBtn.textContent = actionLabel || "Continuar"
    pomodoroNotice.classList.remove("pomodoro__notice--hidden")
}

function hidePomodoroNotice() {
    pomodoroNoticeAction = null
    if (pomodoroNotice) pomodoroNotice.classList.add("pomodoro__notice--hidden")
}

function getReminderAudioCtx() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return null
    if (!reminderAudioCtx) reminderAudioCtx = new AudioCtx()
    if (reminderAudioCtx.state === "suspended") reminderAudioCtx.resume().catch(() => {})
    return reminderAudioCtx
}

function playReminderSound(kind) {
    if (!reminderSoundEnabled) return

    const ctx = getReminderAudioCtx()
    if (!ctx) return

    const soundPalettes = {
        soft: {
            focus: { notes: [659, 880], gain: 0.12, type: "sine", length: 0.2, spacing: 0.18 },
            break: { notes: [523, 659, 784], gain: 0.14, type: "triangle", length: 0.2, spacing: 0.18 }
        },
        medium: {
            focus: { notes: [784, 988, 1174], gain: 0.26, type: "triangle", length: 0.24, spacing: 0.16 },
            break: { notes: [659, 784, 988], gain: 0.28, type: "triangle", length: 0.24, spacing: 0.16 }
        },
        strong: {
            focus: { notes: [988, 1318, 1568, 1760], gain: 0.52, type: "square", length: 0.3, spacing: 0.14 },
            break: { notes: [880, 1174, 1568, 1976], gain: 0.56, type: "square", length: 0.32, spacing: 0.14 }
        }
    }
    const level = soundPalettes[reminderSoundLevel] ? reminderSoundLevel : "soft"
    const soundPalette = soundPalettes[level]
    const preset = kind === "focus" ? soundPalette.focus : soundPalette.break
    const notes = preset.notes
    const now = ctx.currentTime + 0.02

    const master = ctx.createGain()
    master.gain.setValueAtTime(level === "strong" ? 1 : 0.92, now)
    master.connect(ctx.destination)

    notes.forEach((frequency, index) => {
        const start = now + index * preset.spacing
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()

        osc.type = preset.type
        osc.frequency.setValueAtTime(frequency, start)
        gain.gain.setValueAtTime(0.0001, start)
        gain.gain.exponentialRampToValueAtTime(preset.gain, start + 0.015)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + preset.length)

        osc.connect(gain)
        gain.connect(master)
        osc.start(start)
        osc.stop(start + preset.length + 0.02)
    })
}

function sendPomodoroReminder(kind, title, body, noticeConfig) {
    refreshReminderSettingsFromStorage()
    playReminderSound(kind)
    if (reminderNotificationsEnabled) {
        ipcRenderer.send("pomodoro-alert", { title, body })
    }
    showPomodoroNotice(noticeConfig)
}

function updateTimerDisplay() {
    const m = Math.floor(time / 60)
    const s = time % 60
    document.getElementById("timer").textContent =
        `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`

    /* animar c�rculo SVG */
    const offset = CIRCUMFERENCE * (1 - time / totalTime)
    progressCircle.style.strokeDashoffset = offset
}

function ensurePomodoroRunning(trigger = "manual") {
    if (interval) return false
    hidePomodoroNotice()
    startTimer()
    return true
}

function startTimer() {
    if(interval) {
        /* PAUSAR */
        clearInterval(interval)
        interval = null
        startBtn.textContent = i18n.t('pomodoro.resume')
        return
    }

    hidePomodoroNotice()
    startBtn.textContent = i18n.t('pomodoro.pause')

    interval = setInterval(() => {
        time--
        if (!isBreak) Stats.addFocusedTime(1)
        updateTimerDisplay()

        if(time <= 0) {
            clearInterval(interval)
            interval = null

            if(!isBreak) {
                Stats.addPomodoro()
                Stats.addBreak()
                isBreak   = true
                time      = BREAK_TIME
                totalTime = BREAK_TIME
                pomodoroLabel.textContent = i18n.t('pomodoro.breakTime')
                startBtn.textContent      = i18n.t('pomodoro.startBreak')
                sendPomodoroReminder(
                    "focus",
                    i18n.t('pomodoro.alert.focusDone'),
                    i18n.t('pomodoro.alert.focusBody', { n: Stats.getPomodoros(), duration: formatDurationText(BREAK_TIME) }),
                    {
                        kicker: i18n.t('pomodoro.notice.focusDone'),
                        title: i18n.t('pomodoro.notice.breakReady'),
                        body: i18n.t('pomodoro.notice.pomodoroReady', { n: Stats.getPomodoros(), duration: formatDurationText(BREAK_TIME) }),
                        actionLabel: i18n.t('pomodoro.notice.startBreak'),
                        action: () => startTimer()
                    }
                )
            } else {
                isBreak   = false
                time      = FOCUS_TIME
                totalTime = FOCUS_TIME
                pomodoroLabel.textContent = i18n.t('pomodoro.focusTime')
                startBtn.textContent      = i18n.t('pomodoro.start')
                sendPomodoroReminder(
                    "break",
                    i18n.t('pomodoro.alert.breakDone'),
                    i18n.t('pomodoro.alert.breakBody', { duration: formatDurationText(FOCUS_TIME) }),
                    {
                        kicker: i18n.t('pomodoro.notice.breakDone'),
                        title: i18n.t('pomodoro.notice.readyFocus'),
                        body: i18n.t('pomodoro.notice.nextBlock', { duration: formatDurationText(FOCUS_TIME) }),
                        actionLabel: i18n.t('pomodoro.notice.startFocus'),
                        action: () => startTimer()
                    }
                )
            }
            updateTimerDisplay()
        }
    }, 1000)
}

function resetTimer() {
    hidePomodoroNotice()
    clearInterval(interval)
    interval  = null
    isBreak   = false
    time      = FOCUS_TIME
    totalTime = FOCUS_TIME
    pomodoroLabel.textContent = i18n.t('pomodoro.focusTime')
    startBtn.textContent      = i18n.t('pomodoro.start')
    updateTimerDisplay()
}

function startBreak() {
    hidePomodoroNotice()
    clearInterval(interval)
    interval  = null
    isBreak   = true
    Stats.addBreak()
    time      = BREAK_TIME
    totalTime = BREAK_TIME
    pomodoroLabel.textContent = i18n.t('pomodoro.breakTime')
    startBtn.textContent      = i18n.t('pomodoro.start')
    updateTimerDisplay()
}

ipcRenderer.on('strict-screen-lock-activated', () => {
    ensurePomodoroRunning('screen-lock')
})

ipcRenderer.on('strict-interaction-lock-activated', () => {
    ensurePomodoroRunning('interaction-lock')
})

startBtn.addEventListener("click", startTimer)
resetBtn.addEventListener("click", resetTimer)
breakBtn.addEventListener("click", startBreak)
if (pomodoroNoticeActionBtn) {
    pomodoroNoticeActionBtn.addEventListener("click", () => {
        const action = pomodoroNoticeAction
        hidePomodoroNotice()
        if (action) action()
    })
}
if (pomodoroNoticeDismissBtn) {
    pomodoroNoticeDismissBtn.addEventListener("click", hidePomodoroNotice)
}

updateTimerDisplay()

/* =====================
   MUSIC PLAYER
   Módulo encapsulado — requestAnimationFrame, sin setInterval.
   Una sola responsabilidad por función. BEM en clases.
   ===================== */
const MusicPlayer = (() => {
    /* Referencias al DOM */
    const els = {
        trackName : document.getElementById("musicTrackName"),
        progress  : document.getElementById("musicProgress"),
        dot       : document.getElementById("musicProgressDot"),
        time      : document.getElementById("musicTime"),
        prevBtn   : document.getElementById("musicPrevBtn"),
        nextBtn   : document.getElementById("musicNextBtn"),
        playBtn   : document.getElementById("musicPlayBtn"),
        icon      : document.querySelector(".music__icon")
    }

    /* Estado interno */
    const state = {
        position    : 0,
        duration    : 0,
        playing     : false,
        rafId       : null,
        lastTick    : 0,
        renderedPct : -1,
        renderedSec : -1
    }

    /* ---- Utilidades ---- */
    function fmt(sec) {
        if (!sec || sec < 0) return "0:00"
        return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`
    }

    /* ---- Render: solo actualiza DOM cuando el valor cambia ---- */
    function render() {
        const pct  = state.duration > 0 ? Math.min(state.position / state.duration * 100, 100) : 0
        const pctR = Math.round(pct * 10) / 10
        const secR = Math.floor(state.position)

        if (pctR !== state.renderedPct) {
            state.renderedPct = pctR
            if (els.progress) els.progress.style.setProperty("--progress", pctR + "%")
            if (els.dot)      els.dot.style.left = pctR + "%"
        }
        if (secR !== state.renderedSec) {
            state.renderedSec = secR
            if (els.time) els.time.textContent = `${fmt(state.position)} / ${fmt(state.duration)}`
        }
    }

    /* ---- Tick via requestAnimationFrame (sin drift, pausa con ventana) ---- */
    function tick(ts) {
        if (!state.playing) return
        if (state.lastTick) {
            state.position = Math.min(state.position + (ts - state.lastTick) / 1000, state.duration)
        }
        state.lastTick = ts
        render()
        state.rafId = requestAnimationFrame(tick)
    }

    function startTick() {
        stopTick()
        if (!state.playing) return
        state.lastTick = 0
        state.rafId = requestAnimationFrame(tick)
    }

    function stopTick() {
        if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = null }
        state.lastTick = 0
    }

    /* ---- Icono play/pause ---- */
    function setPlayIcon(playing) {
        if (!els.playBtn) return
        els.playBtn.setAttribute("aria-label", playing ? i18n.t('music.pause') : i18n.t('music.play'))
        els.playBtn.innerHTML = playing
            ? `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`
            : `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg>`
        if (els.icon) els.icon.classList.toggle("music__icon--playing", playing)
    }

    /* ---- Nombre de pista con detección de overflow para marquee ---- */
    function setTrack(title) {
        if (!els.trackName || els.trackName.textContent === title) return
        els.trackName.textContent = title
        els.trackName.classList.remove("music__track-name--scroll")
        els.trackName.style.removeProperty("--overflow-px")
        requestAnimationFrame(() => {
            if (!els.trackName.parentElement) return
            const container = els.trackName.parentElement
            const overflow  = container.scrollWidth - container.clientWidth
            if (overflow > 4) {
                els.trackName.style.setProperty("--overflow-px", `${-(overflow + 16)}px`)
                els.trackName.classList.add("music__track-name--scroll")
            }
        })
    }

    /* ---- Actualización desde IPC ---- */
    function onInfo(data) {
        const newPos    = data.position || 0
        const newDur    = data.duration || 0
        const newPlay   = data.status === "Playing"
        const curTitle  = els.trackName ? els.trackName.textContent : ""
        const newTitle  = data.title || i18n.t('music.nothingPlaying')
        const trackChanged = newTitle !== curTitle
        const drift     = newPos - state.position   /* +server adelante, -server atrás */

        state.duration = newDur

        /* Pista nueva, seek grande o sin duración → posición exacta */
        if (trackChanged || Math.abs(drift) > 3 || !state.duration) {
            state.position    = newPos
            state.renderedPct = -1
            state.renderedSec = -1
        } else if (drift > 0.5) {
            /* Servidor adelante → mezcla suave solo hacia adelante */
            state.position = state.position + drift * 0.5
        }
        /* Si servidor atrás (drift ≤ 0): ignorar, la interpolación rAF
           es más precisa en tiempo real que el poll con latencia de PS */

        setTrack(newTitle)
        setPlayIcon(newPlay)

        /* Solo iniciar/detener tick cuando cambia el estado de play */
        const wasPlaying = state.playing
        state.playing    = newPlay

        if (newPlay && !wasPlaying) {
            startTick()
        } else if (!newPlay && wasPlaying) {
            stopTick()
            /* Al pausar → posición exacta del servidor */
            state.position    = newPos
            state.renderedPct = -1
            state.renderedSec = -1
        }

        render()
    }

    /* ---- Inicialización ---- */
    function init() {
        if (els.prevBtn) els.prevBtn.addEventListener("click", () => ipcRenderer.send("media-control", "prev"))
        if (els.nextBtn) els.nextBtn.addEventListener("click", () => ipcRenderer.send("media-control", "next"))
        if (els.playBtn) els.playBtn.addEventListener("click", () => {
            state.playing = !state.playing
            setPlayIcon(state.playing)
            ipcRenderer.send("media-control", "toggle")
            if (state.playing) startTick(); else stopTick()
        })
        ipcRenderer.on("media-info", (_, data) => onInfo(data))
    }

    return { init }
})()

MusicPlayer.init()
Stats.init()

/* =====================
   i18n — aplicar traducciones al DOM
   ===================== */
function applyLanguageToPage() {
    i18n.applyPage()
    if (TodoList && typeof TodoList.render === 'function') {
        TodoList.render()
    }
    syncViewModesButtonState()
    syncStrictModeButtonState()
    if (viewModesCurrentLabel) {
        viewModesCurrentLabel.textContent = i18n.t(VIEW_MODE_LABELS[selectedViewMode] || VIEW_MODE_LABELS.full)
    }
    if (Weather && typeof Weather.refresh === 'function') {
        Weather.refresh()
    }
}

/* =====================
   WEATHER
   Geolocalización IP (ip-api.com, gratis, sin key) +
   clima (open-meteo.com, gratis, sin key).
   Node https para evitar CORS. Cache en localStorage.
   ===================== */
const Weather = (() => {
    const https = require('https')
    const http  = require('http')
    let latestData = null

    /* WMO Weather Interpretation Codes */
    const ICONS = {
        0: '\u2600\uFE0F',   /* ☀️ Clear            */
        1: '\uD83C\uDF24\uFE0F',   /* 🌤️ Mostly Clear    */
        2: '\u26C5',         /* ⛅ Partly Cloudy    */
        3: '\u2601\uFE0F',   /* ☁️ Overcast         */
        45: '\uD83C\uDF2B\uFE0F',  /* 🌫️ Fog             */
        48: '\uD83C\uDF2B\uFE0F',
        51: '\uD83C\uDF26\uFE0F',  /* 🌦️ Light Drizzle   */
        53: '\uD83C\uDF26\uFE0F',
        55: '\uD83C\uDF27\uFE0F',  /* 🌧️ Drizzle         */
        56: '\uD83C\uDF28\uFE0F',  /* 🌨️ Freeze Drizzle  */
        57: '\uD83C\uDF28\uFE0F',
        61: '\uD83C\uDF26\uFE0F',  /* 🌦️ Light Rain      */
        63: '\uD83C\uDF27\uFE0F',  /* 🌧️ Rain            */
        65: '\uD83C\uDF27\uFE0F',
        66: '\uD83C\uDF28\uFE0F',  /* 🌨️ Freezing Rain   */
        67: '\uD83C\uDF28\uFE0F',
        71: '\u2744\uFE0F',  /* ❄️ Light Snow      */
        73: '\u2744\uFE0F',
        75: '\u2744\uFE0F',
        77: '\uD83C\uDF28\uFE0F',
        80: '\uD83C\uDF26\uFE0F',  /* 🌦️ Showers         */
        81: '\uD83C\uDF27\uFE0F',
        82: '\u26C8\uFE0F',  /* ⛈️ Heavy Showers   */
        85: '\u2744\uFE0F',
        86: '\u2744\uFE0F',
        95: '\u26C8\uFE0F',  /* ⛈️ Thunderstorm    */
        96: '\u26C8\uFE0F',
        99: '\u26C8\uFE0F'
    }
    const DESCS = {
        0: 'weather.clear', 1: 'weather.mostlyClear', 2: 'weather.partlyCloudy', 3: 'weather.overcast',
        45: 'weather.fog', 48: 'weather.icyFog',
        51: 'weather.lightDrizzle', 53: 'weather.drizzle', 55: 'weather.heavyDrizzle',
        56: 'weather.freezingDrizzle', 57: 'weather.freezingDrizzle',
        61: 'weather.lightRain', 63: 'weather.rain', 65: 'weather.heavyRain',
        66: 'weather.freezingRain', 67: 'weather.freezingRain',
        71: 'weather.lightSnow', 73: 'weather.snow', 75: 'weather.heavySnow', 77: 'weather.snowGrains',
        80: 'weather.showers', 81: 'weather.showers', 82: 'weather.heavyShowers',
        85: 'weather.snowShowers', 86: 'weather.heavySnowShowers',
        95: 'weather.thunderstorm', 96: 'weather.thunderstorm', 99: 'weather.thunderstorm'
    }

    const els = {
        icon:     document.getElementById('weatherIcon'),
        temp:     document.getElementById('weatherTemp'),
        cond:     document.getElementById('weatherCondition'),
        location: document.getElementById('weatherLocation')
    }

    function _get(url) {
        const mod = url.startsWith('https') ? https : http
        return new Promise((resolve, reject) => {
            let data = ''
            mod.get(url, res => {
                res.on('data', c => { data += c })
                res.on('end', () => {
                    try { resolve(JSON.parse(data)) } catch(e) { reject(e) }
                })
            }).on('error', reject)
        })
    }

    function _render(d) {
        if (!d || d.temp === undefined) return
        latestData = d
        if (els.icon)     els.icon.textContent     = ICONS[d.code]  ?? '\uD83C\uDF21\uFE0F'
        if (els.temp)     els.temp.textContent     = `${d.temp}\xB0`
        if (els.cond)     els.cond.textContent     = DESCS[d.code] ? i18n.t(DESCS[d.code]) : '\u2014'
        if (els.location) els.location.textContent = d.city
    }

    async function _fetch() {
        const geo = await _get('http://ip-api.com/json?fields=city,country,lat,lon,status')
        if (geo.status !== 'success') return
        const w = await _get(
            `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}` +
            `&current=temperature_2m,weather_code&temperature_unit=celsius&timezone=auto`
        )
        const curr = w.current
        const data = {
            code : curr.weather_code,
            temp : Math.round(curr.temperature_2m),
            city : `${geo.city}, ${geo.country}`
        }
        localStorage.setItem('weather_cache', JSON.stringify(data))
        _render(data)
    }

    return {
        init() {
            const cached = JSON.parse(localStorage.getItem('weather_cache') || 'null')
            if (cached) _render(cached)
            _fetch().catch(() => {})
            setInterval(() => _fetch().catch(() => {}), 30 * 60 * 1000)
        },
        refresh() {
            if (latestData) {
                _render(latestData)
                return
            }

            const cached = JSON.parse(localStorage.getItem('weather_cache') || 'null')
            if (cached) _render(cached)
        }
    }
})()

Weather.init()
applyLanguageToPage()
