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
let exitLockEnabled = false
let screenLockEnabled = false
let interactionLockEnabled = false

function applyStrictModeTheme(payload = {}) {
    const accentColor = payload.accentColor || localStorage.getItem('accentColor') || '#3b82f6'
    const textColor = payload.textColor || localStorage.getItem('textColor') || '#ffffff'
    const theme = payload.theme || localStorage.getItem('dashTheme') || 'glass'
    const font = payload.font || localStorage.getItem('fontFamily') || 'Inter'

    document.documentElement.style.setProperty('--accent-color', accentColor)
    document.documentElement.style.setProperty('--text-color', textColor)
    document.documentElement.style.setProperty('--font-family', `'${font}', sans-serif`)
    document.documentElement.setAttribute('data-theme', theme)
}

applyStrictModeTheme()

ipcRenderer.on('apply-colors', (_, payload) => {
    applyStrictModeTheme(payload)
})

function renderExitLockState(enabled) {
    exitLockEnabled = Boolean(enabled)
    if (exitLockCard) exitLockCard.classList.toggle('strict-mode__card--locked', exitLockEnabled)
    if (exitLockStatus) exitLockStatus.textContent = `Estado: ${exitLockEnabled ? 'activo' : 'inactivo'}`
    if (exitLockToggleBtn) exitLockToggleBtn.textContent = exitLockEnabled ? 'Desactivar bloqueo' : 'Activar bloqueo'
}

function renderScreenLockState(enabled) {
    screenLockEnabled = Boolean(enabled)
    if (screenLockCard) screenLockCard.classList.toggle('strict-mode__card--locked', screenLockEnabled)
    if (screenLockStatus) screenLockStatus.textContent = `Estado: ${screenLockEnabled ? 'activo' : 'inactivo'}`
    if (screenLockToggleBtn) screenLockToggleBtn.textContent = screenLockEnabled ? 'Desactivar pantalla lock' : 'Activar pantalla lock'
}

function renderInteractionLockState(enabled) {
    interactionLockEnabled = Boolean(enabled)
    if (interactionLockCard) interactionLockCard.classList.toggle('strict-mode__card--locked', interactionLockEnabled)
    if (interactionLockStatus) interactionLockStatus.textContent = `Estado: ${interactionLockEnabled ? 'activo' : 'inactivo'}`
    if (interactionLockToggleBtn) interactionLockToggleBtn.textContent = interactionLockEnabled ? 'Desactivar bloqueo PRO' : 'Activar bloqueo PRO'
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
        ipcRenderer.send('set-strict-screen-lock', !screenLockEnabled)
    })
}

if (interactionLockToggleBtn) {
    interactionLockToggleBtn.addEventListener('click', () => {
        ipcRenderer.send('set-strict-interaction-lock', !interactionLockEnabled)
    })
}