
MusicPlayer.init()
Stats.init()

/* Feature K — inicializar input de meta */
;(function initGoalInput() {
    const input = document.getElementById('pomodoroGoalInput')
    if (!input) return
    const saved = getPomodoroGoal()
    if (saved > 0) input.value = saved
    input.addEventListener('change', () => {
        const v = parseInt(input.value, 10)
        if (v >= 1 && v <= 20) {
            localStorage.setItem('pomodoroGoal', String(v))
            input.classList.remove('pomodoro__goal-input--error')
        } else {
            localStorage.removeItem('pomodoroGoal')
            input.value = ''
            input.classList.add('pomodoro__goal-input--error')
            setTimeout(() => input.classList.remove('pomodoro__goal-input--error'), 600)
        }
        updateTimerCost()
        syncPomodoroVisualState()
    })
    /* also allow clearing with backspace -> empty string */
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && input.value === '') {
            localStorage.removeItem('pomodoroGoal')
            updateTimerCost()
            syncPomodoroVisualState()
        }
    })
})()

const _pomodoroActiveTaskDoneBtn = document.getElementById('pomodoroActiveTaskDone')
if (_pomodoroActiveTaskDoneBtn) {
    _pomodoroActiveTaskDoneBtn.addEventListener('click', () => {
        TodoList.completeActiveTask()
        syncPomodoroActiveTask()
    })
}
syncPomodoroActiveTask()

/* =====================
   i18n — aplicar traducciones al DOM
   ===================== */
function applyLanguageToPage() {
    i18n.applyPage()
    if (TodoList && typeof TodoList.render === 'function') {
        TodoList.render()
        syncPomodoroActiveTask()
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
