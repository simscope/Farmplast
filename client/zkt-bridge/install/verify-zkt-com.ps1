[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$ps32 = "$env:WINDIR\SysWOW64\WindowsPowerShell\v1.0\powershell.exe"
if (!(Test-Path -LiteralPath $ps32)) { throw '32-bit Windows PowerShell is missing.' }
$script = @'
$ErrorActionPreference = 'Stop'
if ([Environment]::Is64BitProcess) { throw 'Expected a 32-bit process.' }
$zk = New-Object -ComObject zkemkeeper.ZKEM
try { Write-Output 'PASS: 32-bit zkemkeeper.ZKEM object creation' }
finally { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($zk) | Out-Null }
'@
$encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script))
& $ps32 -NoProfile -NonInteractive -EncodedCommand $encoded
if ($LASTEXITCODE -ne 0) { throw '32-bit COM verification failed.' }
