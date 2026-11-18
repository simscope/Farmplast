$ErrorActionPreference='Stop'
$root='C:\ProgramData\Farmplast\PayrollMsiReserve'
if(Test-Path -LiteralPath (Join-Path $root 'prepared.json')){throw 'Existing preparation requires review; do not overwrite rollback files'}
New-Item -ItemType Directory -Path $root -Force|Out-Null
$acl=New-Object Security.AccessControl.DirectorySecurity
$acl.SetAccessRuleProtection($true,$false)
foreach($sid in @('S-1-5-18','S-1-5-32-544',[Security.Principal.WindowsIdentity]::GetCurrent().User.Value)){
 $identity=New-Object Security.Principal.SecurityIdentifier($sid)
 $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($identity,'FullControl','ContainerInherit,ObjectInherit','None','Allow')))
}
Set-Acl -LiteralPath $root -AclObject $acl
$items=@(
 @{Service='ZKTBridge';Config='C:\Program Files (x86)\ZKTBridge\.env';Name='bulk'},
 @{Service='ZKTAttendance';Config='C:\Program Files (x86)\ZKTBridge\attendance\.env';Name='attendance'}
)
$manifest=@()
foreach($item in $items){
 $params=Get-ItemProperty ('HKLM:\SYSTEM\CurrentControlSet\Services\'+$item.Service+'\Parameters')
 $params|Export-Clixml -LiteralPath (Join-Path $root ($item.Name+'-service.xml'))
 Copy-Item -LiteralPath $item.Config -Destination (Join-Path $root ($item.Name+'-cloud.env'))
 $manifest+=@{service=$item.Service;config=$item.Config;name=$item.Name;configHash=(Get-FileHash -LiteralPath $item.Config -Algorithm SHA256).Hash;application=$params.Application;binaryHash=(Get-FileHash -LiteralPath $params.Application -Algorithm SHA256).Hash;state=(Get-Service $item.Service).Status.ToString()}
}
$data=@{host=$env:COMPUTERNAME;preparedAt=[DateTime]::UtcNow.ToString('o');services=$manifest;activeBackend='Supabase'}|ConvertTo-Json -Depth 6
[IO.File]::WriteAllText((Join-Path $root 'prepared.json'),$data,(New-Object Text.UTF8Encoding($false)))
Write-Output 'NJ_ROLLBACK_FILES_PREPARED; PRODUCTION_UNCHANGED'
