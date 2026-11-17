[CmdletBinding()]
param(
  [string]$PackageRoot = $PSScriptRoot,
  [ValidatePattern('^COM[1-9][0-9]*$')][string]$Port,
  [switch]$Inspect,
  [switch]$Install,
  [switch]$BoardConfirmed,
  [switch]$SourceConfirmed
)
$ErrorActionPreference = 'Stop'
$manifestPath = Join-Path $PackageRoot 'manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.version -ne 'barrels-msi-1' -or $manifest.chip -ne 'esp32s3' -or $manifest.flash_bytes -ne 8388608) { throw 'Unexpected package target' }
foreach ($file in $manifest.files) {
  if ($file.name -notmatch '^[a-zA-Z0-9_.-]+$') { throw 'Invalid package filename' }
  $actual = Get-FileHash -LiteralPath (Join-Path $PackageRoot $file.name) -Algorithm SHA256
  if ($actual.Hash.ToLowerInvariant() -ne $file.sha256) { throw "Package hash mismatch: $($file.name)" }
}
$tool = Join-Path $PackageRoot 'esptool.exe'
function Invoke-Esp([string[]]$ToolArgs) {
  & $tool @ToolArgs
  if ($LASTEXITCODE -ne 0) { throw "esptool stopped with exit code $LASTEXITCODE" }
}
Write-Host 'Package hashes verified. Waveshare ESP32-S3-Touch-LCD-7 / 8MB / OPI PSRAM.'
if (-not $Inspect -and -not $Install) {
  Write-Host 'Offline validation only. No serial port opened. Use -Port COMx -Inspect to identify hardware.'
  return
}
if (-not $Port) { throw 'Select an explicit COM port. Automatic port selection is disabled.' }
if ($Install -and (-not $BoardConfirmed -or -not $SourceConfirmed)) { throw 'Confirm the physical board and sensor/source mapping before installation.' }
$connection = @('--chip','esp32s3','--port',$Port,'--baud','115200')
$identity = & $tool @connection 'flash-id' 2>&1
$identityExit = $LASTEXITCODE
$identity | Write-Host
if ($identityExit -ne 0 -or ($identity -join "`n") -notmatch 'Detected flash size:\s*8MB') { throw 'ESP32-S3 with 8MB flash was not confirmed. Stop for board review.' }
if (-not $Install) { Write-Host 'Inspection complete. No flash write performed.'; return }

# Backup files contain credentials. Restrict the new directory before reading flash.
$backupRoot = Join-Path $PackageRoot ('recovery-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$null = New-Item -ItemType Directory -Path $backupRoot
$acl = New-Object System.Security.AccessControl.DirectorySecurity
$acl.SetAccessRuleProtection($true, $false)
$ownerSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$systemSid = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-18')
foreach ($sid in @($ownerSid,$systemSid)) {
  $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
  $acl.AddAccessRule($rule)
}
Set-Acl -LiteralPath $backupRoot -AclObject $acl
$backup = Join-Path $backupRoot 'original-flash.bin'
Invoke-Esp ($connection + @('read-flash','0','8388608',$backup))
if ((Get-Item -LiteralPath $backup).Length -ne 8388608) { throw 'Incomplete recovery backup' }
$expected = [System.IO.File]::ReadAllBytes((Join-Path $PackageRoot 'partitions.bin'))
$oldFlash = [System.IO.File]::ReadAllBytes($backup)
for ($i = 0; $i -lt $expected.Length; $i++) {
  if ($expected[$i] -ne $oldFlash[0x8000 + $i]) { throw 'Installed partition table differs. Backup saved; no write performed. Review and rebuild for the installed layout.' }
}
$backupHash = (Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash.ToLowerInvariant()
@{ port=$Port; flash_bytes=8388608; sha256=$backupHash; version=$manifest.version; created_at=(Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $backupRoot 'recovery.json') -Encoding UTF8

# Existing bootloader, partition table, NVS, calibration and filesystem are preserved.
# The checked table has ota_data at 0xe000 (8KiB), app0 at 0x10000.
Invoke-Esp ($connection + @('write-flash','--flash-mode','keep','--flash-freq','keep','--flash-size','keep','0xe000',(Join-Path $PackageRoot 'boot_app0.bin'),'0x10000',(Join-Path $PackageRoot 'application.bin')))
Invoke-Esp ($connection + @('verify-flash','0xe000',(Join-Path $PackageRoot 'boot_app0.bin'),'0x10000',(Join-Path $PackageRoot 'application.bin')))
Write-Host "Written and verified. Recovery backup: $backupRoot"
Write-Host 'Now verify both sensors, zero/partial readings and direct MSI reception. Website barrel source must be switched separately after this check.'
