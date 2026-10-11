[CmdletBinding()]
param([Parameter(Mandatory=$true)][ValidateSet('NJ','PA')][string]$Plant,
      [string]$ServiceName='ZKTBridge', [string]$LogFile,
      [string]$QueueFile, [string]$InstallDir)
# Read-only: no service/NSSM executable calls, SDK, network probes, or raw logs.
# Run on the actual Windows Bridge computer. UNKNOWN is never a health PASS.
$ErrorActionPreference='Stop'
function Read-Setting($Name) {
  try { Get-ItemPropertyValue -LiteralPath "HKLM:\SYSTEM\CurrentControlSet\Services\$ServiceName\Parameters" -Name $Name -ErrorAction Stop }
  catch { $null }
}
function Fingerprint($Path) {
  if(!$Path -or !(Test-Path -LiteralPath $Path -PathType Leaf)){return $null}
  $item=Get-Item -LiteralPath $Path
  @{file=$item.Name;version=$item.VersionInfo.FileVersion;sha256=(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash;modified_utc=$item.LastWriteTimeUtc.ToString('o')}
}
$svc=Get-CimInstance Win32_Service -Filter "Name='$($ServiceName.Replace("'","''"))'" -ErrorAction SilentlyContinue
$app=Read-Setting 'Application'
if(!$InstallDir -and $app){$InstallDir=Split-Path -LiteralPath $app}
$wrapper=$null
if($svc -and $svc.PathName -match '^\s*(?:"([^"\r\n]+\.exe)"|([^"\r\n]+?\.exe))(?:\s|$)'){
  $wrapper=if($Matches[1]){$Matches[1]}else{$Matches[2]}
}
$processes=@(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {$app -and $_.ExecutablePath -eq $app})
if(!$LogFile){$LogFile=Read-Setting 'AppStdout'}
$lines=@();$logReadable=$false
if($LogFile -and (Test-Path -LiteralPath $LogFile -PathType Leaf)){
  try{$lines=@(Get-Content -LiteralPath $LogFile -Tail 1000 -ErrorAction Stop);$logReadable=$true}catch{}
}
$events=@()
foreach($line in $lines){
  # Extract only a timestamp and classification. Never return raw message/JSON.
  $timestamp=$null
  if($line -match '(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))'){$timestamp=$Matches[1]}
  if(!$timestamp){continue}
  $kind=if($line -match '(?i)\b(error|failed|exception|timeout)\b'){'error'}
    elseif($line -match '(?i)\b(attendance|sync|import|pull)\b.*\b(success|succeeded|completed|finished|done)\b'){'sync_success_candidate'}
    elseif($line -match '(?i)\b(attendance|event|punch)\b.*\b(received|inserted|imported)\b'){'received_event_candidate'}
    elseif($line -match '(?i)\b(terminal|device|zkt)\b.*\b(connected|connection successful)\b'){'terminal_connected_candidate'}
    else{$null}
  if($kind){$events+=@{timestamp=$timestamp;kind=$kind}}
}
function Last-Candidate($Kind) { @($events | Where-Object {$_.kind -eq $Kind} | Select-Object -Last 1) }
$queueCount=$null;$queueShape='UNKNOWN'
if($QueueFile -and (Test-Path -LiteralPath $QueueFile -PathType Leaf)){
  try{
    $queue=Get-Content -LiteralPath $QueueFile -Raw | ConvertFrom-Json
    if($queue -is [array]){$queueCount=@($queue | Where-Object {$_.status -in @('pending','queued','processing')}).Count;$queueShape='JSON status array'}
    elseif($queue.PSObject.Properties['pending'] -and $queue.pending -is [array]){$queueCount=$queue.pending.Count;$queueShape='JSON pending array'}
  }catch{}
}
$packageVersion=$null
if($InstallDir){
  $package=Join-Path $InstallDir 'package.json'
  if(Test-Path -LiteralPath $package -PathType Leaf){try{$p=Get-Content -LiteralPath $package -Raw | ConvertFrom-Json;if($p.version -match '^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$'){$packageVersion=$p.version}}catch{}}
}
[ordered]@{
  plant=$Plant;host=$env:COMPUTERNAME;checked_at_utc=[DateTime]::UtcNow.ToString('o');executed_locally=$true
  service=if($svc){@{name=$svc.Name;state=$svc.State;start_mode=$svc.StartMode;pid=$svc.ProcessId}}else{'NOT_FOUND'}
  nssm=(Fingerprint $wrapper);bridge=(Fingerprint $app);package_version=$packageVersion;bridge_process_count=$processes.Count
  log_readable=$logReadable;log_scope='Last 1000 lines only; candidates require operator confirmation'
  last_sync_candidate=(Last-Candidate 'sync_success_candidate');last_event_candidate=(Last-Candidate 'received_event_candidate')
  terminal_candidate=(Last-Candidate 'terminal_connected_candidate');current_terminal_connectivity='UNKNOWN: no device probe performed'
  pending_queue_count=$queueCount;queue_shape=$queueShape
  error_count_in_sample=@($events | Where-Object {$_.kind -eq 'error'}).Count;last_error=(Last-Candidate 'error')
  credentials='OMITTED; no environment variables, arguments, raw logs, URLs, user IDs or queue payloads returned'
  baseline_status='OPERATOR_CONFIRMATION_REQUIRED'
} | ConvertTo-Json -Depth 6
