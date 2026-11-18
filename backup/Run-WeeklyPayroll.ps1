$ErrorActionPreference='Stop'
$root='E:\SimScopeData\Backups\FarmplastPayroll'
$log=Join-Path $root ('logs\weekly-'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')+'.log')
& 'C:\Program Files\nodejs\node.exe' (Join-Path $root 'scripts\weekly-payroll.mjs') *> $log
exit $LASTEXITCODE
