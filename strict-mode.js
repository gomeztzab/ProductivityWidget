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
let exitLockEnabled = false
let screenLockEnabled = false
let interactionLockEnabled = false
let websiteLockEnabled = false
let websiteLockBusy = false

function parseWebsiteDomains() {
    if (!websiteLockDomainsInput) return []
    return websiteLockDomainsInput.value
        .split(/[\n,;]/)
        .map(value => value.trim())
        .filter(Boolean)
}

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

function getHeroModeConfig() {
    if (websiteLockEnabled) {
        return {
            badge: websiteLockBusy ? 'Aplicando bloqueo' : 'Bloqueo web activo',
            title: 'Sitios bloqueados a nivel sistema',
            text: 'El bloqueo usa el archivo hosts y desactiva Secure DNS compatible para que los navegadores comunes no salten la restriccion.',
            scope: 'Sistema y navegadores',
            tone: 'website'
        }
    }

    if (interactionLockEnabled) {
        return {
            badge: 'Bloqueo PRO activo',
            title: 'Solo el widget queda utilizable',
            text: 'Todo lo que rodea la ventana principal queda cubierto por bloqueadores para mantener el foco en Pomodoro.',
            scope: 'Escritorio alrededor del widget',
            tone: 'interaction'
        }
    }

    if (screenLockEnabled) {
        return {
            badge: 'Pantalla lock activa',
            title: 'La pantalla queda tomada por el lock',
            text: 'Se abre una ventana fullscreen dominante para cortar distracciones visuales y forzar un contexto de estudio.',
            scope: 'Pantalla completa',
            tone: 'screen'
        }
    }

    if (exitLockEnabled) {
        return {
            badge: 'Bloqueo de salida activo',
            title: 'La ventana principal no se puede cerrar',
            text: 'El widget se mantiene abierto y bloquea salidas comunes mientras el modo siga activo.',
            scope: 'Ventana principal',
            tone: 'exit'
        }
    }

    return {
        badge: 'Panel en espera',
        title: 'Ningun modo activo',
        text: 'Selecciona una restriccion para ver aqui el alcance real que tendra sobre la app, la pantalla o los sitios configurados.',
        scope: 'Sin bloqueo',
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
        heroDomains.textContent = `${displayedDomains.length} ${displayedDomains.length === 1 ? 'listo' : 'listos'}`
    }

    if (!heroTags) return

    const tags = []

    if (websiteLockEnabled) tags.push('Hosts activo')
    if (screenLockEnabled) tags.push('Fullscreen')
    if (interactionLockEnabled) tags.push('Solo widget')
    if (exitLockEnabled) tags.push('Sin salida rapida')

    displayedDomains.slice(0, 4).forEach(domain => tags.push(domain))

    if (!tags.length) {
        heroTags.innerHTML = '<span class="strict-mode__hero-tag strict-mode__hero-tag--muted">Sin dominios cargados</span>'
        return
    }

    const hiddenCount = displayedDomains.length - Math.min(displayedDomains.length, 4)
    if (hiddenCount > 0) tags.push(`+${hiddenCount} mas`)

    heroTags.innerHTML = tags
        .map(tag => `<span class="strict-mode__hero-tag">${tag}</span>`)
        .join('')
}

applyStrictModeTheme()
renderHeroPreview()

ipcRenderer.on('apply-colors', (_, payload) => {
    applyStrictModeTheme(payload)
})

function renderExitLockState(enabled) {
    exitLockEnabled = Boolean(enabled)
    if (exitLockCard) exitLockCard.classList.toggle('strict-mode__card--locked', exitLockEnabled)
    if (exitLockStatus) exitLockStatus.textContent = `Estado: ${exitLockEnabled ? 'activo' : 'inactivo'}`
    if (exitLockToggleBtn) exitLockToggleBtn.textContent = exitLockEnabled ? 'Desactivar bloqueo' : 'Activar bloqueo'
    renderHeroPreview()
}

function renderScreenLockState(enabled) {
    screenLockEnabled = Boolean(enabled)
    if (screenLockCard) screenLockCard.classList.toggle('strict-mode__card--locked', screenLockEnabled)
    if (screenLockStatus) screenLockStatus.textContent = `Estado: ${screenLockEnabled ? 'activo' : 'inactivo'}`
    if (screenLockToggleBtn) screenLockToggleBtn.textContent = screenLockEnabled ? 'Desactivar pantalla lock' : 'Activar pantalla lock'
    renderHeroPreview()
}

function renderInteractionLockState(enabled) {
    interactionLockEnabled = Boolean(enabled)
    if (interactionLockCard) interactionLockCard.classList.toggle('strict-mode__card--locked', interactionLockEnabled)
    if (interactionLockStatus) interactionLockStatus.textContent = `Estado: ${interactionLockEnabled ? 'activo' : 'inactivo'}`
    if (interactionLockToggleBtn) interactionLockToggleBtn.textContent = interactionLockEnabled ? 'Desactivar bloqueo PRO' : 'Activar bloqueo PRO'
    renderHeroPreview()
}

function renderWebsiteLockState(payload = {}) {
    websiteLockEnabled = Boolean(payload.websiteLockEnabled)

    if (websiteLockCard) websiteLockCard.classList.toggle('strict-mode__card--locked', websiteLockEnabled)
    if (websiteLockStatus) {
        const count = Array.isArray(payload.domains) ? payload.domains.length : 0
        websiteLockStatus.textContent = websiteLockEnabled
            ? `Estado: activo (${count} dominio${count === 1 ? '' : 's'})`
            : 'Estado: inactivo'
    }
    if (websiteLockToggleBtn) {
        websiteLockToggleBtn.textContent = websiteLockBusy
            ? 'Aplicando...'
            : websiteLockEnabled ? 'Desactivar bloqueo web' : 'Activar bloqueo web'
        websiteLockToggleBtn.disabled = websiteLockBusy
    }
    if (websiteLockDomainsInput && Array.isArray(payload.domains) && document.activeElement !== websiteLockDomainsInput) {
        websiteLockDomainsInput.value = payload.domains.join('\n')
    }
    if (websiteLockHint) {
        websiteLockHint.textContent = payload.error || `Se bloquean en todos los navegadores usando ${payload.hostsPath || 'el archivo hosts'}.`
    }
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
        ipcRenderer.send('set-strict-screen-lock', !screenLockEnabled)
    })
}

if (interactionLockToggleBtn) {
    interactionLockToggleBtn.addEventListener('click', () => {
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