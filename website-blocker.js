const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')

const HOSTS_PATH = 'C:\\Windows\\System32\\drivers\\etc\\hosts'
const BEGIN_MARKER = '# >>> ProductivityWidget Strict Mode >>>'
const END_MARKER = '# <<< ProductivityWidget Strict Mode <<<'

function normalizeWebsiteDomains(input = []) {
    const rawValues = Array.isArray(input) ? input : [input]
    const values = rawValues
        .flatMap(value => String(value || '').split(/[\n,;]/))
        .map(value => value.trim().toLowerCase())
        .filter(Boolean)

    const domains = new Set()

    values.forEach(value => {
        let normalized = value
            .replace(/^https?:\/\//, '')
            .replace(/^www\./, '')
            .replace(/[/?#].*$/, '')
            .replace(/^\.+|\.+$/g, '')

        if (!normalized || normalized.includes(' ')) return
        if (!/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(normalized)) return

        domains.add(normalized)
    })

    return Array.from(domains)
}

function createWebsiteBlockerScript() {
    return [
        'param([string]$PayloadPath)',
        '',
        "$ErrorActionPreference = 'Stop'",
        '',
        '$payload = Get-Content -LiteralPath $PayloadPath -Raw | ConvertFrom-Json',
        '$selfPath = $MyInvocation.MyCommand.Path',
        '',
        '# Result file path for communicating results from elevated process',
        '$resultFilePath = $null',
        'if ($payload.resultPath) { $resultFilePath = [string]$payload.resultPath }',
        '',
        'function Write-JsonOut($data, [int]$ExitCode = 0) {',
        '    $json = $data | ConvertTo-Json -Compress',
        '    if ($resultFilePath) {',
        '        try { [System.IO.File]::WriteAllText($resultFilePath, $json, [System.Text.Encoding]::UTF8) } catch {}',
        '    }',
        '    $json',
        '    exit $ExitCode',
        '}',
        '',
        'function Remove-ManagedBlock([string]$Content) {',
        "    if ([string]::IsNullOrEmpty($Content)) { return '' }",
        `    $pattern = '(?ms)\\r?\\n?# >>> ProductivityWidget Strict Mode >>>.*?# <<< ProductivityWidget Strict Mode <<<\\r?\\n?'`,
        '    return ([regex]::Replace($Content, $pattern, "`r`n")).TrimEnd("`r", "`n")',
        '}',
        '',
        'function Flush-DnsSafe {',
        '    try {',
        '        & "$env:SystemRoot\\System32\\ipconfig.exe" /flushdns | Out-Null',
        '    } catch {}',
        '}',
        '',
        '# Registry paths for browser DoH policies',
        "$dohPolicies = @(",
        "    @{ Path = 'HKLM:\\SOFTWARE\\Policies\\Google\\Chrome';       Name = 'DnsOverHttpsMode' },",
        "    @{ Path = 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Edge';      Name = 'DnsOverHttpsMode' },",
        "    @{ Path = 'HKLM:\\SOFTWARE\\Policies\\BraveSoftware\\Brave'; Name = 'DnsOverHttpsMode' }",
        ')',
        '',
        'function Disable-BrowserDoh {',
        '    foreach ($pol in $dohPolicies) {',
        '        try {',
        '            if (-not (Test-Path $pol.Path)) {',
        '                New-Item -Path $pol.Path -Force | Out-Null',
        '            }',
        "            Set-ItemProperty -Path $pol.Path -Name $pol.Name -Value 'off' -Type String -Force",
        '        } catch {}',
        '    }',
        '}',
        '',
        'function Restore-BrowserDoh {',
        '    foreach ($pol in $dohPolicies) {',
        '        try {',
        '            if (Test-Path $pol.Path) {',
        '                Remove-ItemProperty -Path $pol.Path -Name $pol.Name -ErrorAction SilentlyContinue',
        '                $remaining = Get-ItemProperty -Path $pol.Path -ErrorAction SilentlyContinue',
        '                if (-not ($remaining.PSObject.Properties | Where-Object { $_.Name -notmatch "^PS" })) {',
        '                    Remove-Item -Path $pol.Path -Force -ErrorAction SilentlyContinue',
        '                }',
        '            }',
        '        } catch {}',
        '    }',
        '}',
        '',
        '$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(',
        '    [Security.Principal.WindowsBuiltInRole]::Administrator',
        ')',
        '',
        'if (-not $isAdmin) {',
        '    try {',
        '        $arguments = @(',
        "            '-NoProfile',",
        "            '-ExecutionPolicy', 'Bypass',",
        `            '-File', ('"' + $selfPath + '"'),`,
        `            '-PayloadPath', ('"' + $PayloadPath + '"')`,
        '        )',
        '        Start-Process powershell.exe -Verb RunAs -ArgumentList $arguments -WindowStyle Hidden -Wait',
        '',
        '        # Read result written by elevated process via result file',
        '        if ($resultFilePath -and (Test-Path -LiteralPath $resultFilePath)) {',
        '            $elevatedJson = Get-Content -LiteralPath $resultFilePath -Raw',
        '            $elevatedJson',
        '            exit 0',
        '        }',
        '',
        '        # If no result file, assume success (elevated process completed without error)',
        "        Write-JsonOut @{ ok = $true; elevated = $true }",
        '    } catch {',
        "        Write-JsonOut @{ ok = $false; error = 'La elevacion a administrador fue cancelada o fallo.'; code = 1223 } 1223",
        '    }',
        '}',
        '',
        '# --- Elevated execution begins here ---',
        '$hostsPath = [string]$payload.hostsPath',
        '$backupPath = [string]$payload.backupPath',
        '$mode = [string]$payload.mode',
        '$domains = @()',
        'if ($payload.domains) { $domains = @($payload.domains) }',
        '',
        'try {',
        '    switch ($mode) {',
        "        'apply' {",
        '            if (-not $domains -or $domains.Count -eq 0) {',
        "                Write-JsonOut @{ ok = $false; error = 'No hay dominios validos para bloquear.'; code = 10 } 10",
        '            }',
        '',
        '            $currentContent = Get-Content -LiteralPath $hostsPath -Raw',
        '            if (-not (Test-Path -LiteralPath $backupPath)) {',
        '                [System.IO.File]::WriteAllText($backupPath, $currentContent, [System.Text.Encoding]::ASCII)',
        '            }',
        '',
        '            $baseContent = if (Test-Path -LiteralPath $backupPath) {',
        '                Get-Content -LiteralPath $backupPath -Raw',
        '            } else {',
        '                $currentContent',
        '            }',
        '',
        '            $cleanBase = Remove-ManagedBlock $baseContent',
        "            $entries = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)",
        '',
        '            foreach ($domain in $domains) {',
        '                $normalized = [string]$domain',
        '                if ([string]::IsNullOrWhiteSpace($normalized)) { continue }',
        '',
        '                $entries.Add("0.0.0.0`t$normalized") | Out-Null',
        '                $entries.Add("::1`t$normalized") | Out-Null',
        '',
        "                if (-not $normalized.StartsWith('www.')) {",
        '                    $entries.Add("0.0.0.0`twww.$normalized") | Out-Null',
        '                    $entries.Add("::1`twww.$normalized") | Out-Null',
        '                }',
        '            }',
        '',
        '            $lines = @($cleanBase.TrimEnd("`r", "`n"))',
        '            $sortedEntries = @($entries) | Sort-Object',
        `            $managedBlock = @('${BEGIN_MARKER}', '# Managed temporary website block entries') + $sortedEntries + @('${END_MARKER}')`,
        '',
        '            $finalContent = ($lines + $managedBlock) -join "`r`n"',
        '            $finalContent = $finalContent.TrimStart("`r", "`n") + "`r`n"',
        '',
        '            [System.IO.File]::WriteAllText($hostsPath, $finalContent, [System.Text.Encoding]::ASCII)',
        '            Disable-BrowserDoh',
        '            Flush-DnsSafe',
        '            Write-JsonOut @{ ok = $true; domainsCount = $domains.Count; hostsPath = $hostsPath }',
        '        }',
        '',
        "        'restore' {",
        '            if (Test-Path -LiteralPath $backupPath) {',
        '                $backupContent = Get-Content -LiteralPath $backupPath -Raw',
        '                [System.IO.File]::WriteAllText($hostsPath, $backupContent, [System.Text.Encoding]::ASCII)',
        '                Remove-Item -LiteralPath $backupPath -Force',
        '            } elseif (Test-Path -LiteralPath $hostsPath) {',
        '                $currentContent = Get-Content -LiteralPath $hostsPath -Raw',
        '                $cleanContent = Remove-ManagedBlock $currentContent',
        '                [System.IO.File]::WriteAllText($hostsPath, ($cleanContent + "`r`n").TrimStart("`r", "`n"), [System.Text.Encoding]::ASCII)',
        '            }',
        '',
        '            Restore-BrowserDoh',
        '            Flush-DnsSafe',
        '            Write-JsonOut @{ ok = $true; restored = $true }',
        '        }',
        '',
        '        default {',
        "            Write-JsonOut @{ ok = $false; error = 'Modo de operacion no soportado.'; code = 11 } 11",
        '        }',
        '    }',
        '} catch {',
        '    Write-JsonOut @{ ok = $false; error = $_.Exception.Message; code = 99 } 99',
        '}'
    ].join('\n')
}

function runWebsiteBlocker(mode, backupPath, domains = []) {
    return new Promise((resolve, reject) => {
        const timestamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`
        const payloadPath = path.join(os.tmpdir(), `pw-hosts-payload-${timestamp}.json`)
        const scriptPath = path.join(os.tmpdir(), `pw-hosts-script-${timestamp}.ps1`)
        const resultPath = path.join(os.tmpdir(), `pw-hosts-result-${timestamp}.json`)

        const payload = {
            mode,
            hostsPath: HOSTS_PATH,
            backupPath,
            resultPath,
            domains: normalizeWebsiteDomains(domains)
        }

        fs.writeFileSync(payloadPath, JSON.stringify(payload), 'utf8')
        fs.writeFileSync(scriptPath, createWebsiteBlockerScript(), 'utf8')

        const cleanup = () => {
            try { fs.unlinkSync(payloadPath) } catch (_) {}
            try { fs.unlinkSync(scriptPath) } catch (_) {}
            try { fs.unlinkSync(resultPath) } catch (_) {}
        }

        const child = spawn('powershell.exe', [
            '-NoProfile',
            '-ExecutionPolicy', 'Bypass',
            '-File', scriptPath,
            '-PayloadPath', payloadPath
        ], {
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe']
        })

        let stdout = ''
        let stderr = ''

        child.stdout.on('data', chunk => {
            stdout += chunk.toString()
        })

        child.stderr.on('data', chunk => {
            stderr += chunk.toString()
        })

        child.on('error', error => {
            cleanup()
            reject(error)
        })

        child.on('close', code => {
            // Prefer the result file (written by elevated process) over stdout
            let result = null
            try {
                if (fs.existsSync(resultPath)) {
                    result = JSON.parse(fs.readFileSync(resultPath, 'utf8'))
                }
            } catch (_) {}

            // Fallback: parse stdout from non-elevated wrapper
            if (!result) {
                const output = stdout.trim().split(/\r?\n/).filter(Boolean)
                const lastLine = output[output.length - 1] || '{}'
                try { result = JSON.parse(lastLine) } catch (_) {}
            }

            cleanup()

            if (result && result.ok) {
                resolve(result)
                return
            }

            const errorMsg = (result && result.error) || stderr || 'No se pudo modificar el archivo hosts.'
            const error = new Error(errorMsg)
            error.code = (result && result.code) || code
            reject(error)
        })
    })
}

function applyWebsiteBlock(domains, backupPath) {
    return runWebsiteBlocker('apply', backupPath, domains)
}

function restoreWebsiteBlock(backupPath) {
    return runWebsiteBlocker('restore', backupPath, [])
}

module.exports = {
    HOSTS_PATH,
    applyWebsiteBlock,
    normalizeWebsiteDomains,
    restoreWebsiteBlock
}