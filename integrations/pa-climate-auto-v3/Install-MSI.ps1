# Farmplast PA Climate -- STAGE FILES ONLY on EXISTING MSI. No new listener,
# service, scheduled task, Docker container, database, Supabase table or port.
param([string]$DataDir = 'E:\SimScopeData\Farmplast\Climate')
$ErrorActionPreference='Stop'
if (-not (Test-Path 'E:\SimScopeData')) { throw 'Existing MSI E:\SimScopeData volume not found. Nothing installed.' }
$node=(Get-Command node -ErrorAction Stop).Source
if ([int]((& $node -p 'process.versions.node').Split('.')[0]) -lt 20) { throw 'Node.js 20+ required.' }
$root=$PSScriptRoot
foreach ($f in @('server\app.mjs','server\storage.mjs','server\admin.mjs','automation\onboard.mjs','firmware\FarmplastClimate\FarmplastClimate.ino')) {
  if(-not (Test-Path (Join-Path $root $f))) {throw "Package incomplete: $f"}
}
$destination=Join-Path $DataDir 'module'
if(Test-Path $destination) {
  $timestamp=Get-Date -Format 'yyyyMMdd-HHmmss'
  $archive=Join-Path $DataDir ('module-backup-'+$timestamp)
  Copy-Item -Path $destination -Destination $archive -Recurse -Force
  Write-Host "Previous MODULE sources backed up: $archive"
}
New-Item -ItemType Directory -Path $destination -Force | Out-Null
foreach($folder in @('server','automation','firmware','integration')) {
  $source=Join-Path $root $folder
  if(Test-Path $source) {Copy-Item -Path $source -Destination $destination -Recurse -Force}
}
$configFile=Join-Path $DataDir 'climate.env'
if(-not (Test-Path $configFile)) {
  New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
  & $node (Join-Path $destination 'server\admin.mjs') init $configFile
  if($LASTEXITCODE -ne 0) {throw 'Could not initialize private module config'}
}
$launcher=@'
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $MyInvocation.MyCommand.Path
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'module\automation\Auto-Add-ESP32.ps1') -Config (Join-Path $root 'climate.env') @args
'@
Set-Content -Path (Join-Path $DataDir 'Add-ESP32.ps1') -Value $launcher -Encoding UTF8
$cmdContent='@echo off'+"`r`n"+'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Add-ESP32.ps1"'+"`r`n"+'pause'+"`r`n"
Set-Content -Path (Join-Path $DataDir 'Add-ESP32.cmd') -Value $cmdContent -Encoding Ascii
Write-Host ''
Write-Host 'READY: module sources staged in the EXISTING MSI data folder.' -ForegroundColor Green
Write-Host 'NO server, scheduled task, container, database, or open port was created.'
Write-Host 'Before onboarding, the existing MSI gateway must mount /climate (read integration\INTEGRATION_MSI_RU.md).'
Write-Host "When integrated: powershell -NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $DataDir 'Add-ESP32.ps1')`""