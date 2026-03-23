/* =====================
   SETTINGS IPC (guard: el bot�n puede no existir en esta vista)
   ===================== */

const { ipcRenderer } = require('electron')

const configBtn = document.getElementById("configBtn")
const minimizeBtn = document.getElementById("minimizeBtn")
const closeBtn  = document.getElementById("closeBtn")

if(configBtn) {
    configBtn.addEventListener("click", () => ipcRenderer.send("open-settings"))
}
if(minimizeBtn) {
    minimizeBtn.addEventListener("click", () => ipcRenderer.send("minimize-app"))
}
if(closeBtn) {
    closeBtn.addEventListener("click", () => ipcRenderer.send("close-app"))
}

/* colores/tema/fuente guardados */
const savedAccent = localStorage.getItem("accentColor")
const savedText   = localStorage.getItem("textColor")
const savedTheme  = localStorage.getItem("dashTheme") || "glass"
let savedFont     = localStorage.getItem("fontFamily") || "Inter"
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
    Urbanist: 992
}
const dashboardEl = document.querySelector(".dashboard")
let widthSyncRaf = 0

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
    const desiredWidth = Math.max(
        FONT_WIDTHS[savedFont] || 960,
        Math.ceil(dashboardWidth + bodyPaddingX + 6)
    )
    ipcRenderer.send("set-window-width", desiredWidth)
}

function scheduleWindowWidthSync() {
    if (widthSyncRaf) cancelAnimationFrame(widthSyncRaf)
    widthSyncRaf = requestAnimationFrame(() => {
        widthSyncRaf = 0
        syncWindowWidth()
    })
}

function applyFont(font) {
    savedFont = font
    document.documentElement.style.setProperty('--font-family', `'${font}', sans-serif`)
    scheduleWindowWidthSync()
}
applyFont(savedFont)

if (dashboardEl && typeof ResizeObserver !== "undefined") {
    const resizeObserver = new ResizeObserver(() => scheduleWindowWidthSync())
    resizeObserver.observe(dashboardEl)
}

window.addEventListener("resize", scheduleWindowWidthSync)

if (document.fonts?.ready) {
    document.fonts.ready.then(() => scheduleWindowWidthSync())
}

ipcRenderer.on("apply-colors", (event, { accentColor, textColor, theme, font }) => {
    if(accentColor) document.documentElement.style.setProperty("--accent-color", accentColor)
    if(textColor)   document.documentElement.style.setProperty("--text-color",   textColor)
    if(theme)       document.documentElement.setAttribute("data-theme", theme)
    if(font)        applyFont(font)
    scheduleWindowWidthSync()
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

    document.getElementById("clock").textContent = `${String(h).padStart(2,"0")}:${m}:${s}`
    document.getElementById("clockPeriod").textContent = period
    document.getElementById("date").textContent = now.toLocaleDateString("es-MX", {
        weekday: "long", month: "long", day: "numeric"
    })
}

setInterval(updateClock, 1000)
updateClock()


/* =====================
   STATS
   Persistencia diaria + historial 30 días + 3 páginas navegables.
   Módulo IIFE — sin dependencias externas.
   ===================== */
const Stats = (() => {
    const PAGE_TITLES = ['Timer', 'Tasks', 'History']

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
        if (_titleEl) _titleEl.textContent = PAGE_TITLES[n]
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
        const list    = document.getElementById('taskList')
        const all     = list ? list.querySelectorAll('.todo__item').length       : 0
        const done    = list ? list.querySelectorAll('.todo__item--completed').length : 0
        const pending = all - done
        const rate    = all > 0 ? Math.round(done / all * 100) : 0
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

const taskList  = document.getElementById("taskList")
const taskInput = document.getElementById("taskInput")

const CHECK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>`

function loadTasks() {
    const raw   = JSON.parse(localStorage.getItem("tasks") || "[]")
    /* migración: soporte strings antiguas y objetos nuevos {text, done} */
    const tasks = raw.map(t => typeof t === 'string' ? { text: t, done: false } : t)
    tasks.forEach(t => appendTask(t.text, t.done))
}

function addTask() {
    if (!taskInput || taskInput.value.trim() === "") return
    const text = taskInput.value.trim()
    appendTask(text, false)
    saveTasks()
    taskInput.value = ""
    Stats.refreshTasks()
}

function appendTask(text, done = false) {
    const li = document.createElement("li")
    li.classList.add("todo__item")
    if (done) li.classList.add("todo__item--completed")
    li.innerHTML = `
        <div class="todo__checkbox${done ? ' todo__checkbox--checked' : ''}"></div>
        <span class="todo__text">${text}</span>
        <button class="todo__remove" title="Eliminar">&times;</button>
    `

    const checkbox = li.querySelector(".todo__checkbox")
    if (done) checkbox.innerHTML = CHECK_SVG
    checkbox.addEventListener("click", () => {
        const completed = li.classList.toggle("todo__item--completed")
        checkbox.classList.toggle("todo__checkbox--checked", completed)
        checkbox.innerHTML = completed ? CHECK_SVG : ""
        saveTasks()
        Stats.refreshTasks()
    })

    li.querySelector(".todo__remove").addEventListener("click", () => {
        li.remove()
        saveTasks()
        Stats.refreshTasks()
    })

    taskList.appendChild(li)
}

function saveTasks() {
    const items = Array.from(taskList.querySelectorAll('.todo__item'))
    const tasks = items.map(li => ({
        text: li.querySelector('.todo__text').textContent,
        done: li.classList.contains('todo__item--completed')
    }))
    localStorage.setItem('tasks', JSON.stringify(tasks))
}

document.getElementById("addTaskBtn").addEventListener("click", addTask)
taskInput.addEventListener("keydown", (e) => { if(e.key === "Enter") addTask() })

loadTasks()


/* =====================
   POMODORO
   ===================== */

let FOCUS_TIME = (parseInt(localStorage.getItem("focusDuration")) || 25) * 60
let BREAK_TIME = (parseInt(localStorage.getItem("breakDuration")) || 5)  * 60
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

function updateTimerDisplay() {
    const m = Math.floor(time / 60)
    const s = time % 60
    document.getElementById("timer").textContent =
        `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`

    /* animar c�rculo SVG */
    const offset = CIRCUMFERENCE * (1 - time / totalTime)
    progressCircle.style.strokeDashoffset = offset
}

function startTimer() {
    if(interval) {
        /* PAUSAR */
        clearInterval(interval)
        interval = null
        startBtn.textContent = "Reanudar"
        return
    }

    startBtn.textContent = "Pausar"

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
                pomodoroLabel.textContent = "Break Time"
                startBtn.textContent      = "Iniciar descanso"
                alert(`Pomodoro #${Stats.getPomodoros()} completado! Toma 5 minutos.`)
            } else {
                isBreak   = false
                time      = FOCUS_TIME
                totalTime = FOCUS_TIME
                pomodoroLabel.textContent = "Focus Time"
                startBtn.textContent      = "Iniciar"
                alert("Descanso terminado! A enfocarse.")
            }
            updateTimerDisplay()
        }
    }, 1000)
}

function resetTimer() {
    clearInterval(interval)
    interval  = null
    isBreak   = false
    time      = FOCUS_TIME
    totalTime = FOCUS_TIME
    pomodoroLabel.textContent = "Focus Time"
    startBtn.textContent      = "Iniciar"
    updateTimerDisplay()
}

function startBreak() {
    clearInterval(interval)
    interval  = null
    isBreak   = true
    Stats.addBreak()
    time      = BREAK_TIME
    totalTime = BREAK_TIME
    pomodoroLabel.textContent = "Break Time"
    startBtn.textContent      = "Iniciar"
    updateTimerDisplay()
}

startBtn.addEventListener("click", startTimer)
resetBtn.addEventListener("click", resetTimer)
breakBtn.addEventListener("click", startBreak)

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
        els.playBtn.setAttribute("aria-label", playing ? "Pausar" : "Reproducir")
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
        const newTitle  = data.title || "Nothing playing"
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
   WEATHER
   Geolocalización IP (ip-api.com, gratis, sin key) +
   clima (open-meteo.com, gratis, sin key).
   Node https para evitar CORS. Cache en localStorage.
   ===================== */
const Weather = (() => {
    const https = require('https')
    const http  = require('http')

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
        0: 'Clear', 1: 'Mostly Clear', 2: 'Partly Cloudy', 3: 'Overcast',
        45: 'Fog', 48: 'Icy Fog',
        51: 'Light Drizzle', 53: 'Drizzle', 55: 'Heavy Drizzle',
        56: 'Frz. Drizzle', 57: 'Frz. Drizzle',
        61: 'Light Rain', 63: 'Rain', 65: 'Heavy Rain',
        66: 'Frz. Rain', 67: 'Frz. Rain',
        71: 'Light Snow', 73: 'Snow', 75: 'Heavy Snow', 77: 'Snow Grains',
        80: 'Showers', 81: 'Showers', 82: 'Heavy Showers',
        85: 'Snow Showers', 86: 'Heavy Snow Showers',
        95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm'
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
        if (els.icon)     els.icon.textContent     = ICONS[d.code]  ?? '\uD83C\uDF21\uFE0F'
        if (els.temp)     els.temp.textContent     = `${d.temp}\xB0`
        if (els.cond)     els.cond.textContent     = DESCS[d.code]  ?? '\u2014'
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
        }
    }
})()

Weather.init()
