/* =====================
   SETTINGS IPC (guard: el bot�n puede no existir en esta vista)
   ===================== */

const { ipcRenderer } = require('electron')

const configBtn = document.getElementById("configBtn")
const closeBtn  = document.getElementById("closeBtn")

if(configBtn) {
    configBtn.addEventListener("click", () => ipcRenderer.send("open-settings"))
}
if(closeBtn) {
    closeBtn.addEventListener("click", () => ipcRenderer.send("close-app"))
}

/* colores guardados */
const savedAccent = localStorage.getItem("accentColor")
const savedText   = localStorage.getItem("textColor")
if(savedAccent) document.documentElement.style.setProperty("--accent-color", savedAccent)
if(savedText)   document.documentElement.style.setProperty("--text-color",   savedText)

ipcRenderer.on("apply-colors", (event, { accentColor, textColor }) => {
    if(accentColor) document.documentElement.style.setProperty("--accent-color", accentColor)
    if(textColor)   document.documentElement.style.setProperty("--text-color",   textColor)
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
   TODO LIST
   ===================== */

const taskList  = document.getElementById("taskList")
const taskInput = document.getElementById("taskInput")

const CHECK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>`

function loadTasks() {
    const tasks = JSON.parse(localStorage.getItem("tasks") || "[]")
    tasks.forEach(t => appendTask(t))
}

function addTask() {
    if(!taskInput || taskInput.value.trim() === "") return
    const text = taskInput.value.trim()
    appendTask(text)
    saveTask(text)
    taskInput.value = ""
}

function appendTask(text) {
    const li = document.createElement("li")
    li.classList.add("todo__item")
    li.innerHTML = `
        <div class="todo__checkbox"></div>
        <span class="todo__text">${text}</span>
        <button class="todo__remove" title="Eliminar">&times;</button>
    `

    const checkbox = li.querySelector(".todo__checkbox")
    checkbox.addEventListener("click", () => {
        const completed = li.classList.toggle("todo__item--completed")
        checkbox.classList.toggle("todo__checkbox--checked", completed)
        checkbox.innerHTML = completed ? CHECK_SVG : ""
    })

    li.querySelector(".todo__remove").addEventListener("click", () => {
        li.remove()
        const tasks = JSON.parse(localStorage.getItem("tasks") || "[]")
        localStorage.setItem("tasks", JSON.stringify(tasks.filter(t => t !== text)))
    })

    taskList.appendChild(li)
}

function saveTask(text) {
    const tasks = JSON.parse(localStorage.getItem("tasks") || "[]")
    tasks.push(text)
    localStorage.setItem("tasks", JSON.stringify(tasks))
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

/* stats */
let pomodoroCount       = 0
let totalFocusedSeconds = 0
let breakCount          = 0

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
        if(!isBreak) totalFocusedSeconds++
        updateTimerDisplay()
        updateStats()

        if(time <= 0) {
            clearInterval(interval)
            interval = null

            if(!isBreak) {
                pomodoroCount++
                breakCount++
                isBreak   = true
                time      = BREAK_TIME
                totalTime = BREAK_TIME
                pomodoroLabel.textContent = "Break Time"
                startBtn.textContent      = "Iniciar descanso"
                updateStats()
                alert(`Pomodoro #${pomodoroCount} completado! Toma 5 minutos.`)
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
    breakCount++
    time      = BREAK_TIME
    totalTime = BREAK_TIME
    pomodoroLabel.textContent = "Break Time"
    startBtn.textContent      = "Iniciar"
    updateTimerDisplay()
    updateStats()
}

function updateStats() {
    document.getElementById("statPomodoros").textContent = pomodoroCount
    const h = Math.floor(totalFocusedSeconds / 3600)
    const m = Math.floor((totalFocusedSeconds % 3600) / 60)
    document.getElementById("statFocused").textContent = h > 0 ? `${h}h ${m}m` : `${m}m`
    document.getElementById("statBreaks").textContent = breakCount
}

startBtn.addEventListener("click", startTimer)
resetBtn.addEventListener("click", resetTimer)
breakBtn.addEventListener("click", startBreak)

updateTimerDisplay()
updateStats()
