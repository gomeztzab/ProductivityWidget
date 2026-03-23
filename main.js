const { app, BrowserWindow, ipcMain } = require('electron')
const Store = require('electron-store')
const { spawn } = require('child_process')
const os   = require('os')
const path = require('path')
const fs   = require('fs')

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

win.webContents.once('did-finish-load', () => { spawnPS() })

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

/* =====================
   MEDIA BRIDGE — proceso PowerShell persistente
   Add-Type + RequestAsync solo al arrancar (1 vez).
   Cada poll/control = stdin → stdout, sin fork.
   ===================== */
const PS_BRIDGE = [
    '$ErrorActionPreference="SilentlyContinue"',
    'Add-Type -AssemblyName System.Runtime.WindowsRuntime',
    "$_atg=([System.WindowsRuntimeSystemExtensions].GetMethods()|Where-Object{$_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'})[0]",
    'function __Await($t,$rt){try{$m=$_atg.MakeGenericMethod($rt);$n=$m.Invoke($null,@($t));$n.Wait(-1)|Out-Null;return $n.Result}catch{return $null}}',
    '[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media,ContentType=WindowsRuntime]|Out-Null',
    '[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties,Windows.Media,ContentType=WindowsRuntime]|Out-Null',
    'try{$_mgr=__Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])}catch{$_mgr=$null}',
    'Write-Output "INIT_OK"',
    '[Console]::Out.Flush()',
    'while($true){',
    '  $cmd=[Console]::ReadLine()',
    '  if($null -eq $cmd){break}',
    '  $cmd=$cmd.Trim()',
    '  try{',
    '    $s=$_mgr.GetCurrentSession()',
    '    switch($cmd){',
    '      "status"{',
    '        if($s){',
    '          $p=__Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])',
    '          $t=$s.GetTimelineProperties()',
    '          $pb=$s.GetPlaybackInfo()',
    '          Write-Output ([PSCustomObject]@{title=$p.Title;artist=$p.Artist;position=[math]::Round($t.Position.TotalSeconds,1);duration=[math]::Round($t.EndTime.TotalSeconds,1);status=$pb.PlaybackStatus.ToString()}|ConvertTo-Json -Compress)',
    '        }else{Write-Output "{}"}',
    '      }',
    '      "toggle"{if($s){$s.TryTogglePlayPauseAsync()|Out-Null};Write-Output "{}"}',
    '      "next"{if($s){$s.TrySkipNextAsync()|Out-Null};Write-Output "{}"}',
    '      "prev"{if($s){$s.TrySkipPreviousAsync()|Out-Null};Write-Output "{}"}',
    '      default{Write-Output "{}"}',
    '    }',
    '  }catch{Write-Output "{}"}',
    '  Write-Output "###END###"',
    '  [Console]::Out.Flush()',
    '}'
].join('\n')

const scriptPath = path.join(os.tmpdir(), 'pw-media-bridge.ps1')
let psProc      = null
let psBuffer    = ''
const psCbs     = []
let pollPending = false
let psReady     = false

function spawnPS() {
    psReady = false
    fs.writeFileSync(scriptPath, PS_BRIDGE, 'utf8')
    psProc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', scriptPath], {
        stdio: ['pipe', 'pipe', 'ignore']
    })
    psProc.stdout.on('data', chunk => {
        psBuffer += chunk.toString()
        if (!psReady) {
            const initIdx = psBuffer.indexOf('INIT_OK')
            if (initIdx === -1) return
            psReady = true
            psBuffer = psBuffer.slice(initIdx + 7).replace(/^\r?\n/, '')
            startMediaPolling()
        }
        let idx
        while ((idx = psBuffer.indexOf('###END###')) !== -1) {
            const response = psBuffer.slice(0, idx).trim()
            psBuffer = psBuffer.slice(idx + 9).replace(/^\r?\n/, '')
            const cb = psCbs.shift()
            if (cb) cb(response)
        }
    })
    psProc.on('close', () => {
        psProc  = null
        psReady = false
        psBuffer = ''
        pollPending = false
        while (psCbs.length) { const cb = psCbs.shift(); if (cb) cb('{}') }
        setTimeout(spawnPS, 5000)
    })
}

function psCmd(command, cb) {
    if (!psProc || !psReady) { if (cb) cb('{}'); return }
    psCbs.push(cb || (() => {}))
    psProc.stdin.write(command + '\n')
}

let mediaPollInterval = null

function startMediaPolling() {
    if (mediaPollInterval) return
    mediaPollInterval = setInterval(() => {
        if (!win || win.isDestroyed() || pollPending) return
        pollPending = true
        psCmd('status', response => {
            pollPending = false
            try {
                const data = JSON.parse(response)
                if (win && !win.isDestroyed()) win.webContents.send('media-info', data)
            } catch(_) {}
        })
    }, 2000)
}

ipcMain.on('media-control', (event, action) => {
    psCmd(action, () => {})
})

app.on('before-quit', () => {
    if (mediaPollInterval) { clearInterval(mediaPollInterval); mediaPollInterval = null }
    try { if (psProc) { psProc.kill(); psProc = null } } catch(_) {}
    try { fs.unlinkSync(scriptPath) } catch(_) {}
})

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
if(process.platform !== 'darwin') app.quit()
})