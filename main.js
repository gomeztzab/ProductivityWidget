const { app, BrowserWindow, ipcMain } = require('electron')
const Store = require('electron-store')

const store = new Store()

let win
let settingsWindow

function createWindow(){

const bounds = store.get('windowBounds') || { x:100, y:100, width:350, height:500 }

win = new BrowserWindow({

x: bounds.x,
y: bounds.y,
width: bounds.width,
height: bounds.height,

frame:false,
transparent:true,
alwaysOnTop:true,
resizable:false,

webPreferences:{
nodeIntegration:true,
contextIsolation:false
}

})

win.loadFile('index.html')

win.on('move', () => {

if(win){
store.set('windowBounds', win.getBounds())
}

})

}

function openSettings(){

if(settingsWindow) return

settingsWindow = new BrowserWindow({

width:300,
height:400,
resizable:false,

webPreferences:{
nodeIntegration:true,
contextIsolation:false
}

})

settingsWindow.loadFile("settings.html")

settingsWindow.on('closed', () => {
settingsWindow = null
})

}

ipcMain.on('open-settings', openSettings)

ipcMain.on('close-settings', () => {

if(settingsWindow){
settingsWindow.close()
}

})

ipcMain.on('close-app', () => {
app.quit()
})

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
if(process.platform !== 'darwin') app.quit()
})