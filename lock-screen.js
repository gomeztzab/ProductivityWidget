const { ipcRenderer } = require('electron')

const exitBtn = document.getElementById('lockScreenExitBtn')
const clockEl = document.getElementById('lockScreenClock')
const dateEl = document.getElementById('lockScreenDate')
const stateEl = document.getElementById('lockScreenState')
const FREE_ACCENT_COLORS = new Set(['#3b82f6', '#10b981', '#111111'])
const FREE_TEXT_COLORS = new Set(['#ffffff', '#e0f2fe', '#e5e7eb', '#111111'])
const FREE_THEMES = new Set(['glass', 'light'])
const FREE_FONTS = new Set(['Inter', 'Nunito'])
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

async function syncLicenseState() {
    try {
        const payload = await ipcRenderer.invoke('get-license-state')
        currentLicenseState = normalizeLicenseState(payload)
    } catch (_) {
        currentLicenseState = createEmptyLicenseState()
    }

    applyLockTheme()
}

function applyLockTheme(payload = {}) {
    if (payload.license) {
        currentLicenseState = normalizeLicenseState(payload.license)
    }

    const accentColor = ensureAllowedAccentColor(payload.accentColor || localStorage.getItem('accentColor') || '#3b82f6')
    const textColor = ensureAllowedTextColor(payload.textColor || localStorage.getItem('textColor') || '#ffffff')
    const theme = ensureAllowedTheme(payload.theme || localStorage.getItem('dashTheme') || 'glass')
    const font = ensureAllowedFont(payload.font || localStorage.getItem('fontFamily') || 'Inter')

    document.documentElement.style.setProperty('--accent-color', accentColor)
    document.documentElement.style.setProperty('--text-color', textColor)
    document.documentElement.style.setProperty('--font-family', `'${font}', sans-serif`)
    document.documentElement.setAttribute('data-theme', theme)
}

function updateLockClock() {
    const now = new Date()
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    if (clockEl) clockEl.textContent = `${hours}:${minutes}`
    if (dateEl) {
        dateEl.textContent = now.toLocaleDateString(i18n.t('clock.locale'), {
            weekday: 'long',
            month: 'long',
            day: 'numeric'
        })
    }
}

applyLockTheme()
i18n.applyPage()
updateLockClock()
setInterval(updateLockClock, 1000)
void syncLicenseState()

ipcRenderer.on('apply-colors', (_, payload) => {
    applyLockTheme(payload)
    if (payload.language) {
        i18n.setLang(payload.language)
        i18n.applyPage()
        updateLockClock()
    }
})

ipcRenderer.on('license-state-updated', (_, payload = {}) => {
    currentLicenseState = normalizeLicenseState(payload)
    applyLockTheme()
})

ipcRenderer.on('strict-screen-lock-state', (_, payload = {}) => {
    if (stateEl) stateEl.textContent = i18n.t(payload.screenLockEnabled ? 'lockScreen.status.active' : 'lockScreen.status.inactive')
})

ipcRenderer.on('strict-screen-lock-blocked', () => {
    document.body.classList.remove('lock-screen--blocked')
    void document.body.offsetWidth
    document.body.classList.add('lock-screen--blocked')
})

if (exitBtn) {
    exitBtn.addEventListener('click', () => {
        ipcRenderer.send('set-strict-screen-lock', false)
    })
}