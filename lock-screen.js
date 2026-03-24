const { ipcRenderer } = require('electron')

const exitBtn = document.getElementById('lockScreenExitBtn')
const clockEl = document.getElementById('lockScreenClock')
const dateEl = document.getElementById('lockScreenDate')
const stateEl = document.getElementById('lockScreenState')

function applyLockTheme(payload = {}) {
    const accentColor = payload.accentColor || localStorage.getItem('accentColor') || '#3b82f6'
    const textColor = payload.textColor || localStorage.getItem('textColor') || '#ffffff'
    const theme = payload.theme || localStorage.getItem('dashTheme') || 'glass'
    const font = payload.font || localStorage.getItem('fontFamily') || 'Inter'

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

ipcRenderer.on('apply-colors', (_, payload) => {
    applyLockTheme(payload)
    if (payload.language) {
        i18n.setLang(payload.language)
        i18n.applyPage()
        updateLockClock()
    }
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