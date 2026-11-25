# Final cutover: call only after the production site uses signed MSI HTTPS.
[CmdletBinding()]
param()
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$health=Invoke-WebRequest -UseBasicParsing https://farmplast.vercel.app/climate/healthz -TimeoutSec 20
if($health.StatusCode -ne 200 -or $health.Headers['X-Farmplast-Climate-Transport'] -ne 'msi-https'){throw 'Production is not using direct MSI HTTPS; leave the old transport running'}
$main='E:\SimScopeData\Supabase\deployment\volumes\functions\main\index.ts'
$state=Get-Content -LiteralPath E:\SimScopeData\Supabase\deployment\volumes\functions\main\climate\data\climate-state.json -Raw|ConvertFrom-Json
if(@($state.jobs.PSObject.Properties.Value|Where-Object {$_.status -in @('queued','delivered','downloading','flashing','rebooting','verifying')}).Count){throw 'Active PA firmware job; defer runtime restart'}
$source=[IO.File]::ReadAllText($main)
$pattern=[regex]::new("(?m)^  if\(c\.PA_CLIMATE_TRANSPORT_KEY\) \{\r?\n    const \{startMsiTransport\} = await import\('[^']+'\)\r?\n    startMsiTransport\([^\r\n]+\)\r?\n  \}\r?\n")
if($pattern.Matches($source).Count -ne 1){throw 'Unexpected live climate initialization; review before modifying it'}
$backup='E:\SimScopeData\Farmplast\Climate\integration-backup\index-before-direct-'+[datetime]::UtcNow.ToString('yyyyMMdd-HHmmss')+'.ts'
Copy-Item -LiteralPath $main -Destination $backup
$updated=$pattern.Replace($source,"  // PA climate uses the signed HTTPS gateway; no Cloud Realtime peer.`n",1)
if($updated.Contains('startMsiTransport')){throw 'Another climate Realtime start remains'}
try{
  [IO.File]::WriteAllText($main,$updated,[Text.UTF8Encoding]::new($false))
  $since=[datetime]::UtcNow.ToString('o')
  & docker restart supabase-edge-functions|Out-Null
  if($LASTEXITCODE -ne 0){throw 'Existing climate runtime restart failed'}
  $healthy=$false
  for($i=0;$i -lt 40;$i++){
    try{$r=Invoke-RestMethod http://127.0.0.1:18000/climate/healthz -TimeoutSec 1;if($r.status -eq 'ok'){$healthy=$true;break}}catch{}
    Start-Sleep -Milliseconds 500
  }
  if(!$healthy){throw 'Climate runtime failed its local health check'}
  $site=Invoke-WebRequest -UseBasicParsing https://farmplast.vercel.app/climate/healthz -TimeoutSec 20
  if($site.StatusCode -ne 200 -or $site.Headers['X-Farmplast-Climate-Transport'] -ne 'msi-https'){throw 'Climate site failed after disconnecting the old peer'}
  # Docker writes ordinary container output to stderr as well. Windows PowerShell
  # must not treat those log records as a failed native command.
  $previousErrorAction=$ErrorActionPreference
  try{
    $ErrorActionPreference='Continue'
    $logs=@(& docker logs --since $since supabase-edge-functions 2>&1|ForEach-Object {"$_"})
    $logExit=$LASTEXITCODE
  }finally{$ErrorActionPreference=$previousErrorAction}
  if($logExit -ne 0){throw 'Could not verify climate runtime logs'}
  if(@($logs|Where-Object {$_ -match 'Farmplast Climate transport:\s*connected'}).Count){throw 'The climate Realtime peer unexpectedly reconnected'}
  [pscustomobject]@{RealtimeDisconnected=$true;LocalHealth='ok';SiteTransport='msi-https';Backup=$backup}|ConvertTo-Json -Compress
}catch{
  Copy-Item -LiteralPath $backup -Destination $main -Force
  & docker restart supabase-edge-functions|Out-Null
  throw
}
