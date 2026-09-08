#Requires -RunAsAdministrator
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$SdkDirectory,
    [string]$InstallDir = 'C:\Program Files (x86)\ZKTBridge',
    [switch]$RegisterSdk
)
$ErrorActionPreference = 'Stop'
if ($env:COMPUTERNAME -ieq 'nj-5591-tl') { throw 'Replacement-PC installer: refusing to modify the production host.' }
if (Test-Path -LiteralPath $InstallDir) { throw 'Installation path exists; refusing to overwrite it.' }
$root = Split-Path $PSScriptRoot -Parent
$manifest = Get-Content (Join-Path $root 'docs\PRODUCTION-BRIDGE-MANIFEST.json') -Raw | ConvertFrom-Json
foreach ($artifact in $manifest.files) {
    $path = if ($artifact.kind -eq 'sdk') { Join-Path $SdkDirectory $artifact.name } else { Join-Path $root $artifact.localPath }
    if (!(Test-Path -LiteralPath $path)) { throw "Missing artifact: $($artifact.name)" }
    if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ne $artifact.sha256) {
        throw "Hash mismatch: $($artifact.name)"
    }
}
New-Item -ItemType Directory -Path $InstallDir | Out-Null
& icacls $InstallDir /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Failed to restrict installation/configuration permissions.' }
New-Item -ItemType Directory -Path (Join-Path $InstallDir 'sdk'),(Join-Path $InstallDir 'nssm') | Out-Null
Copy-Item -LiteralPath (Join-Path $root 'runtime\zkt-bridge.exe') -Destination $InstallDir
Copy-Item -LiteralPath (Join-Path $root 'runtime\nssm.exe') -Destination (Join-Path $InstallDir 'nssm')
foreach ($artifact in $manifest.files | Where-Object {$_.kind -eq 'sdk'}) {
    Copy-Item -LiteralPath (Join-Path $SdkDirectory $artifact.name) -Destination (Join-Path $InstallDir 'sdk')
}
Copy-Item -LiteralPath (Join-Path $root '.env.example') -Destination (Join-Path $InstallDir '.env')
if ($RegisterSdk) {
    & "$env:WINDIR\SysWOW64\regsvr32.exe" /s (Join-Path $InstallDir 'sdk\zkemkeeper.dll')
    if ($LASTEXITCODE -ne 0) { throw '32-bit SDK registration failed.' }
}
& (Join-Path $PSScriptRoot 'verify-zkt-com.ps1')
Write-Output 'Files installed. Populate .env locally, then install-service.ps1. No bridge worker has been started.'
