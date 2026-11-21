$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'zkt-auto-dst.ps1') -Mode Library
$script:passed=0
function Assert($condition,$message){if(!$condition){throw "ASSERT: $message"}}
function Expect-Failure([scriptblock]$action){$failed=$false;try{& $action|Out-Null}catch{$failed=$true};Assert $failed 'expected failure'}
function New-Fixture([string]$kind='spring') {
  $script:root=Join-Path ([IO.Path]::GetTempPath()) ('farmplast-dst-test-'+[guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $script:root|Out-Null
  $t=Get-Transitions 2027|Where-Object kind -eq $kind
  $script:fixed=$t.utc.AddMinutes(1)
  $expected=Get-ExpectedClock $script:fixed
  $zk=[pscustomobject]@{clock=$expected.AddSeconds($t.expectedOffset);expected=$expected;serial='SERIAL-NJ';builtin='0';writes=0;connects=0;lostAck=$false;badReadback=$false;failReadback=$false;calls=[Collections.Generic.List[string]]::new()}
  $zk|Add-Member ScriptMethod Connect_Net {param($ip,$port);$this.connects++;$this.calls.Add('Connect');return $true}
  $zk|Add-Member ScriptMethod Disconnect {$this.calls.Add('Disconnect')}
  $zk|Add-Member ScriptMethod GetSerialNumber {param($machine,$out);$this.calls.Add('Serial');$out.Value=$this.serial;return $true}
  $zk|Add-Member ScriptMethod GetSysOption {param($machine,$key,$out);Assert ($key -eq 'DaylightSavingTime') 'only DST option read';$this.calls.Add('Option');$out.Value=$this.builtin;return $true}
  $zk|Add-Member ScriptMethod GetDeviceTime {param($machine,$y,$m,$d,$h,$i,$s);$this.calls.Add('ReadClock');if($this.writes -and $this.failReadback){return $false};$y.Value=$this.clock.Year;$m.Value=$this.clock.Month;$d.Value=$this.clock.Day;$h.Value=$this.clock.Hour;$i.Value=$this.clock.Minute;$s.Value=$this.clock.Second;return $true}
  $zk|Add-Member ScriptMethod SetDeviceTime2 {param($machine,$y,$m,$d,$h,$i,$s);$this.calls.Add('WriteClock');$this.writes++;$event=Get-PendingTransition $script:fixed;Assert (Test-Path (Join-Path $script:root "nj-$($event.event)-write.json")) 'durable intent precedes SDK call';$target=[datetime]::new($y,$m,$d,$h,$i,$s);Assert ($target -eq $this.expected) 'exact target';if(!$this.badReadback){$this.clock=$target};return !$this.lostAck}
  return $zk
}
$cfg=@{ip='127.0.0.1';port=4370;machine=1;expectedSerialNumber='SERIAL-NJ'}
$nowFn={$script:fixed};$goodHost={@{synchronized=$true}}
$null=Test-Calendar
foreach($year in 2026..2030){foreach($t in (Get-Transitions $year)){
  Assert ($null -eq (Get-PendingTransition $t.utc.AddTicks(-1))) 'before boundary'
  Assert ((Get-PendingTransition $t.utc).event -eq $t.event) 'exact boundary'
  Assert ((Get-PendingTransition $t.utc.AddSeconds(299)).event -eq $t.event) 'last safe minute'
  Assert ($null -eq (Get-PendingTransition $t.utc.AddSeconds(300))) 'no late catch-up'
}}
$script:passed++;Write-Output 'PASS calendar 2026-2030 and exact safety window'
foreach($kind in @('spring','autumn')) {
  $zk=New-Fixture $kind
  Assert ((Invoke-ClockGuard $zk $cfg $nowFn $goodHost) -eq 'corrected_verified') "$kind corrected"
  Assert ($zk.writes -eq 1) 'exactly one write'
  Assert ((Invoke-ClockGuard $zk $cfg $nowFn $goodHost) -eq 'blocked') 'repeat blocked'
  Assert ($zk.writes -eq 1) 'repeat does not write'
  Remove-Item -LiteralPath (Join-Path $script:root 'nj-state.json')
  Assert ((Invoke-ClockGuard $zk $cfg $nowFn $goodHost) -eq 'blocked') 'intent survives missing state/new process'
  $script:passed++;Write-Output "PASS $kind write/readback and durable replay protection"
}
$zk=New-Fixture;$zk.clock=$zk.expected
Assert ((Invoke-ClockGuard $zk $cfg $nowFn $goodHost) -eq 'already_correct') 'already correct'
Assert ($zk.writes -eq 0) 'no redundant correction'
$script:passed++;Write-Output 'PASS already-correct terminal remains unchanged'
foreach($scenario in @('serial','builtin','host','skew')) {
  $zk=New-Fixture;$hostFn=$goodHost
  switch($scenario){serial{$zk.serial='WRONG'}builtin{$zk.builtin='1'}host{$hostFn={throw 'wrong host clock'}}skew{$zk.clock=$zk.expected.AddHours(-3)}}
  Expect-Failure {Invoke-ClockGuard $zk $cfg $nowFn $hostFn}
  Assert ($zk.writes -eq 0) "$scenario refuses write"
  if($scenario -eq 'host'){Assert ($zk.connects -eq 0) 'bad host blocked before connection'}
}
$script:passed++;Write-Output 'PASS wrong identity, host time, built-in DST and unrelated drift fail closed'
foreach($scenario in @('lostAck','badReadback','failReadback')) {
  $zk=New-Fixture 'autumn';$zk.$scenario=$true
  Expect-Failure {Invoke-ClockGuard $zk $cfg $nowFn $goodHost}
  Assert ($zk.writes -eq 1) 'one attempted write'
  Assert ((Read-State).status -eq 'write_uncertain') 'uncertain marker retained'
  Assert ((Invoke-ClockGuard $zk $cfg $nowFn $goodHost) -eq 'blocked') 'no replay after failure'
}
$script:passed++;Write-Output 'PASS lost acknowledgement and failed readback cannot replay'
$zk=New-Fixture;$zk.serial='WRONG'
1..4|ForEach-Object{Expect-Failure {Invoke-ClockGuard $zk $cfg $nowFn $goodHost}}
Assert ((Invoke-ClockGuard $zk $cfg $nowFn $goodHost) -eq 'blocked') 'bounded checks'
Assert ($zk.connects -eq 4) 'four maximum attempts'
$zk=New-Fixture;$script:fixed=$script:fixed.AddMinutes(10)
Assert ((Invoke-ClockGuard $zk $cfg $nowFn $goodHost) -eq 'outside_window') 'outside window'
Assert ($zk.connects -eq 0) 'no terminal contact outside window'
$script:passed++;Write-Output 'PASS bounded retries and no daytime terminal connection'
$zk=New-Fixture;$script:step=0
$late={ $script:step++;if($script:step -ge 3){$script:fixed.AddMinutes(10)}else{$script:fixed} }
Expect-Failure {Invoke-ClockGuard $zk $cfg $late $goodHost};Assert ($zk.writes -eq 0) 'deadline rechecked'
$proof=@{checkedUtc=$script:fixed.AddHours(-1);ticks=[Diagnostics.Stopwatch]::GetTimestamp()}
Expect-Failure {Assert-HostStillTrusted $proof $script:fixed}
$script:passed++;Write-Output 'PASS expired window and host-clock jump refuse write'
@{ok=$true;tests=$script:passed;physicalTerminalWrites=0}|ConvertTo-Json -Compress
