$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$distPath = Join-Path $projectRoot 'dist'
$iconPath = Join-Path $projectRoot 'build\icon.ico'
$ignorePattern = '(^|[\\/])node_modules[\\/]\.cache([\\/]|$)|(^|[\\/])\.git([\\/]|$)|(^|[\\/])\.github([\\/]|$)|(^|[\\/])\.vscode([\\/]|$)|(^|[\\/])supabase([\\/]|$)|(^|[\\/])agents\.md$|(^|[\\/])FOCUS_PRO_CONTEXT\.md$|(^|[\\/])SUPABASE.*\.md$|(^|[\\/])\.gitignore$'

Set-Location $projectRoot

if (Test-Path $distPath) {
    Remove-Item $distPath -Recurse -Force
}

$packagerArgs = @(
    '.',
    'Focus Pro',
    '--platform=win32',
    '--arch=x64',
    '--out=dist',
    '--overwrite',
    "--ignore=$ignorePattern"
)

if (Test-Path $iconPath) {
    $packagerArgs += "--icon=$iconPath"
    Write-Host "Usando icono: $iconPath"
} else {
    Write-Host 'No se encontro build\icon.ico. Se generara con el icono por defecto de Electron.'
}

& npx @electron/packager @packagerArgs
