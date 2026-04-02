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
        lastSyncAt  : 0,
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

    function clampPosition(position, duration) {
        if (!Number.isFinite(position) || position < 0) return 0
        if (!Number.isFinite(duration) || duration <= 0) return position
        return Math.min(position, duration)
    }

    function resolveLivePosition(position, duration, playing, capturedAt) {
        const safeDuration = Number.isFinite(duration) ? duration : 0
        let safePosition = clampPosition(position, safeDuration)

        if (!playing) return safePosition
        if (!Number.isFinite(capturedAt) || capturedAt <= 0) return safePosition

        const elapsedSeconds = Math.max(0, (Date.now() - capturedAt) / 1000)
        safePosition += elapsedSeconds
        return clampPosition(safePosition, safeDuration)
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
        const rawPos    = Number(data.position)
        const rawDur    = Number(data.duration)
        const newDur    = Number.isFinite(rawDur) && rawDur > 0 ? rawDur : 0
        const playbackStatus = typeof data.status === 'string' ? data.status : ''
        const reportedPlaying = typeof data.isPlaying === 'boolean' ? data.isPlaying : playbackStatus === 'Playing'
        const capturedAt = Number(data.capturedAt)
        const hasTrackData = Boolean((typeof data.title === 'string' && data.title.trim()) || newDur > 0)
        const isExplicitPause = ['Paused', 'Stopped', 'Closed'].includes(playbackStatus)
        const newPlay = reportedPlaying || (!isExplicitPause && hasTrackData)
        const newPos    = resolveLivePosition(rawPos, newDur, newPlay, capturedAt)
        const curTitle  = els.trackName ? els.trackName.textContent : ""
        const newTitle  = data.title || i18n.t('music.nothingPlaying')
        const trackChanged = newTitle !== curTitle
        const drift     = newPos - state.position

        const durChanged = newDur !== state.duration
        state.duration = newDur
        state.lastSyncAt = Number.isFinite(capturedAt) ? capturedAt : Date.now()

        /* Pista nueva, seek claro o sin duración → posición exacta */
        if (trackChanged || Math.abs(drift) > 1.25 || !state.duration) {
            state.position    = newPos
            state.renderedPct = -1
            state.renderedSec = -1
        } else if (Math.abs(drift) > 0.15) {
            state.position = clampPosition(state.position + drift * 0.75, state.duration)
        }

        /* Duración cambió sin cambio de posición → forzar re-render del tiempo */
        if (durChanged) state.renderedSec = -1

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
        document.addEventListener('visibilitychange', () => {
            if (document.hidden || !state.playing) return
            state.renderedPct = -1
            state.renderedSec = -1
            startTick()
        })
    }

    return { init }
})()

