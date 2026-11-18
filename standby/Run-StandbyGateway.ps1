$ErrorActionPreference='Stop'
$root='E:\SimScopeData\Farmplast\PayrollStandby'
$log=Join-Path $root ('logs\gateway-'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')+'.log')
$process=Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' -ArgumentList ('"'+(Join-Path $root 'scripts\gateway.mjs')+'"') -WorkingDirectory $root -RedirectStandardOutput $log -RedirectStandardError ($log+'.error') -WindowStyle Hidden -PassThru -Wait
exit $process.ExitCode
