param([ValidateSet('Probe','StopCloud','ActivateMsi','RollbackCloud')][string]$Action='Probe',[string]$Execute,[switch]$MsiWritesStopped)
$ErrorActionPreference='Stop'
$root='C:\ProgramData\Farmplast\PayrollMsiReserve'
$manifest=Get-Content -LiteralPath (Join-Path $root 'prepared.json') -Raw|ConvertFrom-Json
if($env:COMPUTERNAME -ne 'NJ-5591-TL' -or $manifest.host -ne $env:COMPUTERNAME){throw 'Unexpected NJ host'}
function Get-MsiHealth {
 $key=(Get-Content -LiteralPath (Join-Path $root 'bulk-msi.env')|Where-Object{$_ -match '^SUPABASE_SERVICE_ROLE_KEY='}|Select-Object -First 1) -replace '^SUPABASE_SERVICE_ROLE_KEY=',''
 if(!$key){throw 'Prepared key missing'}
 Invoke-RestMethod 'https://msi.tail4626fb.ts.net:9444/api/reserve/bridge-health' -Headers @{Authorization='Bearer '+$key} -TimeoutSec 20
}
foreach($item in $manifest.services){
 if((Get-FileHash -LiteralPath $item.application -Algorithm SHA256).Hash -ne $item.binaryHash){throw 'Bridge binary changed: prepare again before switching'}
}
if($Action -eq 'Probe'){
 $health=Get-MsiHealth
 $cloudUnchanged=@($manifest.services|Where-Object{(Get-FileHash -LiteralPath $_.config -Algorithm SHA256).Hash -ne $_.configHash}).Count -eq 0
 [pscustomobject]@{host=$env:COMPUTERNAME;mode=$health.mode;ready=$health.ready;commandsEnabled=$health.commandsEnabled;cloudConfigsUnchanged=$cloudUnchanged;services=@($manifest.services|ForEach-Object{@{name=$_.service;state=(Get-Service $_.service).Status.ToString()}})}|ConvertTo-Json -Depth 4 -Compress
 exit
}
if($Execute -ne 'PAYROLL-MSI-CUTOVER'){throw 'Explicit operator cutover acknowledgement required'}
if($Action -eq 'StopCloud'){
 foreach($item in $manifest.services){if((Get-FileHash -LiteralPath $item.config -Algorithm SHA256).Hash -ne $item.configHash){throw 'Live config changed; refresh preparation'}}
 foreach($item in $manifest.services){Stop-Service -Name $item.service; (Get-Service $item.service).WaitForStatus('Stopped',[TimeSpan]::FromSeconds(60))}
 Write-Output 'NJ_CLOUD_WORKERS_STOPPED';exit
}
if(@($manifest.services|Where-Object{(Get-Service $_.service).Status -ne 'Stopped'}).Count){throw 'Stop both workers before replacing any config'}
if($Action -eq 'ActivateMsi'){
 $health=Get-MsiHealth
 if(!$health.ready -or $health.mode -ne 'active' -or !$health.commandsEnabled){throw 'MSI is not active; no worker started'}
 foreach($item in $manifest.services){if((Get-FileHash -LiteralPath $item.config -Algorithm SHA256).Hash -ne $item.configHash){throw 'Cloud config changed; refuse overwrite'}}
 foreach($item in $manifest.services){Copy-Item -LiteralPath (Join-Path $root ($item.name+'-msi.env')) -Destination $item.config}
}else{
 if(!$MsiWritesStopped){throw 'Rollback requires verified MSI write fence and no MSI workers'}
 foreach($item in $manifest.services){Copy-Item -LiteralPath (Join-Path $root ($item.name+'-cloud.env')) -Destination $item.config}
}
foreach($item in $manifest.services){Start-Service -Name $item.service;(Get-Service $item.service).WaitForStatus('Running',[TimeSpan]::FromSeconds(60))}
Write-Output ('NJ_WORKERS_STARTED_'+$Action)
