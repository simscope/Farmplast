$ErrorActionPreference='Stop'
$root='E:\SimScopeData\Farmplast\PayrollStandby'
$identity=New-Object Security.Principal.NTAccount('NT AUTHORITY\LOCAL SERVICE')
$rootAcl=Get-Acl -LiteralPath $root
$rootAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($identity,'ReadAndExecute','None','None','Allow')))
Set-Acl -LiteralPath $root -AclObject $rootAcl
foreach($folder in @('scripts','runtime','releases','app','logs')){
 $target=Join-Path $root $folder
 New-Item -ItemType Directory -Path $target -Force|Out-Null
 $acl=Get-Acl -LiteralPath $target
 $rights=if($folder -eq 'logs'){'Modify'}else{'ReadAndExecute'}
 $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($identity,$rights,'ContainerInherit,ObjectInherit','None','Allow')))
 Set-Acl -LiteralPath $target -AclObject $acl
}
$taskName='Farmplast-Payroll-Standby-Gateway'
if(Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue){throw 'Existing gateway task requires review'}
$action=New-ScheduledTaskAction -Execute 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -Argument ('-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+(Join-Path $root 'scripts\Run-StandbyGateway.ps1')+'"') -WorkingDirectory $root
$trigger=New-ScheduledTaskTrigger -AtStartup
$principal=New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\LOCAL SERVICE' -LogonType ServiceAccount
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings|Out-Null
Start-ScheduledTask -TaskName $taskName
Export-ScheduledTask -TaskName $taskName|Set-Content -LiteralPath (Join-Path $root 'runtime\gateway-task.xml') -Encoding UTF8
