param(
    [ValidateSet('nsis', 'dir')]
    [string]$Target = 'nsis'
)

$ErrorActionPreference = 'Stop'

function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Test-DeveloperMode {
    $regPath = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock'
    try {
        $value = (Get-ItemProperty -Path $regPath -Name AllowDevelopmentWithoutDevLicense -ErrorAction Stop).AllowDevelopmentWithoutDevLicense
        return $value -eq 1
    } catch {
        return $false
    }
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$iconPath = Join-Path $projectRoot 'build\icon.ico'

Set-Location $projectRoot

$runningPackagedApp = Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $_.ProcessName -like 'Focus Pro' -or $_.Path -like '*ProductivityWidget*Focus Pro-win32-x64*'
}

if ($runningPackagedApp) {
    $runningPackagedApp | Stop-Process -Force
}

if (-not (Test-IsAdministrator) -and -not (Test-DeveloperMode)) {
    throw "build:installer requiere una de estas condiciones en Windows: ejecutar PowerShell como administrador o activar Modo Desarrollador. Sin eso, electron-builder falla al extraer winCodeSign por permisos de symlink."
}

$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'

$builderArgs = @('--win', $Target, '-c.directories.buildResources=build')

if (Test-Path $iconPath) {
    $builderArgs += "-c.win.icon=$iconPath"
    Write-Host "Usando icono: $iconPath"
} else {
    Write-Host 'No se encontro build\icon.ico. Se generara con el icono por defecto de Electron.'
}

& npx electron-builder @builderArgs
