# Operation-scoped USB setup. Never starts a server, rotates an old key, or commits a replacement.
param([string]$Port,[string]$Manifest=(Join-Path $PSScriptRoot 'replacement-bootstrap.json'))
$ErrorActionPreference='Stop'
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
if($PSVersionTable.PSEdition -eq 'Desktop'){$env:PSModulePath="$env:SystemRoot\System32\WindowsPowerShell\v1.0\Modules;"+$env:PSModulePath}
$serial=$null;$password=$null;$profile=$null;$cap=$null
function Protect-Text([string]$text){return ConvertFrom-SecureString (ConvertTo-SecureString $text -AsPlainText -Force)}
function Unprotect-Text([string]$text){$s=ConvertTo-SecureString $text.Trim();$p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s);try{return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($p)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p)}}
function Get-OtaSequenceCrc([byte[]]$bytes){
  # ESP-IDF bootloader_common_ota_select_crc: esp_rom_crc32_le(UINT32_MAX, seq, 4).
  [uint32]$crc=0
  foreach($b in $bytes){$crc=$crc -bxor $b;for($j=0;$j -lt 8;$j++){if($crc -band 1){$crc=($crc -shr 1) -bxor [uint32]3988292384}else{$crc=$crc -shr 1}}}
  return ($crc -bxor [uint32]::MaxValue)
}
function Get-BootApplicationAddress([byte[]]$backup,[int]$metadataOffset){
  $valid=@();$erased=$true
  foreach($offset in @($metadataOffset,($metadataOffset+4096))){
    $sequence=[BitConverter]::ToUInt32($backup,$offset);$state=[BitConverter]::ToUInt32($backup,$offset+24);$crc=[BitConverter]::ToUInt32($backup,$offset+28)
    foreach($b in $backup[$offset..($offset+31)]){if($b -ne 255){$erased=$false}}
    if($sequence -gt 0 -and $sequence -lt [uint32]::MaxValue -and $state -notin @(3,4) -and $crc -eq (Get-OtaSequenceCrc $backup[$offset..($offset+3)])){$valid+=@{sequence=$sequence;state=$state}}
  }
  if(-not $valid.Count){if($erased){return '0x10000'};throw 'OTA metadata is invalid. Backup retained; no firmware written.'}
  $chosen=$valid|Sort-Object { $_.sequence } -Descending|Select-Object -First 1
  if($chosen.state -in @(0,1)){throw 'A previous OTA boot is still unvalidated. Resolve or roll back that boot before USB replacement.'}
  if((($chosen.sequence-1)%2) -eq 0){return '0x10000'}else{return '0x150000'}
}
function Api([string]$method,[string]$suffix,$body=$null){
  $args=@{Uri=($script:origin+'/workstation/replacements/'+$script:op+$suffix);Method=$method;Headers=@{Authorization='Bearer '+$script:cap};TimeoutSec=25;UseBasicParsing=$true}
  if($null -ne $body){$args.ContentType='application/json';$args.Body=$body|ConvertTo-Json -Depth 6 -Compress}
  return Invoke-RestMethod @args
}
function Open-Serial {
  $script:serial=New-Object IO.Ports.SerialPort($Port,115200,[IO.Ports.Parity]::None,8,[IO.Ports.StopBits]::One)
  $script:serial.DtrEnable=$false;$script:serial.RtsEnable=$false;$script:serial.ReadTimeout=1000;$script:serial.WriteTimeout=6000;$script:serial.NewLine="`n";$script:serial.Open()
}
function Read-Identity {
  $serial.DiscardInBuffer()
  Write-Host 'Release IO0, press EN on the ESP32, then press ENTER here.' -ForegroundColor Cyan
  $null=Read-Host
  $log='';$until=(Get-Date).AddSeconds(25)
  while((Get-Date) -lt $until){try{$log+=$serial.ReadLine();if($log -match '(PA-CLIM-[A-F0-9]{12})' -and $log -match '(pa-climate-msi-2\.[01]\.[A-Za-z0-9._-]+)' -and $log.Contains('PA-ESP32-WROOM32E-N4-R1')){return @{device_id=[regex]::Match($log,'PA-CLIM-[A-F0-9]{12}').Value;firmware=[regex]::Match($log,'pa-climate-msi-2\.[01]\.[A-Za-z0-9._-]+').Value;model='PA-ESP32-WROOM32E-N4-R1'}}}catch [TimeoutException]{}}
  throw 'Compatible firmware identity not received. No credentials issued. Check USB-UART and reset with IO0 released.'
}
function Find-Esptool {
  $cmd=Get-Command esptool -ErrorAction SilentlyContinue;if($cmd){return $cmd.Source}
  $cliCmd=Get-Command arduino-cli -ErrorAction SilentlyContinue
  $cli=if($cliCmd){$cliCmd.Source}else{Join-Path $script:root 'tools\arduino-cli\arduino-cli.exe'}
  if(-not(Test-Path -LiteralPath $cli)){
    $dest=Split-Path -Parent $cli;New-Item -ItemType Directory -Force -Path $dest|Out-Null
    $release=Invoke-RestMethod 'https://api.github.com/repos/arduino/arduino-cli/releases/latest'
    $asset=@($release.assets|Where-Object {$_.name -match '_Windows_64bit\.zip$'});if($asset.Count -ne 1){throw 'Official Arduino CLI asset unavailable'}
    $digest=[string]$asset[0].digest
    if($digest -notmatch '^sha256:[a-fA-F0-9]{64}$'){
      $checks=@($release.assets|Where-Object {$_.name -match '-checksums\.txt$'});if($checks.Count -ne 1){throw 'Official tool checksum unavailable'}
      $sum=(Invoke-WebRequest $checks[0].browser_download_url -UseBasicParsing).Content
      $line=@($sum -split "`n"|Where-Object {$_ -match ([regex]::Escape($asset[0].name)+'\s*$')});if($line.Count -ne 1){throw 'Tool checksum entry missing'}
      $digest='sha256:'+([regex]::Match($line[0],'(?i)^[a-f0-9]{64}').Value)
    }
    $zip=Join-Path $dest 'official-cli.zip';Invoke-WebRequest $asset[0].browser_download_url -UseBasicParsing -OutFile $zip
    if((Get-FileHash -LiteralPath $zip).Hash -ne $digest.Substring(7)){throw 'Official Arduino CLI SHA256 mismatch'}
    Expand-Archive -LiteralPath $zip -DestinationPath $dest -Force;Remove-Item -LiteralPath $zip
  }
  & $cli core install 'esp32:esp32@3.3.8' --additional-urls 'https://espressif.github.io/arduino-esp32/package_esp32_index.json' | Out-Host
  if($LASTEXITCODE -ne 0){throw 'Official ESP32 tools installation failed'}
  $config=(& $cli config dump --format json)|ConvertFrom-Json
  $tools=Join-Path ([string]$config.directories.data) 'packages\esp32\tools\esptool_py'
  $exe=@(Get-ChildItem -LiteralPath $tools -Filter 'esptool.exe' -Recurse -File|Sort-Object FullName -Descending)
  if(-not $exe.Count){throw 'Official esptool executable not found'};return $exe[0].FullName
}
try {
  $b=Get-Content -LiteralPath $Manifest -Raw -Encoding UTF8|ConvertFrom-Json
  $u=[Uri]([string]$b.public_origin);if($u.Scheme -ne 'https' -or $u.Port -ne 443 -or $u.UserInfo -or $u.Query -or $u.Fragment -or $u.AbsolutePath -ne '/climate'){throw 'Invalid HTTPS server origin'}
  if([string]$b.operation_id -notmatch '^[a-f0-9-]{36}$'){throw 'Invalid operation identity'}
  $script:origin=$u.AbsoluteUri.TrimEnd('/');$script:op=[string]$b.operation_id
  $script:root=Join-Path $env:LOCALAPPDATA 'Farmplast\PAClimate';$privateDir=Join-Path $root ('replacements\'+$op)
  New-Item -ItemType Directory -Path $privateDir -Force|Out-Null
  $me=[Security.Principal.WindowsIdentity]::GetCurrent().Name
  & icacls.exe $privateDir '/inheritance:r' '/grant:r' ($me+':(OI)(CI)F') 'SYSTEM:(OI)(CI)F'|Out-Null
  if($LASTEXITCODE -ne 0){throw 'Private DPAPI directory ACL failed'}
  $probe=[Guid]::NewGuid().ToString();if((Unprotect-Text (Protect-Text $probe)) -ne $probe){throw 'Windows DPAPI unavailable; no registration attempted'}
  $capFile=Join-Path $privateDir 'operation.dpapi'
  if($b.operation_token){[IO.File]::WriteAllText($capFile,(Protect-Text ([string]$b.operation_token)),[Text.Encoding]::ASCII)}
  if(-not(Test-Path -LiteralPath $capFile)){throw 'Operation capability missing. Download the installer again from Farmplast.'}
  $script:cap=Unprotect-Text ([IO.File]::ReadAllText($capFile))
  $state=Api 'GET' ''
  Write-Host ("Zone: {0}; current controller: {1}; expected new controller: {2}" -f $state.zone_name,$state.old_device_id,$state.expected_device_id)
  if($state.status -eq 'ready'){Write-Host 'USB setup already confirmed ONLINE/OFF. Return to the website to confirm replacement.' -ForegroundColor Green;return}
  $health=Invoke-RestMethod ($origin+'/healthz') -UseBasicParsing -TimeoutSec 15
  if($health.service -ne 'farmplast-pa-climate'){throw 'MSI HTTPS health check failed'}
  if(-not $Port){$ports=@([IO.Ports.SerialPort]::GetPortNames()|Sort-Object);if($ports.Count -eq 0){throw 'Connect the ESP32 by USB-UART.'};if($ports.Count -eq 1){$Port=$ports[0]}else{Write-Host ($ports -join ', ');$Port=Read-Host 'Select COM port';if($Port -notin $ports){throw 'Unknown COM port'}}}
  Open-Serial;$identity=Read-Identity
  if($state.expected_device_id -and $identity.device_id -ne $state.expected_device_id){throw 'Wrong physical MAC. No credentials issued.'}
  Write-Host ('Detected '+$identity.device_id+' / '+$identity.firmware)
  if($identity.firmware -notmatch '^pa-climate-msi-2\.1\.[0-9]+(?:[._-].*)?$'){
    $serial.Close();$serial.Dispose();$serial=$null
    $image=Join-Path $PSScriptRoot 'firmware.bin'
    if((Get-FileHash -LiteralPath $image).Hash -ne ([string]$b.firmware_sha256)){throw 'Installer firmware SHA256 mismatch'}
    if((Read-Host 'Safe staged replacement needs firmware 2.1.0. Disconnect heating power; type UPDATE to back up all 4 MB and update only the application') -cne 'UPDATE'){throw 'No firmware changed'}
    $esp=Find-Esptool
    Write-Host 'Hold IO0, press EN, release IO0. Press ENTER when the ESP32 is in download mode.';$null=Read-Host
    $previousPreference=$ErrorActionPreference;$ErrorActionPreference='Continue';try{$ver=(& $esp version 2>&1|Out-String)}finally{$ErrorActionPreference=$previousPreference};$modern=$ver -match '(?i)(?:esptool\s+v?|version\s+)[5-9]\.'
    $before=if($modern){'no-reset'}else{'no_reset'}
    function Esp([string]$verb,[string[]]$extra){$command=if($modern){$verb}else{$verb.Replace('-','_')};if(-not $modern){$extra=@($extra|ForEach-Object {if($_.StartsWith('--')){'--'+$_.Substring(2).Replace('-','_')}else{$_}})};$previous=$ErrorActionPreference;$ErrorActionPreference='Continue';try{$output=(& $esp --chip esp32 --port $Port --before $before --after $before $command @extra 2>&1|Out-String);$result=$LASTEXITCODE}finally{$ErrorActionPreference=$previous};if($result -ne 0){throw ('Espressif tool failed: '+$command)};return $output}
    $mac=Esp 'read-mac' @();$expected=$identity.device_id.Substring(8);$flat=([regex]::Match($mac,'(?i)([a-f0-9]{2}:){5}[a-f0-9]{2}').Value).Replace(':','').ToUpperInvariant()
    if($flat -ne $expected){throw 'ROM MAC differs from application identity; no flash written'}
    $backup=Join-Path $privateDir ('flash-backup-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.bin');$null=Esp 'read-flash' @('0x0','0x400000',$backup)
    if((Get-Item -LiteralPath $backup).Length -ne 4194304){throw 'Full flash backup failed'}
    $bytes=[IO.File]::ReadAllBytes($backup);$ota0=$false;$ota1=$false;$metadataOffset=-1
    for($i=0x8000;$i -lt 0x8c00;$i+=32){if([BitConverter]::ToUInt16($bytes,$i) -ne 0x50aa){break};if($bytes[$i+2] -eq 0 -and $bytes[$i+3] -eq 16 -and [BitConverter]::ToUInt32($bytes,$i+4) -eq 0x10000 -and [BitConverter]::ToUInt32($bytes,$i+8) -eq 0x140000){$ota0=$true};if($bytes[$i+2] -eq 0 -and $bytes[$i+3] -eq 17 -and [BitConverter]::ToUInt32($bytes,$i+4) -eq 0x150000){$ota1=$true};if($bytes[$i+2] -eq 1 -and $bytes[$i+3] -eq 0 -and [BitConverter]::ToUInt32($bytes,$i+8) -ge 8192){$metadataOffset=[int][BitConverter]::ToUInt32($bytes,$i+4)}}
    if(-not($ota0 -and $ota1) -or $metadataOffset -lt 0 -or ($metadataOffset+8192) -gt $bytes.Length){throw 'Incompatible partition layout. Backup saved; no write attempted.'}
    # Select the currently booted OTA application slot; retain NVS and OTA metadata.
    $address=Get-BootApplicationAddress $bytes $metadataOffset
    $null=Esp 'write-flash' @('--flash-mode','keep','--flash-freq','keep','--flash-size','keep',$address,$image)
    $readback=Join-Path $privateDir 'application-readback.bin';$null=Esp 'read-flash' @($address,([string](Get-Item -LiteralPath $image).Length),$readback)
    if((Get-FileHash -LiteralPath $readback).Hash -ne ([string]$b.firmware_sha256)){throw 'Application readback SHA256 failed; backup retained'}
    Open-Serial;$identity=Read-Identity
    if($identity.device_id -ne ('PA-CLIM-'+$expected) -or $identity.firmware -ne $b.firmware_version){throw 'Updated firmware identity mismatch'}
  }
  $wifiFile=Join-Path $env:APPDATA 'Farmplast\PAClimate\wifi.dpapi.json'
  if(Test-Path -LiteralPath $wifiFile){$wifi=Get-Content -LiteralPath $wifiFile -Raw|ConvertFrom-Json;$ssid=[string]$wifi.ssid;$password=Unprotect-Text ([string]$wifi.dpapi)}
  else{$ssid=if($identity.device_id -eq 'PA-CLIM-209BA98DBF90'){'Kinetic_900085'}else{(Read-Host 'Target ESP32 Wi-Fi SSID').Trim()};$secure=Read-Host ('Wi-Fi password for '+$ssid+' (saved using DPAPI)') -AsSecureString;$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure);try{$password=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)};New-Item -ItemType Directory -Path (Split-Path -Parent $wifiFile) -Force|Out-Null;@{ssid=$ssid;dpapi=Protect-Text $password}|ConvertTo-Json|Set-Content -LiteralPath $wifiFile -Encoding UTF8}
  if($ssid.Length -lt 1 -or $ssid.Length -gt 32 -or $password.Length -lt 8 -or $password.Length -gt 63){throw 'Invalid saved target Wi-Fi details'}
  Write-Host ('ESP32 target Wi-Fi: '+$ssid+'. This PC need not be connected to that Wi-Fi.')
  $tcp=New-Object Net.Sockets.TcpClient($u.DnsSafeHost,443)
  try{$tls=New-Object Net.Security.SslStream($tcp.GetStream(),$false);try{$tls.AuthenticateAsClient($u.DnsSafeHost);$cert=New-Object Security.Cryptography.X509Certificates.X509Certificate2($tls.RemoteCertificate);$chain=New-Object Security.Cryptography.X509Certificates.X509Chain;$chain.ChainPolicy.RevocationMode=[Security.Cryptography.X509Certificates.X509RevocationMode]::Online;if(-not $chain.Build($cert)){throw 'TLS chain validation failed'};$ca=$chain.ChainElements[$chain.ChainElements.Count-1].Certificate;if($ca.Subject -ne $ca.Issuer){throw 'Trusted TLS root unavailable'};$base64=[Convert]::ToBase64String($ca.RawData);$pem="-----BEGIN CERTIFICATE-----`n"+([regex]::Replace($base64,'.{1,64}',{"$($args[0].Value)`n"}))+"-----END CERTIFICATE-----`n"}finally{$tls.Dispose()}}finally{$tcp.Dispose()}
  $profile=Api 'POST' '/prepare' $identity
  [IO.File]::WriteAllText((Join-Path $privateDir 'device-profile.dpapi'),(Protect-Text ($profile|ConvertTo-Json -Compress)),[Text.Encoding]::ASCII)
  $packet=@{device_id=$profile.device_id;ssid=$ssid;password=$password;exchange_url=$origin+'/v1/exchange';token=$profile.device_token;ota_hmac_key=$profile.ota_hmac_key;root_ca_pem=$pem}|ConvertTo-Json -Compress
  $serial.WriteLine('FP1:'+([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($packet))))
  $until=(Get-Date).AddSeconds(30);$acked=$false
  while((Get-Date) -lt $until){try{$line=$serial.ReadLine().Trim();if($line -eq 'FP_PROVISION_OK'){$acked=$true;break};if($line -eq 'FP_PROVISION_FAILED'){throw 'Controller rejected USB provisioning'}}catch [TimeoutException]{}}
  if(-not $acked){throw 'USB acknowledgement pending. Run this same installer to resume; keys will not rotate.'}
  Write-Host 'USB PROVISION PASS. Waiting for authenticated MSI telemetry; no replacement committed.' -ForegroundColor Green
  $serial.Close();$serial.Dispose();$serial=$null;$profile=$null;$packet=$null;$password=$null
  for($i=0;$i -lt 20;$i++){Start-Sleep -Seconds 3;$state=Api 'GET' '';if($state.status -eq 'ready'){Write-Host 'MSI ONLINE / OFF / target ACK confirmed. Return to Programming and explicitly confirm the replacement.' -ForegroundColor Green;return}}
  Write-Host 'USB provisioning complete; MSI acknowledgement is pending. Connect the ESP32 to its target Wi-Fi, then resume. The website will not commit an offline replacement.' -ForegroundColor Yellow
}finally{if($serial){try{$serial.Close()}catch{};$serial.Dispose()};$password=$null;$profile=$null;$script:cap=$null}
