# Run on the existing MSI host after staging the reviewed source files.
[CmdletBinding()]
param([string]$Root='E:\SimScopeData\Farmplast\NJTelemetry')
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
if($Root -ne 'E:\SimScopeData\Farmplast\NJTelemetry'){throw 'Unexpected MSI installation root'}
$release=Join-Path $Root 'release-standalone-20261116'
$private=Join-Path $Root 'private';$stage=Join-Path $private 'pa-direct-stage'
$server=Join-Path $release 'server.mjs';$configFile=Join-Path $private 'config.json'
$oldHash=(Get-FileHash -LiteralPath $server -Algorithm SHA256).Hash
if($oldHash -ne 'EC309C3800531C1A1AED4D5FC1AA56586303ACE27A8441028A31172445F96EAB' -and
   (Get-FileHash -LiteralPath (Join-Path $stage 'server.mjs') -Algorithm SHA256).Hash -ne $oldHash){throw 'Live gateway changed; review before replacing it'}
$runtime=@{}
Get-Content -LiteralPath 'E:\SimScopeData\Supabase\deployment\volumes\functions\main\climate\runtime.env'|ForEach-Object{if($_ -match '^([A-Z0-9_]+)=(.*)$'){$runtime[$matches[1]]=$matches[2]}}
$secret=$runtime['PA_CLIMATE_TRANSPORT_KEY'];$allowed=@($runtime['FARMPLAST_ALLOWED_USER_IDS'].Split(',')|ForEach-Object{$_.Trim()}|Where-Object{$_})
if($secret -notmatch '^[a-f0-9]{64}$' -or !$allowed.Count){throw 'Existing private climate identity is incomplete'}
$cfg=Get-Content -LiteralPath $configFile -Raw|ConvertFrom-Json
$auth=@{Authorization='Bearer '+$cfg.control.apiKey;'X-Operator-ID'=$allowed[0]}
$seed=Get-Content -LiteralPath $cfg.control.seedPath -Raw|ConvertFrom-Json
foreach($target in @(@{name='ch1_firmware_status';args=@{}},@{name='chiller_firmware_status';args=@{p_device='ESP32-CH2-PLC'}},@{name='chiller_firmware_status';args=@{p_device='ESP32-CH3-PLC'}})){
  $auth['X-Operator-ID']=if($target.name -eq 'ch1_firmware_status'){$seed.'ch1_private.operators'[0].id}else{$seed.'ch23_ota_private.operators'[0].id}
  $status=Invoke-RestMethod -Uri http://127.0.0.1:18220/v1/control/rpc -Method POST -Headers $auth -ContentType application/json -Body ($target|ConvertTo-Json -Depth 5) -TimeoutSec 10
  if(@($status.jobs|Where-Object {$_.status -in @('queued','delivered','downloading','flashing','rebooting','verifying')}).Count){throw 'Active NJ firmware job; defer gateway restart'}
}
$backup=Join-Path $private ('pa-direct-backup-'+[datetime]::UtcNow.ToString('yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backup|Out-Null
Copy-Item -LiteralPath $server -Destination (Join-Path $backup 'server.mjs')
Copy-Item -LiteralPath $configFile -Destination (Join-Path $backup 'config.json')
$stateDir='E:\SimScopeData\Farmplast\ClimateGateway'
New-Item -ItemType Directory -Path $stateDir -Force|Out-Null
& icacls.exe $stateDir '/inheritance:r' '/grant:r' '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-19:(OI)(CI)M'|Out-Null
if($LASTEXITCODE -ne 0){throw 'Could not protect MSI-only climate/PIN state'}
$wire=Join-Path $Root 'client\server'
New-Item -ItemType Directory -Path $wire -Force|Out-Null
Copy-Item -LiteralPath (Join-Path $stage 'climateWire.mjs') -Destination (Join-Path $wire 'climateWire.mjs') -Force
foreach($file in @('climateGateway.mjs','climateLegacy.mjs')){Copy-Item -LiteralPath (Join-Path $stage $file) -Destination (Join-Path $release $file) -Force}
$cfg|Add-Member -Force NoteProperty climateProxy @{target='http://127.0.0.1:18000';secret=$secret;allowedUserIds=$allowed;legacyFile=(Join-Path $stateDir 'legacy-zone1.json')}
try{
  Stop-ScheduledTask -TaskName Farmplast-NJ-Telemetry
  for($i=0;$i -lt 30 -and (Get-NetTCPConnection -State Listen -LocalPort 18220 -ErrorAction SilentlyContinue);$i++){Start-Sleep -Milliseconds 200}
  [IO.File]::WriteAllText($configFile,($cfg|ConvertTo-Json -Depth 20),[Text.UTF8Encoding]::new($false))
  Copy-Item -LiteralPath (Join-Path $stage 'server.mjs') -Destination $server -Force
  Start-ScheduledTask -TaskName Farmplast-NJ-Telemetry
  $healthy=$false
  for($i=0;$i -lt 60;$i++){
    try{$health=Invoke-RestMethod http://127.0.0.1:18220/healthz -TimeoutSec 1;if($health.ok){$healthy=$true;break}}catch{}
    Start-Sleep -Milliseconds 500
  }
  if(!$healthy){throw 'Updated gateway did not become healthy'}
  [pscustomobject]@{Installed=$true;Task=(Get-ScheduledTask -TaskName Farmplast-NJ-Telemetry).State.ToString();Backup=$backup;Transport='signed HTTPS';RealtimeStillAvailableForCutover=$true}|ConvertTo-Json -Compress
}catch{
  Stop-ScheduledTask -TaskName Farmplast-NJ-Telemetry -ErrorAction SilentlyContinue
  Copy-Item -LiteralPath (Join-Path $backup 'server.mjs') -Destination $server -Force
  Copy-Item -LiteralPath (Join-Path $backup 'config.json') -Destination $configFile -Force
  Start-ScheduledTask -TaskName Farmplast-NJ-Telemetry
  throw
}
