[CmdletBinding()]
param([string]$InstallDir = 'C:\Program Files (x86)\ZKTBridge')
$ErrorActionPreference = 'Stop'
$config = @{}
Get-Content -LiteralPath (Join-Path $InstallDir '.env') | ForEach-Object {
    if ($_ -match '^\s*(ZKT_IP|ZKT_PORT)\s*=\s*(.*?)\s*$') {
        $config[$matches[1]] = $matches[2].Trim('"').Trim("'")
    }
}
if (!$config.ZKT_IP -or !$config.ZKT_PORT) { throw 'Set ZKT_IP and ZKT_PORT in .env.' }
$result = Test-NetConnection -ComputerName $config.ZKT_IP -Port ([int]$config.ZKT_PORT) -WarningAction SilentlyContinue
$result | Select-Object RemoteAddress,RemotePort,InterfaceAlias,SourceAddress,TcpTestSucceeded | Format-List
if (!$result.TcpTestSucceeded) { throw 'ZKT TCP connection failed.' }
