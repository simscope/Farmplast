$ErrorActionPreference='Stop'
$root='E:\SimScopeData\Backups\FarmplastPayroll'
$runner=Join-Path $root 'scripts\Run-WeeklyPayroll.ps1'
if(-not (Test-Path -LiteralPath $runner)){throw 'Weekly backup runner is missing'}
$start=(Get-Date).Date.AddHours(3)
while($start.DayOfWeek -ne [DayOfWeek]::Monday -or $start -le (Get-Date)){$start=$start.AddDays(1)}
$boundary=$start.ToString('yyyy-MM-ddTHH:mm:ss')
$xml=@"
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
 <RegistrationInfo><Description>Weekly encrypted Supabase Payroll backup and isolated MSI standby refresh. Production remains on Supabase.</Description></RegistrationInfo>
 <Triggers><CalendarTrigger><StartBoundary>$boundary</StartBoundary><Enabled>true</Enabled><ScheduleByWeek><WeeksInterval>1</WeeksInterval><DaysOfWeek><Monday/></DaysOfWeek></ScheduleByWeek></CalendarTrigger></Triggers>
 <Principals><Principal id="System"><UserId>S-1-5-18</UserId><RunLevel>HighestAvailable</RunLevel></Principal></Principals>
 <Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><AllowHardTerminate>false</AllowHardTerminate><StartWhenAvailable>true</StartWhenAvailable><Enabled>true</Enabled><ExecutionTimeLimit>PT2H</ExecutionTimeLimit><RestartOnFailure><Interval>PT30M</Interval><Count>2</Count></RestartOnFailure></Settings>
 <Actions Context="System"><Exec><Command>C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe</Command><Arguments>-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$runner"</Arguments><WorkingDirectory>$root</WorkingDirectory></Exec></Actions>
</Task>
"@
if(Get-ScheduledTask -TaskName 'Farmplast-Payroll-Weekly-Backup' -ErrorAction SilentlyContinue){throw 'Existing weekly task requires review'}
Register-ScheduledTask -TaskName 'Farmplast-Payroll-Weekly-Backup' -Xml $xml|Out-Null
Disable-ScheduledTask -TaskName 'Farmplast-Payroll-Monthly-Backup'|Out-Null
Export-ScheduledTask -TaskName 'Farmplast-Payroll-Weekly-Backup'|Set-Content -LiteralPath (Join-Path $root 'weekly-task.xml') -Encoding UTF8
Get-ScheduledTaskInfo -TaskName 'Farmplast-Payroll-Weekly-Backup'|Select-Object NextRunTime,LastTaskResult|ConvertTo-Json -Compress
