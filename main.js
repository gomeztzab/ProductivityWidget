const { app, BrowserWindow, ipcMain } = require('electron')
const Store = require('electron-store')

const store = new Store()

let win
let settingsWindow

function createWindow(){

const position = store.get('windowPosition') || { x:100, y:100 }

win = new BrowserWindow({

x: position.x,
y: position.y,
width: 960,
height: 740,

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
const { x, y } = win.getBounds()
store.set('windowPosition', { x, y })
}

})

}

function openSettings(){

if(settingsWindow) return

settingsWindow = new BrowserWindow({

width: 960,
height: 740,
resizable: false,
frame: false,
transparent: true,
alwaysOnTop: true,

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

ipcMain.on('save-settings', (event, data) => {

if(win) win.webContents.send('apply-colors', data)
if(settingsWindow) settingsWindow.close()

})

ipcMain.on('close-app', () => {
app.quit()
})

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
if(process.platform !== 'darwin') app.quit()
})