[CmdletBinding()]
param(
    [string]$InstallDir = 'C:\Program Files (x86)\ZKTBridge',
    [string]$RuntimeDirectory,
    [string]$ConfigPath,
    [switch]$SkipNetwork
)
# Inspection only. Never executes the bridge, registers COM, or changes services.
$ErrorActionPreference = 'Stop'
$script:failures = 0
function Report([string]$Level, [string]$Message) {
    Write-Output "$Level`: $Message"
    if ($Level -eq 'FAIL') { $script:failures++ }
}
$root = Split-Path $PSScriptRoot -Parent
$manifest = Get-Content -LiteralPath (Join-Path $root 'docs\PRODUCTION-BRIDGE-MANIFEST.json') -Raw | ConvertFrom-Json
if (!$RuntimeDirectory) { $RuntimeDirectory = Join-Path $root 'runtime' }
if (!$ConfigPath) { $ConfigPath = Join-Path $InstallDir '.env' }
try {
    $os = Get-CimInstance Win32_OperatingSystem
    Report 'PASS' "Windows: $($os.Caption), version $($os.Version), architecture $($os.OSArchitecture)"
    if (![Environment]::Is64BitOperatingSystem) { Report 'FAIL' '64-bit Windows is required by this captured recovery layout.' }
} catch { Report 'FAIL' 'Unable to inspect Windows version.' }
try {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { Report 'PASS' 'Administrator token present.' }
    else { Report 'WARN' 'Not elevated. Installation requires Administrator PowerShell; this inspection does not elevate.' }
} catch { Report 'WARN' 'Cannot determine administrator status.' }
$ps32 = Join-Path $env:WINDIR 'SysWOW64\WindowsPowerShell\v1.0\powershell.exe'
if (Test-Path -LiteralPath $ps32) { Report 'PASS' "32-bit PowerShell available: $ps32" }
else { Report 'FAIL' '32-bit Windows PowerShell is missing.' }
$registry = $null; $prog = $null; $server = $null
try {
    $registry = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine,[Microsoft.Win32.RegistryView]::Registry32)
    $prog = $registry.OpenSubKey('SOFTWARE\Classes\zkemkeeper.ZKEM\CLSID')
    $clsid = if ($prog) { [string]$prog.GetValue('') } else { '' }
    if ($clsid -ne $manifest.com.clsid) { Report 'FAIL' 'Expected 32-bit zkemkeeper.ZKEM CLSID is not registered.' }
    else {
        $server = $registry.OpenSubKey("SOFTWARE\Classes\CLSID\$clsid\InprocServer32")
        $dll = if ($server) { [string]$server.GetValue('') } else { '' }
        if ($dll -and (Test-Path -LiteralPath $dll)) { Report 'PASS' "32-bit COM registration and server DLL present: $dll" }
        else { Report 'FAIL' '32-bit COM server DLL is missing.' }
    }
} catch { Report 'FAIL' 'Cannot inspect 32-bit COM registration.' }
finally { if($server){$server.Dispose()}; if($prog){$prog.Dispose()}; if($registry){$registry.Dispose()} }
Report 'WARN' 'Registration inspection does not instantiate COM; run verify-zkt-com.ps1 after SDK preparation.'
foreach ($artifact in $manifest.files | Where-Object {$_.kind -eq 'runtime'}) {
    $path = Join-Path $RuntimeDirectory $artifact.name
    if (!(Test-Path -LiteralPath $path)) { Report 'FAIL' "Missing runtime artifact: $($artifact.name)"; continue }
    try {
        if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -eq $artifact.sha256) { Report 'PASS' "$($artifact.name) SHA256 matches verified production." }
        else { Report 'FAIL' "$($artifact.name) SHA256 mismatch; do not install." }
    } catch { Report 'FAIL' "Cannot hash $($artifact.name)." }
}
$config = @{}
if (Test-Path -LiteralPath $ConfigPath) {
    try {
        Get-Content -LiteralPath $ConfigPath | ForEach-Object {
            if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') { $config[$matches[1]] = $matches[2].Trim('"').Trim("'") }
        }
        foreach ($field in $manifest.configuration.requiredFields) {
            if (!$config[$field] -or $config[$field] -match '^<.*>$') { Report 'FAIL' "Configuration field missing/placeholder: $field" }
            else { Report 'PASS' "Configuration field populated: $field (value suppressed)" }
        }
        Report 'WARN' 'Field presence does not prove Supabase credentials are valid; no Supabase request is made.'
    } catch { Report 'FAIL' 'Cannot read configuration; no values disclosed.' }
} else { Report 'FAIL' 'Local deployment .env is missing; no configuration was created.' }
try {
    Get-NetIPAddress -AddressFamily IPv4 | ForEach-Object { Report 'PASS' "Interface: $($_.InterfaceAlias), IPv4 $($_.IPAddress)/$($_.PrefixLength)" }
} catch { Report 'WARN' 'Unable to enumerate IPv4 interfaces.' }
$address = if ($config['ZKT_IP']) { $config['ZKT_IP'] } else { $manifest.network.zktIp }
$portText = if ($config['ZKT_PORT']) { $config['ZKT_PORT'] } else { [string]$manifest.network.zktPort }
$ip = $null; $port = 0
$valid = [Net.IPAddress]::TryParse($address,[ref]$ip) -and $ip.AddressFamily -eq [Net.Sockets.AddressFamily]::InterNetwork -and [int]::TryParse($portText,[ref]$port) -and $port -ge 1 -and $port -le 65535
if (!$valid) { Report 'FAIL' 'ZKT endpoint must be a valid IPv4 address and TCP port.' }
elseif ($SkipNetwork) { Report 'WARN' "Network probes skipped for $address`:$port. Reachability is NOT verified." }
else {
    if ($port -ne 4370) { Report 'WARN' 'Configured port differs from captured TCP 4370; checking configured value only.' }
    $ping = [Net.NetworkInformation.Ping]::new()
    try {
        $reply = $ping.Send($ip,1500)
        if ($reply.Status -eq 'Success') { Report 'PASS' "ZKT ICMP reachable: $address" }
        else { Report 'WARN' 'ZKT ICMP did not reply; TCP is checked separately.' }
    } catch { Report 'WARN' 'ZKT ICMP probe failed; TCP is checked separately.' }
    finally { $ping.Dispose() }
    $tcp = [Net.Sockets.TcpClient]::new()
    try {
        if ($tcp.ConnectAsync($ip,$port).Wait(3000) -and $tcp.Connected) { Report 'PASS' "ZKT TCP reachable: $address`:$port" }
        else { Report 'FAIL' "ZKT TCP timed out: $address`:$port" }
    } catch { Report 'FAIL' "ZKT TCP unavailable: $address`:$port" }
    finally { $tcp.Dispose() }
}
try {
    $service = Get-CimInstance Win32_Service -Filter "Name='ZKTBridge'"
    if ($service) { Report 'WARN' "ZKTBridge already exists: $($service.State), startup $($service.StartMode). Installer will refuse replacement." }
    else { Report 'PASS' 'ZKTBridge service does not exist; no service was created.' }
} catch { Report 'WARN' 'Unable to inspect service existence.' }
Report 'WARN' 'This preflight never starts a worker or reads/writes employee or attendance data.'
if ($script:failures -gt 0) { Write-Output "FAIL: Preflight found $script:failures missing/invalid prerequisites."; exit 1 }
Write-Output 'PASS: Inspected prerequisites passed. Review WARN lines; this is not an end-to-end recovery test.'
