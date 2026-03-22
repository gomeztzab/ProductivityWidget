const { ipcRenderer } = require('electron')

document.getElementById("closeSettingsBtn").addEventListener("click", closeSettings)
document.getElementById("closeAppBtn").addEventListener("click", closeApp)

function closeSettings(){
ipcRenderer.send("close-settings")
}

function closeApp(){
ipcRenderer.send("close-app")
}

/* guardar color */

document.getElementById("widgetColor").addEventListener("input",(e)=>{

localStorage.setItem("widgetColor", e.target.value)

})

/* guardar pomodoro */

document.getElementById("pomodoroTime").addEventListener("change",(e)=>{

localStorage.setItem("pomodoroTime", e.target.value)

})