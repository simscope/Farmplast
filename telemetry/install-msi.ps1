param([string]$Root = 'E:\SimScopeData\Farmplast\NJTelemetry')
$ErrorActionPreference = 'Stop'
$resolved = [IO.Path]::GetFullPath($Root)
if ($resolved -ne 'E:\SimScopeData\Farmplast\NJTelemetry') { throw 'Unexpected installation root' }
$node = 'C:\Program Files\nodejs\node.exe'
if (!(Test-Path -LiteralPath $node)) { throw 'Existing Node runtime is required' }
$taskName = 'Farmplast-NJ-Telemetry'
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) { throw 'Task already exists; inspect it before replacing the running service' }
if (Get-NetTCPConnection -State Listen -LocalPort 18220 -ErrorAction SilentlyContinue) { throw 'Port 18220 is already occupied' }
$release = Join-Path $resolved 'release'
$private = Join-Path $resolved 'private'
New-Item -ItemType Directory -Force -Path $release,$private | Out-Null
foreach ($file in @('server.mjs','state.mjs','points.json')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination (Join-Path $release $file) }
$ownerSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
foreach ($dir in @('E:\SimScopeData','E:\SimScopeData\Farmplast')) {
  # Node/PowerShell must resolve the path through locked parent directories.
  # This grants only traversal and attributes on these two directories, not
  # listing, file reads, writes, or inherited access to other projects.
  & icacls.exe $dir /grant '*S-1-5-19:(X,RA,S)' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to grant directory traversal' }
}
foreach ($dir in @($resolved,$release,$private)) {
  & icacls.exe $dir /inheritance:r /grant:r "*${ownerSid}:(OI)(CI)(F)" '*S-1-5-18:(OI)(CI)(F)' '*S-1-5-19:(OI)(CI)(RX)' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to restrict service files' }
}
function New-PrivateKey {
  $bytes = New-Object byte[] 32
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  return ([BitConverter]::ToString($bytes)).Replace('-','').ToLowerInvariant()
}
$configPath = Join-Path $private 'config.json'
if (!(Test-Path -LiteralPath $configPath)) {
  $config = @{ readKey=(New-PrivateKey); devices=@{} }
  foreach ($id in @('chiller-1','chiller-2','chiller-3','barrels')) { $config.devices[$id] = New-PrivateKey }
  [IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json -Depth 4), (New-Object Text.UTF8Encoding($false)))
}
$runner = Join-Path $resolved 'run.ps1'
$script = @'
$ErrorActionPreference = 'Stop'
$env:NJ_TELEMETRY_CONFIG = 'E:\SimScopeData\Farmplast\NJTelemetry\private\config.json'
$env:PORT = '18220'
& 'C:\Program Files\nodejs\node.exe' --max-old-space-size=64 'E:\SimScopeData\Farmplast\NJTelemetry\release\server.mjs'
exit $LASTEXITCODE
'@
[IO.File]::WriteAllText($runner, $script, (New-Object Text.UTF8Encoding($false)))
$action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "E:\SimScopeData\Farmplast\NJTelemetry\run.ps1"' -WorkingDirectory $release
$principal = New-ScheduledTaskPrincipal -UserId 'S-1-5-19' -LogonType ServiceAccount -RunLevel Limited
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Trigger $trigger -Settings $settings -Description 'Farmplast NJ current telemetry in RAM only; no history. Standby until device cutover.' | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Output 'Installed isolated RAM telemetry service with boot startup. No device or website source was switched.'
