param(
  [Parameter(Mandatory=$true)][string]$TerminalIp,
  [Parameter(Mandatory=$true)][string]$ExpectedSerial,
  [Parameter(Mandatory=$true)][string]$OutputPath,
  [int]$Port=4370,
  [int]$Machine=1
)
# Run in 32-bit Windows PowerShell on the terminal LAN. Read-only SDK calls;
# never disable/delete users, enroll biometrics or clear attendance logs.
$ErrorActionPreference='Stop'
if ([Environment]::Is64BitProcess) {throw 'Run with C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe'}
if (Test-Path -LiteralPath $OutputPath) {throw 'Refusing to overwrite an existing inventory'}
$zk=$null
try {
  $zk=New-Object -ComObject zkemkeeper.ZKEM
  if (!$zk.Connect_Net($TerminalIp,$Port)) {throw 'Connect_Net failed'}
  $serial='';$firmware='';$before=0;$after=0;$logs=0
  if (!$zk.GetSerialNumber($Machine,[ref]$serial) -or $serial -ne $ExpectedSerial) {throw 'Serial mismatch'}
  $zk.GetFirmwareVersion($Machine,[ref]$firmware)|Out-Null
  if (!$zk.GetDeviceStatus($Machine,2,[ref]$before) -or !$zk.GetDeviceStatus($Machine,6,[ref]$logs) -or !$zk.ReadAllUserID($Machine)) {throw 'Complete inventory cannot be read'}
  $users=New-Object 'System.Collections.Generic.List[object]'
  $uid='';$name='';$password='';$privilege=0;$enabled=$false
  while($zk.SSR_GetAllUserInfo($Machine,[ref]$uid,[ref]$name,[ref]$password,[ref]$privilege,[ref]$enabled)){
    $users.Add(@{terminal_user_id=$uid;name=$name;enabled=[bool]$enabled;privilege=$privilege})
    $uid='';$name='';$password='';$privilege=0;$enabled=$false
    if($users.Count -gt 100000){throw 'Invalid inventory size'}
  }
  if (!$zk.GetDeviceStatus($Machine,2,[ref]$after) -or $before -ne $after -or $users.Count -ne $before) {throw 'Inventory count changed or enumeration is incomplete'}
  $snapshot=@{checked_at=[DateTime]::UtcNow.ToString('o');serial_number=$serial;firmware=$firmware;user_count=$before;log_count=$logs;users=@($users.ToArray())}
  $snapshot|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $OutputPath -Encoding UTF8
  $digest=(Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256).Hash
  @{ok=$true;serial_number=$serial;firmware=$firmware;user_count=$before;log_count=$logs;sha256=$digest}|ConvertTo-Json -Compress
}finally{
  if($zk){try{$zk.Disconnect()|Out-Null}catch{};[Runtime.InteropServices.Marshal]::FinalReleaseComObject($zk)|Out-Null}
}
