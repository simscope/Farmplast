# Run from the existing administrator account on MSI. Installs no new service.
[CmdletBinding()]
param([string]$Stage='E:\SimScopeData\Farmplast\NJTelemetry\private\read-auth-stage')
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$integration='E:\SimScopeData\Supabase\deployment\volumes\functions\main\climate\module\integration'
$adapter=Join-Path $integration 'fetch-existing-runtime.mjs'
$helper=Join-Path $integration 'verifiedUser.mjs'
$statePath='E:\SimScopeData\Supabase\deployment\volumes\functions\main\climate\data\climate-state.json'
if([IO.Path]::GetFullPath($Stage) -ne 'E:\SimScopeData\Farmplast\NJTelemetry\private\read-auth-stage'){throw 'Unexpected staging directory'}
if((Get-FileHash -LiteralPath $adapter -Algorithm SHA256).Hash -ne '7C8FAB2469F1CA8683496C91DD4B1AE3A8FD6D9F140EE1114530209F93721033'){throw 'PA runtime adapter changed; review before installation'}
$state=Get-Content -LiteralPath $statePath -Raw|ConvertFrom-Json
if(@($state.jobs.PSObject.Properties.Value|Where-Object {$_.status -in @('queued','delivered','downloading','flashing','rebooting','verifying')}).Count){throw 'Active PA firmware update; defer runtime restart'}
function DesiredDigest {
  $s=Get-Content -LiteralPath $statePath -Raw|ConvertFrom-Json
  $data=($s.zones.PSObject.Properties|Sort-Object Name|ForEach-Object {[ordered]@{id=$_.Name;desired=$_.Value.desired}})|ConvertTo-Json -Depth 8 -Compress
  $sha=[Security.Cryptography.SHA256]::Create()
  try {([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($data)))).Replace('-','')}finally{$sha.Dispose()}
}
$before=DesiredDigest
$original=[IO.File]::ReadAllText($adapter)
$newline=if($original.Contains("`r`n")){"`r`n"}else{"`n"}
$source=$original.Replace("`r`n","`n")
$old=@'
    let response;
    try {response = await fetchImpl(config.authUrl + '/auth/v1/user', {headers:{apikey:config.authAnonKey,Authorization:'Bearer '+token},signal:AbortSignal.timeout(7000),redirect:'error'});}
    catch {return reply(503,{error:'Farmplast authentication unavailable'});}
    const user = await response.json().catch(() => null);
    if (!response.ok || !user?.id) return reply(401,{error:'Invalid Farmplast login'});
'@
$new=@'
    let user;
    try {user = await verifyUser(config,token,{readOnly:request.method==='GET'&&['/zones','/releases','/ota','/replacements'].includes(suffix)});}
    catch {return reply(503,{error:'Farmplast authentication unavailable'});}
    if (!user?.id) return reply(401,{error:'Invalid Farmplast login'});
'@
$old=$old.Replace("`r`n","`n");$new=$new.Replace("`r`n","`n")
$factory='  const {handler, store,replacements} = createClimateHandler(config);'
if(([regex]::Matches($source,[regex]::Escape($old))).Count -ne 1 -or ([regex]::Matches($source,[regex]::Escape($factory))).Count -ne 1){throw 'Unexpected PA authentication source'}
$source=$source.Replace($old,$new).Replace($factory,"  const verifyUser = createUserVerifier({fetchImpl});`n"+$factory)
$updated=("import {createUserVerifier} from './verifiedUser.mjs';`n"+$source).Replace("`n",$newline)
$candidate=Join-Path $Stage 'fetch-existing-runtime.patched.mjs'
[IO.File]::WriteAllText($candidate,$updated,[Text.UTF8Encoding]::new($false))
$node='C:\Program Files\nodejs\node.exe'
& $node --check $candidate
if($LASTEXITCODE -ne 0){throw 'Patched PA adapter syntax check failed'}
& $node --check (Join-Path $Stage 'verifiedUser.mjs')
if($LASTEXITCODE -ne 0){throw 'Auth helper syntax check failed'}
$backup='E:\SimScopeData\Farmplast\Climate\integration-backup\read-auth-'+[datetime]::UtcNow.ToString('yyyyMMdd-HHmmss')
New-Item -ItemType Directory -Path $backup|Out-Null
Copy-Item -LiteralPath $adapter -Destination (Join-Path $backup 'fetch-existing-runtime.mjs')
$hadHelper=Test-Path -LiteralPath $helper
if($hadHelper){Copy-Item -LiteralPath $helper -Destination (Join-Path $backup 'verifiedUser.mjs')}
try {
  Copy-Item -LiteralPath (Join-Path $Stage 'verifiedUser.mjs') -Destination $helper -Force
  Copy-Item -LiteralPath $candidate -Destination $adapter -Force
  & $node (Join-Path $Stage 'verify-pa-read-auth.mjs') $adapter
  if($LASTEXITCODE -ne 0){throw 'Installed PA authentication regression failed'}
  & docker restart supabase-edge-functions|Out-Null
  if($LASTEXITCODE -ne 0){throw 'Existing climate worker restart failed'}
  $healthy=$false
  for($i=0;$i -lt 40;$i++){
    try{$r=Invoke-RestMethod http://127.0.0.1:18000/climate/healthz -TimeoutSec 1;if($r.status -eq 'ok'){$healthy=$true;break}}catch{}
    Start-Sleep -Milliseconds 500
  }
  if(!$healthy){throw 'Climate worker failed health check'}
  $site=Invoke-WebRequest -UseBasicParsing https://farmplast.vercel.app/climate/healthz -TimeoutSec 20
  if($site.StatusCode -ne 200 -or $site.Headers['X-Farmplast-Climate-Transport'] -ne 'msi-https'){throw 'Climate site failed health check'}
  if((DesiredDigest) -ne $before){throw 'Desired zone settings changed during installation; inspect before continuing'}
  [pscustomobject]@{Installed=$true;Runtime='healthy';SiteTransport='msi-https';DesiredSettingsUnchanged=$true;ReadAuthCacheSeconds=60;Backup=$backup}|ConvertTo-Json -Compress
} catch {
  Copy-Item -LiteralPath (Join-Path $backup 'fetch-existing-runtime.mjs') -Destination $adapter -Force
  if($hadHelper){Copy-Item -LiteralPath (Join-Path $backup 'verifiedUser.mjs') -Destination $helper -Force}
  & docker restart supabase-edge-functions|Out-Null
  throw
}
