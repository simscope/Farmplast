#Requires -RunAsAdministrator
[CmdletBinding()]
param([string]$InstallDir = 'C:\Program Files (x86)\ZKTBridge')
$ErrorActionPreference = 'Stop'
if ($env:COMPUTERNAME -ieq 'nj-5591-tl') { throw 'Replacement-PC installer: refusing to modify the production host.' }
if (Get-Service ZKTBridge -ErrorAction SilentlyContinue) { throw 'Service already exists; refusing to replace it.' }
foreach ($file in 'zkt-bridge.exe','nssm\nssm.exe','.env') {
    if (!(Test-Path -LiteralPath (Join-Path $InstallDir $file))) { throw "Missing $file" }
}
$nssm = Join-Path $InstallDir 'nssm\nssm.exe'
function Invoke-Nssm([string[]]$Arguments) {
    & $nssm @Arguments
    if ($LASTEXITCODE -ne 0) { throw 'NSSM operation failed. Inspect the partially created service before retrying.' }
}
New-Item -ItemType Directory -Path (Join-Path $InstallDir 'logs') -Force | Out-Null
Invoke-Nssm @('install','ZKTBridge',(Join-Path $InstallDir 'zkt-bridge.exe'))
Invoke-Nssm @('set','ZKTBridge','AppDirectory',$InstallDir)
Invoke-Nssm @('set','ZKTBridge','AppStdout',(Join-Path $InstallDir 'logs\out.log'))
Invoke-Nssm @('set','ZKTBridge','AppStderr',(Join-Path $InstallDir 'logs\error.log'))
Invoke-Nssm @('set','ZKTBridge','AppRotateFiles','0')
Invoke-Nssm @('set','ZKTBridge','AppRotateOnline','0')
Invoke-Nssm @('set','ZKTBridge','AppRotateBytes','0')
Invoke-Nssm @('set','ZKTBridge','Start','SERVICE_AUTO_START')
Write-Output 'Service installed with Automatic startup but NOT started. Read RECOVERY.md cutover steps first.'
