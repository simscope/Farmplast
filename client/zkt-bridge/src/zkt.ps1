$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
$ip = [string]$request.ip
$port = [int]$request.port
$machine = [int]$request.machine
$zk = $null
$disabled = $false
$answer = $null
try {
    $zk = New-Object -ComObject zkemkeeper.ZKEM
    if (!$zk.Connect_Net($ip, $port)) { throw 'ZKT SDK Connect_Net failed' }
    try { $zk.EnableDevice($machine, $false) | Out-Null; $disabled = $true } catch {}
    switch ([string]$request.operation) {
        'test' {
            $users=0; $logs=0; $serial=''; $firmware=''
            try { $zk.GetDeviceStatus($machine,2,[ref]$users) | Out-Null } catch {}
            try { $zk.GetDeviceStatus($machine,6,[ref]$logs) | Out-Null } catch {}
            try { $zk.GetSerialNumber($machine,[ref]$serial) | Out-Null } catch {}
            try { $zk.GetFirmwareVersion($machine,[ref]$firmware) | Out-Null } catch {}
            $answer=@{ok=$true;message='ZKT official SDK connection OK';device=@{ip=$ip;port=$port;machine=$machine};info=@{userCount=$users;logCount=$logs;serialNumber=$serial;firmware=$firmware}}
        }
        'sync_one_employee' {
            $u=$request.user; $card=$true
            if ([string]$u.cardNo -ne '') { try { $card=$zk.SetStrCardNumber([string]$u.cardNo) } catch { $card=$false } }
            $set=$zk.SSR_SetUserInfo($machine,[string]$u.userId,[string]$u.name,[string]$u.password,[int]$u.privilege,[bool]$u.enabled)
            $refresh=$false; try { $refresh=$zk.RefreshData($machine) } catch {}
            $code=0; if(!$set){try{$zk.GetLastError([ref]$code)|Out-Null}catch{}}
            $answer=@{ok=[bool]$set;message=$(if($set){'SSR_SetUserInfo OK'}else{'SSR_SetUserInfo failed'});errorCode=$code;user=@{userId=$u.userId;name=$u.name;passwordSet=([string]$u.password -ne '');privilege=$u.privilege;cardNo=$u.cardNo;enabled=$u.enabled};sdk=@{cardResult=[bool]$card;setResult=[bool]$set;refreshResult=[bool]$refresh}}
        }
        'pull_attendance' {
            $rows=New-Object 'System.Collections.Generic.List[object]'
            $read=$zk.ReadGeneralLogData($machine)
            if($read){
                $enroll='';$verify=0;$direction=0;$year=0;$month=0;$day=0;$hour=0;$minute=0;$second=0;$work=0
                while($zk.SSR_GetGeneralLogData($machine,[ref]$enroll,[ref]$verify,[ref]$direction,[ref]$year,[ref]$month,[ref]$day,[ref]$hour,[ref]$minute,[ref]$second,[ref]$work)){
                    $stamp='{0:D4}-{1:D2}-{2:D2} {3:D2}:{4:D2}:{5:D2}' -f $year,$month,$day,$hour,$minute,$second
                    $rows.Add(@{userId=[string]$enroll;deviceUserId=[string]$enroll;timestamp=$stamp;verifyMode=[int]$verify;inOutMode=[int]$direction;workCode=[int]$work})
                    $enroll='';$verify=0;$direction=0;$year=0;$month=0;$day=0;$hour=0;$minute=0;$second=0;$work=0
                }
            }
            $code=0;if(!$read){try{$zk.GetLastError([ref]$code)|Out-Null}catch{}}
            $answer=@{ok=[bool]$read;message=$(if($read){'Attendance logs read OK'}else{'ReadGeneralLogData failed'});errorCode=$code;count=$rows.Count;logs=@($rows.ToArray())}
        }
        default { throw 'Unknown SDK operation' }
    }
} catch {
    $code=0;if($zk){try{$zk.GetLastError([ref]$code)|Out-Null}catch{}}
    $answer=@{ok=$false;error=$_.Exception.Message;errorCode=$code;device=@{ip=$ip;port=$port;machine=$machine}}
} finally {
    if($zk){
        if($disabled){try{$zk.EnableDevice($machine,$true)|Out-Null}catch{}}
        try{$zk.Disconnect()|Out-Null}catch{}
        try{[Runtime.InteropServices.Marshal]::FinalReleaseComObject($zk)|Out-Null}catch{}
    }
}
$answer | ConvertTo-Json -Depth 30 -Compress
