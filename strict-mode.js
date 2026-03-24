const { ipcRenderer } = require('electron')

const closeBtn = document.getElementById('strictModeCloseBtn')
const exitLockCard = document.querySelector('.strict-mode__card--primary')
const exitLockStatus = document.getElementById('exitLockStatus')
const exitLockToggleBtn = document.getElementById('exitLockToggleBtn')
const screenLockCard = document.getElementById('screenLockCard')
const screenLockStatus = document.getElementById('screenLockStatus')
const screenLockToggleBtn = document.getElementById('screenLockToggleBtn')
const interactionLockCard = document.getElementById('interactionLockCard')
const interactionLockStatus = document.getElementById('interactionLockStatus')
const interactionLockToggleBtn = document.getElementById('interactionLockToggleBtn')
const websiteLockCard = document.getElementById('websiteLockCard')
const websiteLockStatus = document.getElementById('websiteLockStatus')
const websiteLockToggleBtn = document.getElementById('websiteLockToggleBtn')
const websiteLockDomainsInput = document.getElementById('websiteLockDomainsInput')
const websiteLockHint = document.getElementById('websiteLockHint')
const heroBadge = document.getElementById('strictModeHeroBadge')
const heroTitle = document.getElementById('strictModeHeroTitle')
const heroText = document.getElementById('strictModeHeroText')
const heroScope = document.getElementById('strictModeHeroScope')
const heroDomains = document.getElementById('strictModeHeroDomains')
const heroTags = document.getElementById('strictModeHeroTags')
const FREE_ACCENT_COLORS = new Set(['#3b82f6', '#10b981', '#111111'])
const FREE_TEXT_COLORS = new Set(['#ffffff', '#e0f2fe', '#e5e7eb', '#111111'])
const FREE_THEMES = new Set(['glass', 'light'])
const FREE_FONTS = new Set(['Inter', 'Nunito'])
let exitLockEnabled = false
let screenLockEnabled = false
let interactionLockEnabled = false
let websiteLockEnabled = false
let websiteLockBusy = false
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

function openLicenseSettings() {
    ipcRenderer.send('open-settings')
}

function canToggleScreenLock() {
    return screenLockEnabled || hasLicenseFeature('strictScreenLock')
}

function canToggleInteractionLock() {
    return interactionLockEnabled || hasLicenseFeature('strictInteractionLock')
}

function canToggleWebsiteLock() {
    return websiteLockEnabled || hasLicenseFeature('strictWebsiteBlock')
}

function applyPremiumCardState(card, button, locked) {
    if (card) {
        card.classList.toggle('strict-mode__card--premium-locked', locked)
        card.setAttribute('aria-disabled', locked ? 'true' : 'false')
        card.title = locked ? i18n.t('premium.availableInPro') : ''
    }

    if (button) {
        button.classList.toggle('strict-mode__action--locked', locked)
        button.title = locked ? i18n.t('premium.availableInPro') : ''
    }
}

function applyLicenseGating() {
    const screenLocked = !canToggleScreenLock()
    const interactionLocked = !canToggleInteractionLock()
    const websiteLocked = !canToggleWebsiteLock()

    applyPremiumCardState(screenLockCard, screenLockToggleBtn, screenLocked)
    applyPremiumCardState(interactionLockCard, interactionLockToggleBtn, interactionLocked)
    applyPremiumCardState(websiteLockCard, websiteLockToggleBtn, websiteLocked)

    if (screenLockStatus && screenLocked && !screenLockEnabled) {
        screenLockStatus.textContent = i18n.t('premium.availableInPro')
    }

    if (interactionLockStatus && interactionLocked && !interactionLockEnabled) {
        interactionLockStatus.textContent = i18n.t('premium.availableInPro')
    }

    if (websiteLockStatus && websiteLocked && !websiteLockEnabled) {
        websiteLockStatus.textContent = i18n.t('premium.availableInPro')
    }

    if (screenLockToggleBtn && screenLocked && !screenLockEnabled) {
        screenLockToggleBtn.textContent = i18n.t('premium.ctaButton')
    }

    if (interactionLockToggleBtn && interactionLocked && !interactionLockEnabled) {
        interactionLockToggleBtn.textContent = i18n.t('premium.ctaButton')
    }

    if (websiteLockToggleBtn && websiteLocked && !websiteLockEnabled && !websiteLockBusy) {
        websiteLockToggleBtn.textContent = i18n.t('premium.ctaButton')
    }

    if (websiteLockDomainsInput) {
        websiteLockDomainsInput.disabled = websiteLocked && !websiteLockEnabled
    }
}

async function syncLicenseState() {
    try {
        const payload = await ipcRenderer.invoke('get-license-state')
        currentLicenseState = normalizeLicenseState(payload)
    } catch (_) {
        currentLicenseState = createEmptyLicenseState()
    }

    applyStrictModeTheme()
    applyLicenseGating()
}

function parseWebsiteDomains() {
    if (!websiteLockDomainsInput) return []
    return websiteLockDomainsInput.value
        .split(/[\n,;]/)
        .map(value => value.trim())
        .filter(Boolean)
}

function applyStrictModeTheme(payload = {}) {
    const accentColor = ensureAllowedAccentColor(payload.accentColor || localStorage.getItem('accentColor') || '#3b82f6')
    const textColor = ensureAllowedTextColor(payload.textColor || localStorage.getItem('textColor') || '#ffffff')
    const theme = ensureAllowedTheme(payload.theme || localStorage.getItem('dashTheme') || 'glass')
    const font = ensureAllowedFont(payload.font || localStorage.getItem('fontFamily') || 'Inter')

    document.documentElement.style.setProperty('--accent-color', accentColor)
    document.documentElement.style.setProperty('--text-color', textColor)
    document.documentElement.style.setProperty('--font-family', `'${font}', sans-serif`)
    document.documentElement.setAttribute('data-theme', theme)
}

function getHeroModeConfig() {
    if (websiteLockEnabled) {
        return {
            badge: websiteLockBusy ? i18n.t('strict.hero.website.badgeBusy') : i18n.t('strict.hero.website.badge'),
            title: i18n.t('strict.hero.website.title'),
            text: i18n.t('strict.hero.website.text'),
            scope: i18n.t('strict.hero.website.scope'),
            tone: 'website'
        }
    }

    if (interactionLockEnabled) {
        return {
            badge: i18n.t('strict.hero.interaction.badge'),
            title: i18n.t('strict.hero.interaction.title'),
            text: i18n.t('strict.hero.interaction.text'),
            scope: i18n.t('strict.hero.interaction.scope'),
            tone: 'interaction'
        }
    }

    if (screenLockEnabled) {
        return {
            badge: i18n.t('strict.hero.screen.badge'),
            title: i18n.t('strict.hero.screen.title'),
            text: i18n.t('strict.hero.screen.text'),
            scope: i18n.t('strict.hero.screen.scope'),
            tone: 'screen'
        }
    }

    if (exitLockEnabled) {
        return {
            badge: i18n.t('strict.hero.exit.badge'),
            title: i18n.t('strict.hero.exit.title'),
            text: i18n.t('strict.hero.exit.text'),
            scope: i18n.t('strict.hero.exit.scope'),
            tone: 'exit'
        }
    }

    return {
        badge: i18n.t('strict.heroBadge.idle'),
        title: i18n.t('strict.heroTitle.idle'),
        text: i18n.t('strict.heroText.idle'),
        scope: i18n.t('strict.heroScope.idle'),
        tone: 'idle'
    }
}

function renderHeroPreview() {
    const draftDomains = parseWebsiteDomains()
    const displayedDomains = websiteLockEnabled && websiteLockDomainsInput
        ? websiteLockDomainsInput.value.split(/[\n,;]/).map(value => value.trim()).filter(Boolean)
        : draftDomains
    const mode = getHeroModeConfig()

    if (heroBadge) {
        heroBadge.textContent = mode.badge
        heroBadge.dataset.tone = mode.tone
    }
    if (heroTitle) heroTitle.textContent = mode.title
    if (heroText) heroText.textContent = mode.text
    if (heroScope) heroScope.textContent = mode.scope
    if (heroDomains) {
        const key = displayedDomains.length === 1 ? 'strict.heroDomains.readyOne' : 'strict.heroDomains.ready'
        heroDomains.textContent = i18n.t(key, { n: displayedDomains.length })
    }

    if (!heroTags) return

    const tags = []

    if (websiteLockEnabled) tags.push(i18n.t('strict.hero.tags.hosts'))
    if (screenLockEnabled) tags.push(i18n.t('strict.hero.tags.fullscreen'))
    if (interactionLockEnabled) tags.push(i18n.t('strict.hero.tags.widgetOnly'))
    if (exitLockEnabled) tags.push(i18n.t('strict.hero.tags.noExit'))

    displayedDomains.slice(0, 4).forEach(domain => tags.push(domain))

    if (!tags.length) {
        heroTags.innerHTML = `<span class="strict-mode__hero-tag strict-mode__hero-tag--muted">${i18n.t('strict.heroTags.none')}</span>`
        return
    }

    const hiddenCount = displayedDomains.length - Math.min(displayedDomains.length, 4)
    if (hiddenCount > 0) tags.push(i18n.t('strict.hero.tags.more', { n: hiddenCount }))

    heroTags.innerHTML = tags
        .map(tag => `<span class="strict-mode__hero-tag">${tag}</span>`)
        .join('')
}

applyStrictModeTheme()
i18n.applyPage()
renderHeroPreview()
void syncLicenseState()

ipcRenderer.on('apply-colors', (_, payload) => {
    applyStrictModeTheme(payload)
    if (payload.language) {
        i18n.setLang(payload.language)
        i18n.applyPage()
        renderHeroPreview()
    }
    applyLicenseGating()
})

ipcRenderer.on('license-state-updated', (_, payload = {}) => {
    currentLicenseState = normalizeLicenseState(payload)
    applyStrictModeTheme()
    applyLicenseGating()
    renderHeroPreview()
})

function renderExitLockState(enabled) {
    exitLockEnabled = Boolean(enabled)
    if (exitLockCard) exitLockCard.classList.toggle('strict-mode__card--locked', exitLockEnabled)
    if (exitLockStatus) exitLockStatus.textContent = i18n.t(exitLockEnabled ? 'strict.status.active' : 'strict.status.inactive')
    if (exitLockToggleBtn) exitLockToggleBtn.textContent = i18n.t(exitLockEnabled ? 'strict.exit.deactivate' : 'strict.exit.activate')
    renderHeroPreview()
}

function renderScreenLockState(enabled) {
    screenLockEnabled = Boolean(enabled)
    if (screenLockCard) screenLockCard.classList.toggle('strict-mode__card--locked', screenLockEnabled)
    if (screenLockStatus) screenLockStatus.textContent = i18n.t(screenLockEnabled ? 'strict.status.active' : 'strict.status.inactive')
    if (screenLockToggleBtn) screenLockToggleBtn.textContent = i18n.t(screenLockEnabled ? 'strict.screen.deactivate' : 'strict.screen.activate')
    applyLicenseGating()
    renderHeroPreview()
}

function renderInteractionLockState(enabled) {
    interactionLockEnabled = Boolean(enabled)
    if (interactionLockCard) interactionLockCard.classList.toggle('strict-mode__card--locked', interactionLockEnabled)
    if (interactionLockStatus) interactionLockStatus.textContent = i18n.t(interactionLockEnabled ? 'strict.status.active' : 'strict.status.inactive')
    if (interactionLockToggleBtn) interactionLockToggleBtn.textContent = i18n.t(interactionLockEnabled ? 'strict.interaction.deactivate' : 'strict.interaction.activate')
    applyLicenseGating()
    renderHeroPreview()
}

function renderWebsiteLockState(payload = {}) {
    websiteLockEnabled = Boolean(payload.websiteLockEnabled)

    if (websiteLockCard) websiteLockCard.classList.toggle('strict-mode__card--locked', websiteLockEnabled)
    if (websiteLockStatus) {
        const count = Array.isArray(payload.domains) ? payload.domains.length : 0
        websiteLockStatus.textContent = websiteLockEnabled
            ? i18n.t('strict.website.statusDomains', { n: count, s: count === 1 ? '' : 's' })
            : i18n.t('strict.status.inactive')
    }
    if (websiteLockToggleBtn) {
        websiteLockToggleBtn.textContent = websiteLockBusy
            ? i18n.t('strict.website.applying')
            : i18n.t(websiteLockEnabled ? 'strict.website.deactivate' : 'strict.website.activate')
        websiteLockToggleBtn.disabled = websiteLockBusy
    }
    if (websiteLockDomainsInput && Array.isArray(payload.domains) && document.activeElement !== websiteLockDomainsInput) {
        websiteLockDomainsInput.value = payload.domains.join('\n')
    }
    if (websiteLockHint) {
        websiteLockHint.textContent = payload.error || i18n.t('strict.website.hint', { path: payload.hostsPath || 'hosts' })
    }
    applyLicenseGating()
    renderHeroPreview()
}

ipcRenderer.on('strict-exit-lock-state', (_, payload = {}) => {
    renderExitLockState(payload.exitLockEnabled)
})

ipcRenderer.on('strict-screen-lock-state', (_, payload = {}) => {
    renderScreenLockState(payload.screenLockEnabled)
})

ipcRenderer.on('strict-interaction-lock-state', (_, payload = {}) => {
    renderInteractionLockState(payload.interactionLockEnabled)
})

ipcRenderer.on('strict-website-lock-state', (_, payload = {}) => {
    renderWebsiteLockState(payload)
})

if (closeBtn) {
    closeBtn.addEventListener('click', () => ipcRenderer.send('close-strict-mode'))
}

if (exitLockToggleBtn) {
    exitLockToggleBtn.addEventListener('click', () => {
        ipcRenderer.send('set-strict-exit-lock', !exitLockEnabled)
    })
}

if (screenLockToggleBtn) {
    screenLockToggleBtn.addEventListener('click', () => {
        if (!canToggleScreenLock()) {
            openLicenseSettings()
            return
        }
        ipcRenderer.send('set-strict-screen-lock', !screenLockEnabled)
    })
}

if (interactionLockToggleBtn) {
    interactionLockToggleBtn.addEventListener('click', () => {
        if (!canToggleInteractionLock()) {
            openLicenseSettings()
            return
        }
        ipcRenderer.send('set-strict-interaction-lock', !interactionLockEnabled)
    })
}

if (websiteLockDomainsInput) {
    websiteLockDomainsInput.addEventListener('input', () => {
        ipcRenderer.send('set-strict-website-domains', parseWebsiteDomains())
        renderHeroPreview()
    })
}

if (websiteLockToggleBtn) {
    websiteLockToggleBtn.addEventListener('click', async () => {
        if (!canToggleWebsiteLock()) {
            openLicenseSettings()
            return
        }
        if (websiteLockBusy) return
        websiteLockBusy = true
        renderWebsiteLockState({ websiteLockEnabled, domains: parseWebsiteDomains() })

        const result = await ipcRenderer.invoke('set-strict-website-lock', {
            enabled: !websiteLockEnabled,
            domains: parseWebsiteDomains()
        })

        websiteLockBusy = false
        renderWebsiteLockState({
            websiteLockEnabled: result.enabled,
            domains: parseWebsiteDomains(),
            error: result.error
        })
    })
}