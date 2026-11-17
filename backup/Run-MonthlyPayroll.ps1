$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath('E:/SimScopeData/Backups/FarmplastPayroll')
if($root -ne 'E:\SimScopeData\Backups\FarmplastPayroll'){throw 'Unexpected backup root'}
$log=Join-Path $root ('logs\run-'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')+'.log')
& 'C:\Program Files\nodejs\node.exe' (Join-Path $root 'scripts\monthly-payroll.mjs') --ensure-month *> $log
$taskExit=$LASTEXITCODE
exit $taskExit

