const { ipcRenderer } = require('electron')

document.getElementById("configBtn").addEventListener("click", openSettings)

function openSettings(){
ipcRenderer.send("open-settings")
}

/* aplicar configuraciones guardadas */

const savedColor = localStorage.getItem("widgetColor")

if(savedColor){
document.documentElement.style.setProperty("--widget-color", savedColor)
}

const savedPomodoro = localStorage.getItem("pomodoroTime")

if(savedPomodoro){
time = savedPomodoro * 60
updateTimer()
}

/* CLOCK */

function updateClock(){

const now = new Date()

let h = String(now.getHours()).padStart(2,'0')
let m = String(now.getMinutes()).padStart(2,'0')
let s = String(now.getSeconds()).padStart(2,'0')

document.getElementById("clock").innerText = `${h}:${m}:${s}`
document.getElementById("date").innerText = now.toLocaleDateString()

}

setInterval(updateClock,1000)
updateClock()


/* TODO LIST */

const list = document.getElementById("taskList")

function loadTasks(){

let tasks = JSON.parse(localStorage.getItem("tasks") || "[]")

tasks.forEach(t => createTask(t))

}

function addTask(){

let input = document.getElementById("taskInput")

if(input.value.trim() === "") return

createTask(input.value)
saveTask(input.value)

input.value=""

}

function createTask(text){

let li = document.createElement("li")
li.classList.add("widget__task")
li.textContent=text
li.onclick = () => li.remove()

list.appendChild(li)

}

function saveTask(text){

let tasks = JSON.parse(localStorage.getItem("tasks") || "[]")

tasks.push(text)

localStorage.setItem("tasks", JSON.stringify(tasks))

}

document.getElementById("addTaskBtn").addEventListener("click", addTask)

loadTasks()


/* POMODORO */

let time = 25*60
let interval=null

function updateTimer(){

let m=Math.floor(time/60)
let s=time%60

document.getElementById("timer").innerText =
`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`

}

function startTimer(){

if(interval) return

interval=setInterval(()=>{

time--
updateTimer()

if(time<=0){

clearInterval(interval)
interval=null

alert("Pomodoro terminado")

}

},1000)

}

function resetTimer(){

clearInterval(interval)
interval=null

time=25*60

updateTimer()

}

document.getElementById("startTimerBtn").addEventListener("click", startTimer)
document.getElementById("resetTimerBtn").addEventListener("click", resetTimer)

updateTimer()