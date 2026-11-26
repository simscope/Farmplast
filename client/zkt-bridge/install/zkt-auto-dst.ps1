# NJ clock-only guard, independent of the existing daytime ZKT services.
[CmdletBinding()]
param(
  [ValidateSet('Install','Run','Status','TestSchedule','Library')][string]$Mode='Status',
  [string]$Ip='', [ValidateRange(1,65535)][int]$Port=4370,
  [ValidateRange(1,100)][int]$Machine=1, [string]$ExpectedSerialNumber=''
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$root=Join-Path $env:ProgramData 'Farmplast\ZKT-AutoDST'
$ps32=Join-Path $env:WINDIR 'SysWOW64\WindowsPowerShell\v1.0\powershell.exe'
$tz=[TimeZoneInfo]::FindSystemTimeZoneById('Eastern Standard Time')

function Get-Transitions([int]$year) {
  $march=1+((7-[int]([datetime]::new($year,3,1)).DayOfWeek)%7)+7
  $november=1+((7-[int]([datetime]::new($year,11,1)).DayOfWeek)%7)
  @(
    [pscustomobject]@{event="spring-$year";kind='spring';utc=[datetime]::SpecifyKind([datetime]::new($year,3,$march,7,0,0),[DateTimeKind]::Utc);expectedOffset=-3600}
    [pscustomobject]@{event="autumn-$year";kind='autumn';utc=[datetime]::SpecifyKind([datetime]::new($year,11,$november,6,0,0),[DateTimeKind]::Utc);expectedOffset=3600}
  )
}
function Get-PendingTransition([datetime]$now) {
  foreach($t in (Get-Transitions $now.Year)) {if(($now-$t.utc).TotalSeconds -ge 0 -and ($now-$t.utc).TotalSeconds -lt 300){return $t}}
  return $null
}
function Write-Event([string]$event,[hashtable]$detail) {
  $row=@{at=[datetime]::UtcNow.ToString('o');event=$event;plant='NJ'}
  foreach($key in $detail.Keys){$row[$key]=$detail[$key]}
  Add-Content -LiteralPath (Join-Path $root 'nj-events.jsonl') -Value ($row|ConvertTo-Json -Compress -Depth 8) -Encoding UTF8
}
function Write-DurableJson([string]$file,[hashtable]$value,[switch]$Exclusive) {
  $target=if($Exclusive){$file}else{"$file.$PID.$([guid]::NewGuid().ToString('N')).tmp"}
  $stream=[IO.FileStream]::new($target,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try {
    $bytes=[Text.UTF8Encoding]::new($false).GetBytes(($value|ConvertTo-Json -Compress -Depth 8))
    $stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)
  }finally{$stream.Dispose()}
  if(!$Exclusive){if([IO.File]::Exists($file)){[IO.File]::Replace($target,$file,[NullString]::Value)}else{[IO.File]::Move($target,$file)}}
}
function Read-State {
  $s=@{event='';status='';attempts=0};$file=Join-Path $root 'nj-state.json'
  if(Test-Path -LiteralPath $file){$saved=Get-Content -LiteralPath $file -Raw|ConvertFrom-Json;foreach($p in $saved.PSObject.Properties){$s[$p.Name]=$p.Value}}
  return $s
}
function Save-State([hashtable]$s){Write-DurableJson (Join-Path $root 'nj-state.json') $s}
function Read-DeviceClock($zk,[int]$machine) {
  [int]$y=0;[int]$m=0;[int]$d=0;[int]$h=0;[int]$i=0;[int]$s=0
  if(!$zk.GetDeviceTime($machine,[ref]$y,[ref]$m,[ref]$d,[ref]$h,[ref]$i,[ref]$s)){throw 'GetDeviceTime failed'}
  return [datetime]::new($y,$m,$d,$h,$i,$s)
}
function Read-Serial($zk,[int]$machine){$s='';if(!$zk.GetSerialNumber($machine,[ref]$s)){throw 'GetSerialNumber failed'};return $s}
function Read-BuiltinDst($zk,[int]$machine){$s='';if(!$zk.GetSysOption($machine,'DaylightSavingTime',[ref]$s) -or $s -notin @('0','1')){throw 'Cannot verify built-in DST option'};return $s}
function Get-ExpectedClock([datetime]$utc){return [TimeZoneInfo]::ConvertTimeFromUtc($utc,$tz)}
function Get-TrustedHostClock {
  if((Get-Service W32Time).Status -ne 'Running'){throw 'Windows Time service is not running'}
  $exe=Join-Path $env:WINDIR 'System32\w32tm.exe'
  if(Test-Path (Join-Path $env:WINDIR 'Sysnative\w32tm.exe')){$exe=Join-Path $env:WINDIR 'Sysnative\w32tm.exe'}
  $values=@()
  foreach($server in @('time.windows.com','time.cloudflare.com')) {
    $lines=@(& $exe /stripchart "/computer:$server" /dataonly /samples:1 2>&1)
    if($LASTEXITCODE -ne 0){throw "NTP check failed: $server"}
    $sample=@($lines|ForEach-Object {if("$_" -match ',\s*([+-]\d+[.,]\d+)s\s*$'){[double]::Parse($matches[1].Replace(',','.'),[Globalization.CultureInfo]::InvariantCulture)}})
    if($sample.Count -ne 1 -or [math]::Abs($sample[0]) -gt 2){throw "Host clock is not verified within two seconds: $server"}
    $values+=$sample[0]
  }
  if([math]::Abs($values[0]-$values[1]) -gt 1){throw 'Independent NTP sources disagree'}
  return @{synchronized=$true;offsetSeconds=$values;checkedUtc=[datetime]::UtcNow;ticks=[Diagnostics.Stopwatch]::GetTimestamp()}
}
function Assert-HostStillTrusted($hostProof,[datetime]$utc) {
  if($hostProof.ContainsKey('checkedUtc')) {
    $elapsed=([Diagnostics.Stopwatch]::GetTimestamp()-$hostProof.ticks)/[double][Diagnostics.Stopwatch]::Frequency
    if([math]::Abs(($utc-$hostProof.checkedUtc).TotalSeconds-$elapsed) -gt 0.5){throw 'Host clock jumped after NTP check'}
  }
}
function Invoke-ClockGuard($zk,$cfg,[scriptblock]$UtcNow={[datetime]::UtcNow},[scriptblock]$HostCheck={Get-TrustedHostClock}) {
  $now=& $UtcNow;$t=Get-PendingTransition $now;if(!$t){return 'outside_window'}
  $old=Read-State;$attempts=if($old.event -eq $t.event){[int]$old.attempts}else{0}
  $intent=Join-Path $root "nj-$($t.event)-write.json"
  if(($old.event -eq $t.event -and $old.status -eq 'complete') -or (Test-Path -LiteralPath $intent) -or $attempts -ge 4){return 'blocked'}
  $state=@{event=$t.event;attempts=$attempts+1;status='checking'};Save-State $state
  $connected=$false
  try {
    $proof=& $HostCheck;if(!$proof.synchronized){throw 'Host time check failed'}
    if(!$zk.Connect_Net([string]$cfg.ip,[int]$cfg.port)){throw 'Connect_Net failed'};$connected=$true
    if((Read-Serial $zk $cfg.machine) -cne $cfg.expectedSerialNumber){throw 'NJ terminal serial number mismatch'}
    $builtin=Read-BuiltinDst $zk $cfg.machine
    $before=Read-DeviceClock $zk $cfg.machine;$expected=Get-ExpectedClock (& $UtcNow)
    $skew=($before-$expected).TotalSeconds
    if([math]::Abs($skew) -le 90){$state.status='complete';Save-State $state;Write-Event 'already_correct' @{transition=$t.event;skewSeconds=[math]::Round($skew)};return 'already_correct'}
    if($builtin -ne '0'){throw 'Built-in DST enabled; refusing competing correction'}
    if([math]::Abs($skew-$t.expectedOffset) -gt 300){throw 'Unexpected clock skew; refusing automatic write'}
    $now=& $UtcNow;$current=Get-PendingTransition $now
    if(!$current -or $current.event -ne $t.event){throw 'Transition window expired'}
    Assert-HostStillTrusted $proof $now
    if((Read-Serial $zk $cfg.machine) -cne $cfg.expectedSerialNumber){throw 'Terminal identity changed'}
    $now=& $UtcNow;$current=Get-PendingTransition $now
    if(!$current -or $current.event -ne $t.event){throw 'Transition window expired'}
    Assert-HostStillTrusted $proof $now
    $target=Get-ExpectedClock (& $UtcNow)
    # Flushed, exclusive intent BEFORE the SDK call prevents replay after crash/lost ACK.
    Write-DurableJson $intent @{event=$t.event;at=$now.ToString('o');target=$target.ToString('s')} -Exclusive
    if(!$zk.SetDeviceTime2([int]$cfg.machine,$target.Year,$target.Month,$target.Day,$target.Hour,$target.Minute,$target.Second)){throw 'SetDeviceTime2 rejected; write will not be repeated'}
    $after=Read-DeviceClock $zk $cfg.machine;$finalSkew=($after-(Get-ExpectedClock (& $UtcNow))).TotalSeconds
    if([math]::Abs($finalSkew) -gt 15){throw 'Clock readback failed; write will not be repeated'}
    $state.status='complete';Save-State $state
    Write-Event 'corrected_verified' @{transition=$t.event;oldClock=$before.ToString('s');newClock=$after.ToString('s');skewBeforeSeconds=[math]::Round($skew);skewAfterSeconds=[math]::Round($finalSkew)}
    return 'corrected_verified'
  }catch{
    $state.status=if(Test-Path -LiteralPath $intent){'write_uncertain'}else{'error'};Save-State $state
    Write-Event 'error' @{transition=$t.event;message=$_.Exception.Message};throw
  }finally{if($connected){try{$zk.Disconnect()|Out-Null}catch{}}}
}
function Test-Calendar {
  $dates=@{2026=@('03-08','11-01');2027=@('03-14','11-07');2028=@('03-12','11-05');2029=@('03-11','11-04');2030=@('03-10','11-03')}
  foreach($year in 2026..2030){$t=Get-Transitions $year;if($t[0].utc.ToString('yyyy-MM-ddTHH:mm:ssZ') -ne "$year-$($dates[$year][0])T07:00:00Z" -or $t[1].utc.ToString('yyyy-MM-ddTHH:mm:ssZ') -ne "$year-$($dates[$year][1])T06:00:00Z"){throw "Calendar failed: $year"}}
  @{ok=$true;plant='NJ';years='2026-2030';transitions2027=(Get-Transitions 2027)}|ConvertTo-Json -Depth 5 -Compress
}
if($Mode -eq 'Library'){return}
if($Mode -eq 'TestSchedule'){Test-Calendar;exit 0}
if($Mode -eq 'Install') {
  if(!(Test-Path $ps32) -or !([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Install requires an elevated Windows administrator'}
  $parsed=$null;if(![Net.IPAddress]::TryParse($Ip,[ref]$parsed) -or $parsed.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork -or !$ExpectedSerialNumber){throw 'Verified terminal IPv4 and serial are required'}
  New-Item -ItemType Directory -Path $root -Force|Out-Null
  & icacls.exe $root '/inheritance:r' '/grant:r' '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F'|Out-Null
  if($LASTEXITCODE -ne 0){throw 'Could not protect clock configuration'}
  $installed=Join-Path $root 'zkt-auto-dst.ps1'
  if($PSCommandPath -ne $installed){Copy-Item -LiteralPath $PSCommandPath -Destination $installed -Force}
  @{plant='NJ';ip=$Ip;port=$Port;machine=$Machine;expectedSerialNumber=$ExpectedSerialNumber}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $root 'nj-config.json') -Encoding UTF8
  & $ps32 -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $installed -Mode Status
  if($LASTEXITCODE -ne 0){throw 'Read-only serial/time preflight failed; task NOT registered'}
  $action=New-ScheduledTaskAction -Execute $ps32 -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$installed+'" -Mode Run')
  $triggers=@((New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)),(New-ScheduledTaskTrigger -AtStartup))
  $settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Seconds 90) -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName 'Farmplast ZKT NJ Auto DST' -Action $action -Trigger $triggers -Settings $settings -User SYSTEM -RunLevel Highest -Force|Out-Null
  Write-Event 'installed' @{windowSeconds=300;identity=$ExpectedSerialNumber}
  Write-Output 'Installed: independent one-minute and boot triggers; no daytime catch-up.';exit 0
}
if(-not [Environment]::Is64BitOperatingSystem -or [Environment]::Is64BitProcess){throw 'Use the existing 32-bit SDK through SysWOW64 PowerShell'}
$cfg=Get-Content -LiteralPath (Join-Path $root 'nj-config.json') -Raw|ConvertFrom-Json
if($cfg.plant -ne 'NJ' -or !$cfg.expectedSerialNumber -or !$cfg.ip){throw 'Incomplete verified NJ configuration'}
if($Mode -eq 'Run' -and !(Get-PendingTransition ([datetime]::UtcNow))){exit 0}
$mutex=[Threading.Mutex]::new($false,'Global\Farmplast_NJ_ZKT_AutoDST');$owned=$false;$zk=$null
try {
  try{$owned=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$owned=$true}
  if(!$owned){exit 0}
  $zk=New-Object -ComObject zkemkeeper.ZKEM
  if($Mode -eq 'Run'){Invoke-ClockGuard $zk $cfg|Out-Null;exit 0}
  $proof=Get-TrustedHostClock
  if(!$zk.Connect_Net([string]$cfg.ip,[int]$cfg.port)){throw 'Connect_Net failed'}
  $serial=Read-Serial $zk $cfg.machine;if($serial -cne $cfg.expectedSerialNumber){throw 'NJ serial mismatch'}
  $builtin=Read-BuiltinDst $zk $cfg.machine;$before=Read-DeviceClock $zk $cfg.machine;$expected=Get-ExpectedClock ([datetime]::UtcNow)
  $skew=[math]::Round(($before-$expected).TotalSeconds)
  $result=@{ok=([math]::Abs($skew) -le 90);plant='NJ';ip=$cfg.ip;serial=$serial;serialVerified=$true;terminalClock=$before.ToString('s');easternClock=$expected.ToString('s');skewSeconds=$skew;builtinDst=$builtin;host=$proof}
  Write-Event 'status' $result;$result|ConvertTo-Json -Depth 5 -Compress
  if(!$result.ok -or $builtin -ne '0'){throw 'Preflight not eligible for automatic external DST'}
}catch{Write-Event 'error' @{mode=$Mode;message=$_.Exception.Message};throw}
finally{if($zk){try{$zk.Disconnect()|Out-Null}catch{};[Runtime.InteropServices.Marshal]::FinalReleaseComObject($zk)|Out-Null};if($owned){$mutex.ReleaseMutex()};$mutex.Dispose()}
