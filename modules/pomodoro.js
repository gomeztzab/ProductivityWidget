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
let pomodoroAttemptActive = false

/* stats eliminadas — gestionadas por módulo Stats */

const progressCircle = document.querySelector(".pomodoro__circle-progress")
const pomodoroLabel  = document.querySelector(".pomodoro__label")
const pomodoroRoot = document.querySelector(".pomodoro")
const pomodoroStreak = document.getElementById("pomodoroStreak")
const pomodoroStreakValue = document.getElementById("pomodoroStreakValue")
const pomodoroCelebrationBadge = document.getElementById("pomodoroCelebrationBadge")
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
let pomodoroClickAudioCtx = null
let pomodoroNoticeAction = null
let noticeElapsedInterval = null
let pomodoroCelebrationTimeout = null

applyReminderSettings()

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max)
}

/* ---- Sonido de clic del timer (Free) ---- */
function getPomodoroClickAudioCtx() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return null
    if (!pomodoroClickAudioCtx) pomodoroClickAudioCtx = new AudioCtx()
    if (pomodoroClickAudioCtx.state === 'suspended') pomodoroClickAudioCtx.resume().catch(() => {})
    return pomodoroClickAudioCtx
}

function playTimerClickSound(kind) {
    /* kind: 'start' | 'pause' */
    const ctx = getPomodoroClickAudioCtx()
    if (!ctx) return

    const now = ctx.currentTime + 0.01
    const master = ctx.createGain()
    master.gain.setValueAtTime(0.0001, now)
    master.gain.exponentialRampToValueAtTime(0.08, now + 0.012)
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.09)
    master.connect(ctx.destination)

    const osc = ctx.createOscillator()
    osc.type = 'sine'

    if (kind === 'start') {
        osc.frequency.setValueAtTime(680, now)
        osc.frequency.exponentialRampToValueAtTime(820, now + 0.07)
    } else {
        osc.frequency.setValueAtTime(560, now)
        osc.frequency.exponentialRampToValueAtTime(430, now + 0.07)
    }

    osc.connect(master)
    osc.start(now)
    osc.stop(now + 0.1)
}

function renderPomodoroStreak() {
    if (!pomodoroStreak || !pomodoroStreakValue) return
    const streak = Stats.getStreak()
    pomodoroStreakValue.textContent = i18n.t('pomodoro.streakValue', { n: streak })
    pomodoroStreak.classList.toggle('pomodoro__streak--warm', streak >= 2)
    pomodoroStreak.classList.toggle('pomodoro__streak--hot', streak >= 4)
    pomodoroStreak.classList.toggle('pomodoro__streak--legend', streak >= 8)
}

function syncPomodoroVisualState() {
    if (!pomodoroRoot || !progressCircle || !totalTime) return

    const remainingRatio = clamp(time / totalTime, 0, 1)
    let progressColor = 'var(--accent-color)'
    let glowColor = 'color-mix(in srgb, var(--accent-color) 62%, transparent)'
    const isPaused = !interval && time < totalTime && time > 0

    if (remainingRatio <= 0.55 && remainingRatio > 0.2) {
        const warningMix = Math.round(((0.55 - remainingRatio) / 0.35) * 48)
        progressColor = `color-mix(in srgb, var(--accent-color) ${100 - warningMix}%, #f59e0b)`
        glowColor = `color-mix(in srgb, ${progressColor} 70%, transparent)`
    } else if (remainingRatio <= 0.2) {
        const dangerMix = Math.round(((0.2 - remainingRatio) / 0.2) * 64)
        progressColor = `color-mix(in srgb, var(--accent-color) ${100 - dangerMix}%, #ef4444)`
        glowColor = `color-mix(in srgb, ${progressColor} 76%, transparent)`
    }

    if (isBreak) {
        progressColor = `color-mix(in srgb, var(--accent-color) 78%, #22c55e)`
        glowColor = `color-mix(in srgb, ${progressColor} 68%, transparent)`
    }

    /* Feature K — meta diaria alcanzada → verde */
    const goal = getPomodoroGoal()
    if (goal > 0 && Stats.getPomodoros() >= goal) {
        progressColor = `color-mix(in srgb, #22c55e 85%, var(--accent-color))`
        glowColor     = `color-mix(in srgb, #22c55e 70%, transparent)`
    }

    pomodoroRoot.style.setProperty('--pomodoro-progress-color', progressColor)
    pomodoroRoot.style.setProperty('--pomodoro-progress-glow', glowColor)
    pomodoroRoot.classList.toggle('pomodoro--running', Boolean(interval))
    pomodoroRoot.classList.toggle('pomodoro--paused', isPaused)
    pomodoroRoot.classList.toggle('pomodoro--break', isBreak)
    pomodoroRoot.classList.toggle('pomodoro--urgent', remainingRatio <= 0.35)
    pomodoroRoot.classList.toggle('pomodoro--critical', remainingRatio <= 0.15)

    /* Feature G — deshabilitar "Descanso" cuando ya estamos en break */
    if (breakBtn) breakBtn.disabled = isBreak
}

function triggerPomodoroCelebration(pomodoroCount) {
    if (!pomodoroRoot || !pomodoroCelebrationBadge) return
    pomodoroCelebrationBadge.textContent = i18n.t('pomodoro.celebrationBadge', { n: pomodoroCount })
    pomodoroRoot.classList.remove('pomodoro--celebrating')
    void pomodoroRoot.offsetWidth
    pomodoroRoot.classList.add('pomodoro--celebrating')
    clearTimeout(pomodoroCelebrationTimeout)
    pomodoroCelebrationTimeout = setTimeout(() => {
        pomodoroRoot.classList.remove('pomodoro--celebrating')
    }, 1500)
}

function showPomodoroNotice({ kicker, title, body, actionLabel, action }) {
    if (!pomodoroNotice) return
    pomodoroNoticeAction = typeof action === "function" ? action : null
    if (pomodoroNoticeKicker) pomodoroNoticeKicker.textContent = kicker
    if (pomodoroNoticeTitle) pomodoroNoticeTitle.textContent = title
    if (pomodoroNoticeBody) pomodoroNoticeBody.textContent = body
    if (pomodoroNoticeActionBtn) pomodoroNoticeActionBtn.textContent = actionLabel || "Continuar"
    pomodoroNotice.classList.remove("pomodoro__notice--hidden")

    /* Feature D — elapsed counter */
    clearInterval(noticeElapsedInterval)
    let secs = 0
    const elapsedEl = document.getElementById('pomodoroNoticeElapsed')
    if (elapsedEl) {
        elapsedEl.textContent = '+00:00'
        noticeElapsedInterval = setInterval(() => {
            secs++
            const m = String(Math.floor(secs / 60)).padStart(2, '0')
            const s = String(secs % 60).padStart(2, '0')
            elapsedEl.textContent = `+${m}:${s}`
        }, 1000)
    }
}

function hidePomodoroNotice() {
    pomodoroNoticeAction = null
    if (pomodoroNotice) pomodoroNotice.classList.add("pomodoro__notice--hidden")
    clearInterval(noticeElapsedInterval)
    noticeElapsedInterval = null
    const elapsedEl = document.getElementById('pomodoroNoticeElapsed')
    if (elapsedEl) elapsedEl.textContent = ''
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

/* ---- Tarea activa vinculada al pomodoro (Feature C) ---- */
function syncPomodoroActiveTask() {
    const wrap   = document.getElementById('pomodoroActiveTask')
    const textEl = document.getElementById('pomodoroActiveTaskText')
    const doneBtn = document.getElementById('pomodoroActiveTaskDone')
    if (!wrap || !textEl) return

    const { activeTask } = getTaskStats()

    if (activeTask) {
        textEl.textContent = activeTask.text
        wrap.classList.remove('pomodoro__active-task--hidden')
        wrap.setAttribute('aria-hidden', 'false')
        if (doneBtn) {
            doneBtn.setAttribute('aria-label', i18n.t('pomodoro.activeTask.doneAriaLabel'))
        }
    } else {
        wrap.classList.add('pomodoro__active-task--hidden')
        wrap.setAttribute('aria-hidden', 'true')
    }
}

function updateTimerCost() {
    const el = document.getElementById('pomodoroCost')
    if (!el) return
    const done   = Stats.getPomodoros()
    const goal   = getPomodoroGoal()
    const active = !isBreak && !!interval
    const total  = goal > 0 ? goal : Math.max(done + (active ? 1 : 0), 1)
    const dots   = []
    for (let i = 0; i < total; i++) {
        let cls = 'pomodoro__cost-dot'
        if (i < done) cls += ' pomodoro__cost-dot--done'
        else if (active && i === done) cls += ' pomodoro__cost-dot--active'
        dots.push(`<span class="${cls}"></span>`)
    }
    el.innerHTML = dots.join('')

    /* Feature K — fraction label */
    const fracEl = document.getElementById('pomodoroGoalFraction')
    if (fracEl) {
        if (goal > 0) {
            fracEl.textContent = `${done}/${goal}`
            fracEl.hidden = false
        } else {
            fracEl.hidden = true
        }
    }
}

function updateTimerDisplay() {
    const m = Math.floor(time / 60)
    const s = time % 60
    const timeStr = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    document.getElementById("timer").textContent = timeStr
    document.title = `${timeStr} · Focus Pro`

    /* animar c�rculo SVG */
    const offset = CIRCUMFERENCE * (1 - time / totalTime)
    progressCircle.style.strokeDashoffset = offset
    syncPomodoroVisualState()
    updateTimerCost()
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
        syncPomodoroVisualState()
        playTimerClickSound('pause')
        return
    }

    hidePomodoroNotice()
    startBtn.textContent = i18n.t('pomodoro.pause')
    playTimerClickSound('start')

    if (!isBreak) {
        pomodoroAttemptActive = true
        Stats.addAttempt()
    }

    interval = setInterval(() => {
        time--
        if (!isBreak) Stats.addFocusedTime(1)
        updateTimerDisplay()

        if(time <= 0) {
            clearInterval(interval)
            interval = null

            if(!isBreak) {
                pomodoroAttemptActive = false
                Stats.addPomodoro()
                Stats.addBreak()
                renderPomodoroStreak()
                triggerPomodoroCelebration(Stats.getPomodoros())
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

    syncPomodoroVisualState()
}

function resetTimer() {
    hidePomodoroNotice()
    if (pomodoroAttemptActive) { Stats.addInterrupted(); pomodoroAttemptActive = false }
    clearInterval(interval)
    interval  = null
    isBreak   = false
    time      = FOCUS_TIME
    totalTime = FOCUS_TIME
    pomodoroLabel.textContent = i18n.t('pomodoro.focusTime')
    startBtn.textContent      = i18n.t('pomodoro.start')
    updateTimerDisplay()
}

/* Feature H — confirmar antes de resetear cuando hay un bloque en curso */
function confirmResetTimer() {
    if (!pomodoroAttemptActive) {
        resetTimer()
        return
    }
    showPomodoroNotice({
        kicker:      i18n.t('pomodoro.confirmReset.kicker'),
        title:       i18n.t('pomodoro.confirmReset.title'),
        body:        i18n.t('pomodoro.confirmReset.body'),
        actionLabel: i18n.t('pomodoro.confirmReset.confirm'),
        action:      () => resetTimer()
    })
}

function startBreak() {
    hidePomodoroNotice()
    if (pomodoroAttemptActive) { Stats.addInterrupted(); pomodoroAttemptActive = false }
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

startBtn.addEventListener("click", () => startTimer())
resetBtn.addEventListener("click", confirmResetTimer)
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
renderPomodoroStreak()

