const { ipcRenderer } = require('electron')

function applyInteractionLockTheme(payload = {}) {
    const accentColor = payload.accentColor || localStorage.getItem('accentColor') || '#3b82f6'
    const textColor = payload.textColor || localStorage.getItem('textColor') || '#ffffff'
    const theme = payload.theme || localStorage.getItem('dashTheme') || 'glass'
    const font = payload.font || localStorage.getItem('fontFamily') || 'Inter'

    document.documentElement.style.setProperty('--accent-color', accentColor)
    document.documentElement.style.setProperty('--text-color', textColor)
    document.documentElement.style.setProperty('--font-family', `'${font}', sans-serif`)
    document.documentElement.setAttribute('data-theme', theme)
}

applyInteractionLockTheme()

ipcRenderer.on('apply-colors', (_, payload) => {
    applyInteractionLockTheme(payload)
})

ipcRenderer.on('strict-interaction-lock-blocked', () => {
    document.body.classList.remove('interaction-lock--blocked')
    void document.body.offsetWidth
    document.body.classList.add('interaction-lock--blocked')
})

window.addEventListener('mousedown', () => {
    ipcRenderer.send('focus-main-window')
})

window.addEventListener('touchstart', () => {
    ipcRenderer.send('focus-main-window')
})