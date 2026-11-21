# Farmplast ZKTeco NJ automatic Eastern DST correction.
# This standalone guard runs independently of the 07:00-21:00 bridge service.
# No Supabase writes and no changes to existing attendance or payroll records.
[CmdletBinding()]
param(
  [ValidateSet('Install','Run','Status','TestSchedule')]
  [string]$Mode = 'Status',
  [string]$Ip = '',
  [ValidateRange(1,65535)][int]$Port = 4370,
  [ValidateRange(1,100)][int]$Machine = 1,
  [string]$ExpectedSerialNumber = '',
  [ValidateSet('NJ')][string]$Plant = 'NJ'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Join-Path $env:ProgramData 'Farmplast\ZKT-AutoDST'
$configFile = Join-Path $root 'nj-config.json'
$stateFile = Join-Path $root 'nj-state.json'
$logFile = Join-Path $root 'nj-events.jsonl'
$installedScript = Join-Path $root 'zkt-auto-dst.ps1'
$ps32 = Join-Path $env:WINDIR 'SysWOW64\WindowsPowerShell\v1.0\powershell.exe'
$tz = [TimeZoneInfo]::FindSystemTimeZoneById('Eastern Standard Time')

function Get-Transitions([int]$year) {
  $firstMarch = [datetime]::new($year, 3, 1)
  $marchSunday = 1 + ((7 - [int]$firstMarch.DayOfWeek) % 7) + 7
  $firstNovember = [datetime]::new($year, 11, 1)
  $novemberSunday = 1 + ((7 - [int]$firstNovember.DayOfWeek) % 7)
  @(
    [pscustomobject]@{
      event = "spring-$year"
      kind = 'spring'
      utc = [datetime]::SpecifyKind([datetime]::new($year, 3, $marchSunday, 7, 0, 0), [DateTimeKind]::Utc)
      expectedOffset = -3600
    }
    [pscustomobject]@{
      event = "autumn-$year"
      kind = 'autumn'
      utc = [datetime]::SpecifyKind([datetime]::new($year, 11, $novemberSunday, 6, 0, 0), [DateTimeKind]::Utc)
      expectedOffset = 3600
    }
  )
}

function Get-PendingTransition([datetime]$utcNow) {
  foreach ($year in @(($utcNow.Year - 1), $utcNow.Year)) {
    foreach ($transition in (Get-Transitions $year)) {
      $elapsed = ($utcNow - $transition.utc).TotalSeconds
      if ($elapsed -ge 0 -and $elapsed -lt 3600) { return $transition }
    }
  }
  return $null
}

function Write-Event([string]$event, [hashtable]$detail) {
  if (!(Test-Path $root)) { New-Item $root -ItemType Directory -Force | Out-Null }
  $row = @{ at = [datetime]::UtcNow.ToString('o'); event = $event; plant = $Plant }
  foreach ($key in $detail.Keys) { $row[$key] = $detail[$key] }
  Add-Content -LiteralPath $logFile -Value ($row | ConvertTo-Json -Compress -Depth 8) -Encoding UTF8
}

function Read-DeviceClock($zk, [int]$deviceNumber) {
  $year = 0; $month = 0; $day = 0
  $hour = 0; $minute = 0; $second = 0
  if (!$zk.GetDeviceTime($deviceNumber, [ref]$year, [ref]$month, [ref]$day, [ref]$hour, [ref]$minute, [ref]$second)) {
    throw 'GetDeviceTime failed'
  }
  return [datetime]::new($year, $month, $day, $hour, $minute, $second)
}

function Get-ExpectedClock {
  return [TimeZoneInfo]::ConvertTimeFromUtc([datetime]::UtcNow, $tz)
}

function Save-Done([string]$event) {
  # Only record success or a device already displaying the correct wall clock.
  $tmp = "$stateFile.tmp"
  @{ event = $event; verifiedUtc = [datetime]::UtcNow.ToString('o') } |
    ConvertTo-Json -Compress | Set-Content -LiteralPath $tmp -Encoding UTF8
  Move-Item -LiteralPath $tmp -Destination $stateFile -Force
}

if ($Mode -eq 'TestSchedule') {
  $t2027 = Get-Transitions 2027
  if ($t2027[0].utc.ToString('yyyy-MM-ddTHH:mm:ssZ') -ne '2027-03-14T07:00:00Z' -or
      $t2027[1].utc.ToString('yyyy-MM-ddTHH:mm:ssZ') -ne '2027-11-07T06:00:00Z') {
    throw 'DST schedule self-test failed'
  }
  $t2026 = Get-Transitions 2026
  if ($t2026[0].utc.ToString('yyyy-MM-ddTHH:mm:ssZ') -ne '2026-03-08T07:00:00Z' -or
      $t2026[1].utc.ToString('yyyy-MM-ddTHH:mm:ssZ') -ne '2026-11-01T06:00:00Z') {
    throw 'DST schedule self-test failed for 2026'
  }
  [pscustomobject]@{ ok = $true; year = 2027; springUtc = $t2027[0].utc; autumnUtc = $t2027[1].utc } |
    ConvertTo-Json -Compress
  exit 0
}

if ($Mode -eq 'Install') {
  if (-not (Test-Path $ps32)) { throw '32-bit Windows PowerShell is missing' }
  if ($Ip -notmatch '^\d{1,3}(\.\d{1,3}){3}$') { throw 'Pass the confirmed NJ terminal IPv4 using -Ip' }
  if ([string]::IsNullOrWhiteSpace($ExpectedSerialNumber)) { throw 'ExpectedSerialNumber is required: do not discover and trust an unknown device automatically' }
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Install requires an elevated Administrator PowerShell'
  }
  New-Item -ItemType Directory -Path $root -Force | Out-Null
  Copy-Item -LiteralPath $PSCommandPath -Destination $installedScript -Force
  @{
    plant = 'NJ'; ip = $Ip; port = $Port; machine = $Machine
    expectedSerialNumber = $ExpectedSerialNumber
  } | ConvertTo-Json | Set-Content -LiteralPath $configFile -Encoding UTF8
  & icacls.exe $root '/inheritance:r' '/grant:r' 'SYSTEM:(OI)(CI)F' 'Administrators:(OI)(CI)F' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not secure DST configuration directory' }
  # Confirm actual device identity and time through the matching 32-bit vendor COM SDK.
  & $ps32 -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $installedScript -Mode Status
  if ($LASTEXITCODE -ne 0) { throw 'NJ serial/time verification failed; scheduled task was NOT created' }
  $action = '"' + $ps32 + '" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $installedScript + '" -Mode Run'
  & schtasks.exe /Create /F /SC MINUTE /MO 1 /TN 'Farmplast ZKT NJ Auto DST' /TR $action /RU SYSTEM
  if ($LASTEXITCODE -ne 0) { throw 'Windows Scheduled Task installation failed' }
  Write-Event 'installed' @{ expectedTransition = 'second Sunday March 02:00 EST; first Sunday November 02:00 EDT' }
  Write-Output 'Installed: NJ DST guard (runs every minute, contacts device only within 24h after DST transition).'
  exit 0
}

if (-not [Environment]::Is64BitOperatingSystem -or [Environment]::Is64BitProcess) {
  throw 'Run/Status must use 32-bit Windows PowerShell at SysWOW64'
}
if (!(Test-Path $configFile)) { throw 'NJ DST guard is not installed' }
$cfg = Get-Content -LiteralPath $configFile -Raw | ConvertFrom-Json
if ($cfg.plant -ne 'NJ' -or !$cfg.expectedSerialNumber -or !$cfg.ip) {
  throw 'Invalid or incomplete NJ terminal identity configuration'
}

$transition = Get-PendingTransition ([datetime]::UtcNow)
if ($Mode -eq 'Run') {
  if ($null -eq $transition) { exit 0 }
  if (Test-Path $stateFile) {
    $last = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
    if ($last.event -eq $transition.event) { exit 0 }
  }
}

$mutex = New-Object System.Threading.Mutex($false, 'Global\Farmplast_NJ_ZKT_AutoDST')
$owned = $false
$zk = $null
try {
  try { $owned = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $owned = $true }
  if (!$owned) { exit 0 }
  $zk = New-Object -ComObject zkemkeeper.ZKEM
  if (!$zk.Connect_Net([string]$cfg.ip, [int]$cfg.port)) { throw 'ZKT Connect_Net failed' }
  $serial = ''
  if (!$zk.GetSerialNumber([int]$cfg.machine, [ref]$serial) -or
      ![string]::Equals($serial, [string]$cfg.expectedSerialNumber, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'NJ terminal serial number mismatch'
  }
  $before = Read-DeviceClock $zk ([int]$cfg.machine)
  $expected = Get-ExpectedClock
  $skewSeconds = ($before - $expected).TotalSeconds
  if ($Mode -eq 'Status') {
    [pscustomobject]@{
      ok = $true; plant = 'NJ'; terminalClock = $before.ToString('yyyy-MM-dd HH:mm:ss')
      easternClock = $expected.ToString('yyyy-MM-dd HH:mm:ss')
      skewSeconds = [math]::Round($skewSeconds)
      nextTransition = (Get-Transitions ([datetime]::UtcNow.Year) | Select-Object event,utc)
    } | ConvertTo-Json -Depth 5
    exit 0
  }
  if ([math]::Abs($skewSeconds) -le 90) {
    Write-Event 'already_correct' @{ transition = $transition.event; skewSeconds = [math]::Round($skewSeconds) }
    Save-Done $transition.event
    exit 0
  }
  # Never make a generic clock correction. Only a 1h skew in the right direction
  # within the official US Eastern DST transition window is eligible.
  if ([math]::Abs($skewSeconds - $transition.expectedOffset) -gt 300) {
    throw "Unexpected device clock skew; refusing automatic write: $([math]::Round($skewSeconds)) seconds"
  }
  # Capture the target immediately before setting, never reuse an earlier clock.
  $target = Get-ExpectedClock
  $setOk = $zk.SetDeviceTime2(
    [int]$cfg.machine, [int]$target.Year, [int]$target.Month, [int]$target.Day,
    [int]$target.Hour, [int]$target.Minute, [int]$target.Second)
  if (!$setOk) { throw 'SetDeviceTime2 rejected by terminal' }
  $after = Read-DeviceClock $zk ([int]$cfg.machine)
  $afterExpected = Get-ExpectedClock
  $finalSkew = ($after - $afterExpected).TotalSeconds
  if ([math]::Abs($finalSkew) -gt 15) { throw "Clock readback verification failed: $([math]::Round($finalSkew)) seconds" }
  Write-Event 'corrected_verified' @{
    transition = $transition.event
    oldClock = $before.ToString('yyyy-MM-dd HH:mm:ss')
    newClock = $after.ToString('yyyy-MM-dd HH:mm:ss')
    skewBeforeSeconds = [math]::Round($skewSeconds)
    skewAfterSeconds = [math]::Round($finalSkew)
  }
  Save-Done $transition.event
} catch {
  Write-Event 'error' @{ transition = $(if ($transition) { $transition.event } else { 'status' }); message = $_.Exception.Message }
  throw
} finally {
  if ($null -ne $zk) {
    try { $zk.Disconnect() | Out-Null } catch {}
    try { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($zk) | Out-Null } catch {}
  }
  if ($owned) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
