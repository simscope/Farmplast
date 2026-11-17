[CmdletBinding()]
param(
 [string]$PackageRoot=$PSScriptRoot,
 [ValidatePattern('^COM[1-9][0-9]*$')][string]$Port,
 [switch]$Install,[switch]$BoardConfirmed,[switch]$SourceConfirmed
)
$ErrorActionPreference='Stop'
$manifest=Get-Content -LiteralPath (Join-Path $PackageRoot 'manifest.json') -Raw|ConvertFrom-Json
if($manifest.version-ne'barrels-msi-2'-or$manifest.physical_flash_bytes-ne16777216-or$manifest.app_offset-ne65536-or$manifest.app_partition_size-ne3145728){throw 'Unexpected onsite package target'}
foreach($file in $manifest.files){
 if($file.name-notmatch'^[a-zA-Z0-9_.-]+$'){throw 'Unsafe package filename'}
 $path=Join-Path $PackageRoot $file.name
 if((Get-Item -LiteralPath $path).Length-ne$file.bytes-or(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()-ne$file.sha256){throw 'Package integrity check failed'}
}
Write-Output 'Onsite package verified: barrels-msi-2, physical flash 16MB, existing logical profile/partition table preserved.'
if(-not$Install){Write-Output 'Offline verification only; no serial port opened.';return}
if(-not$Port-or-not$BoardConfirmed-or-not$SourceConfirmed){throw 'Explicit COM port and confirmed physical board/source mapping are required'}
$backup=Get-Item -LiteralPath $manifest.backup_file
if($backup.Length-ne16777216-or(Get-FileHash -LiteralPath $backup.FullName -Algorithm SHA256).Hash.ToLowerInvariant()-ne$manifest.backup_sha256){throw 'Complete verified recovery backup is required'}
$recoveryRoot=$backup.DirectoryName
$recoveryAcl=Get-Acl -LiteralPath $recoveryRoot
if(-not$recoveryAcl.AreAccessRulesProtected){throw 'Recovery directory must have private protected permissions'}
$tool=Join-Path $PackageRoot 'esptool.exe'
$connection=@('--chip','esp32s3','--port',$Port,'--baud','460800')
function Invoke-Esp([string[]]$ToolArgs){
 $output=& $tool @connection @ToolArgs 2>&1
 if($LASTEXITCODE-ne0){
  $output|Where-Object {$_-notmatch'(?i)MAC:|[0-9a-f]{2}(:[0-9a-f]{2}){5}'}|Select-Object -Last 12|Write-Output
  throw 'esptool failed; stop and retain the recovery backup'
 }
 return ($output-join "`n")
}
$identity=Invoke-Esp -ToolArgs @('flash-id')
if($identity-notmatch'Detected flash size:\s*16MB'){throw 'Physical flash size does not match this controller'}
$security=Invoke-Esp -ToolArgs @('get-security-info')
if($security-notmatch'Secure Boot:\s*Disabled'-or$security-notmatch'Flash Encryption:\s*Disabled'){throw 'Hardware security requires a separate signed/encrypted deployment plan'}
$prefixPath=Join-Path $recoveryRoot 'prefix-before-install.bin'
$null=Invoke-Esp -ToolArgs @('read-flash','--no-progress','0','36864',$prefixPath)
$prefix=[IO.File]::ReadAllBytes($prefixPath)
$expectedTable=[IO.File]::ReadAllBytes((Join-Path $PackageRoot 'partitions.bin'))
if($prefix.Length-ne36864){throw 'Incomplete current boot/partition inspection'}
$hasher=[Security.Cryptography.SHA256]::Create()
try{
 $bootHash=([BitConverter]::ToString($hasher.ComputeHash($prefix,0,$manifest.bootloader_bytes))).Replace('-','').ToLowerInvariant()
 if($bootHash-ne$manifest.bootloader_sha256){throw 'Connected bootloader differs from the recovery backup'}
 for($i=0;$i-lt$expectedTable.Length;$i++){if($prefix[0x8000+$i]-ne$expectedTable[$i]){throw 'Installed partition layout changed; no write performed'}}
 $oldFlash=[IO.File]::ReadAllBytes($backup.FullName)
 $rollback=New-Object byte[] $manifest.rollback_app_bytes
 [Array]::Copy($oldFlash,65536,$rollback,0,$rollback.Length)
 $rollbackHash=([BitConverter]::ToString($hasher.ComputeHash($rollback))).Replace('-','').ToLowerInvariant()
 if($rollbackHash-ne$manifest.rollback_app_sha256){throw 'Original application recovery image is invalid'}
 $rollbackPath=Join-Path $recoveryRoot 'rollback-application.bin'
 [IO.File]::WriteAllBytes($rollbackPath,$rollback)
}finally{$hasher.Dispose()}
$null=Invoke-Esp -ToolArgs @('verify-flash','0x10000',$rollbackPath)
Write-Output 'Connected application, bootloader and partition table match the private recovery backup.'
$application=Join-Path $PackageRoot 'application.bin'
if((Get-Item -LiteralPath $application).Length-gt($manifest.app_partition_size-65536)){throw 'Insufficient application partition headroom'}
# Only this application range is written. Bootloader, partition table, otadata,
# NVS, SPIFFS, calibration and the unused physical flash remain in place.
Write-Output 'Writing application only at 0x10000.'
$write=Invoke-Esp -ToolArgs @('write-flash','--no-progress','--flash-mode','keep','--flash-freq','keep','--flash-size','keep','0x10000',$application)
$null=Invoke-Esp -ToolArgs @('verify-flash','0x10000',$application)
$afterPath=Join-Path $recoveryRoot 'prefix-after-install.bin'
$null=Invoke-Esp -ToolArgs @('read-flash','--no-progress','0','36864',$afterPath)
$after=[IO.File]::ReadAllBytes($afterPath)
if($after.Length-ne$prefix.Length){throw 'Post-write prefix inspection failed'}
for($i=0;$i-lt$prefix.Length;$i++){if($after[$i]-ne$prefix[$i]){throw 'Boot/partition prefix changed unexpectedly'}}
$receipt=[ordered]@{version=$manifest.version;port=$Port;application_sha256=(Get-FileHash -LiteralPath $application -Algorithm SHA256).Hash.ToLowerInvariant();verified=$true;boot_partition_prefix_unchanged=$true;full_backup_sha256=$manifest.backup_sha256;written_at_utc=(Get-Date).ToUniversalTime().ToString('o')}
[IO.File]::WriteAllText((Join-Path $PackageRoot 'programming-receipt.json'),($receipt|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
Write-Output 'Application written and verified. Original bootloader/partition prefix is unchanged; controller restarted.'
