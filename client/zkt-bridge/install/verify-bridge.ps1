[CmdletBinding()]
param([string]$InstallDir = 'C:\Program Files (x86)\ZKTBridge')
$ErrorActionPreference = 'Stop'
$service = Get-CimInstance Win32_Service -Filter "Name='ZKTBridge'"
if (!$service) { throw 'ZKTBridge service is missing.' }
$service | Select-Object Name,State,StartMode,ProcessId | Format-List
$processes = @(Get-CimInstance Win32_Process | Where-Object {
    $_.ExecutablePath -eq (Join-Path $InstallDir 'zkt-bridge.exe')
})
$processes | Select-Object ProcessId,ParentProcessId,ExecutablePath,CreationDate | Format-List
if ($service.State -ne 'Running' -or $processes.Count -ne 1) {
    throw 'Expected one running ZKT bridge executable and a running service.'
}
Write-Output 'Node is embedded in zkt-bridge.exe; no standalone node.exe is expected.'
& (Join-Path $PSScriptRoot 'verify-zkt-com.ps1')
& (Join-Path $PSScriptRoot 'verify-network.ps1') -InstallDir $InstallDir
Write-Output 'HTTP /health was disabled on captured production. No endpoint is assumed.'
Write-Output 'PASS: local service, worker, COM and TCP checks. Confirm DB/UI operations separately.'
