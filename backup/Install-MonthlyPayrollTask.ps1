$ErrorActionPreference='Stop'
$root='E:\SimScopeData\Backups\FarmplastPayroll'
$runner=Join-Path $root 'scripts\Run-MonthlyPayroll.ps1'
if(-not (Test-Path -LiteralPath $runner)){throw 'Backup runner is missing'}
$start=Get-Date -Year (Get-Date).Year -Month (Get-Date).Month -Day 1 -Hour 3 -Minute 0 -Second 0
if($start -lt (Get-Date)){$start=$start.AddMonths(1)}
$boundary=$start.ToString('yyyy-MM-ddTHH:mm:ss')
$xml=@"
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
 <RegistrationInfo><Description>Encrypted monthly Supabase Payroll backup to MSI. Keep all verified snapshots. Production stays on Supabase.</Description></RegistrationInfo>
 <Triggers><CalendarTrigger><StartBoundary>$boundary</StartBoundary><Enabled>true</Enabled><ScheduleByMonth><DaysOfMonth><Day>1</Day></DaysOfMonth><Months><January/><February/><March/><April/><May/><June/><July/><August/><September/><October/><November/><December/></Months></ScheduleByMonth></CalendarTrigger></Triggers>
 <Principals><Principal id="System"><UserId>S-1-5-18</UserId><RunLevel>HighestAvailable</RunLevel></Principal></Principals>
 <Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><AllowHardTerminate>false</AllowHardTerminate><StartWhenAvailable>true</StartWhenAvailable><RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable><Enabled>true</Enabled><Hidden>false</Hidden><ExecutionTimeLimit>PT2H</ExecutionTimeLimit><Priority>7</Priority><RestartOnFailure><Interval>PT30M</Interval><Count>2</Count></RestartOnFailure></Settings>
 <Actions Context="System"><Exec><Command>C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe</Command><Arguments>-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$runner"</Arguments><WorkingDirectory>$root</WorkingDirectory></Exec></Actions>
</Task>
"@
$task=Get-ScheduledTask -TaskName 'Farmplast-Payroll-Monthly-Backup' -ErrorAction SilentlyContinue
if($task){throw 'Existing backup task found; inspect rather than replace it'}
Register-ScheduledTask -TaskName 'Farmplast-Payroll-Monthly-Backup' -Xml $xml|Out-Null
Export-ScheduledTask -TaskName 'Farmplast-Payroll-Monthly-Backup'|Set-Content -LiteralPath (Join-Path $root 'task.xml') -Encoding UTF8
Get-ScheduledTaskInfo -TaskName 'Farmplast-Payroll-Monthly-Backup'|Select-Object NextRunTime,LastTaskResult|ConvertTo-Json -Compress
