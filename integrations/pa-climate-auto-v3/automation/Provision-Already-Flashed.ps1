# Farmplast Climate 2.0.1 — USB configuration of an already-flashed ESP32.
# Does not compile, erase, reflash, start a service or change the MSI server.
param([string]$Port='COM4')
$ErrorActionPreference='Stop'
$root=Join-Path $env:LOCALAPPDATA 'Farmplast\PAClimate'
$workstationFile=Join-Path $root 'workstation.dpapi'
$wifiFile=Join-Path $env:APPDATA 'Farmplast\PAClimate\wifi.dpapi.json'
$caFile=Join-Path $root 'climate-verified-root.pem'
$serial=$null
function Unprotect-Text([string]$cipher){
  $secure=ConvertTo-SecureString -String $cipher.Trim() -ErrorAction Stop
  $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try{return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)}
  finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
}
function Rest([string]$Method,[string]$Route,$Body=$null) {
  $args=@{Uri=($script:origin+$Route);Method=$Method;Headers=@{Authorization='Bearer '+$script:accessToken};TimeoutSec=15;ErrorAction='Stop';UseBasicParsing=$true}
  if($null -ne $Body){$args.ContentType='application/json';$args.Body=($Body|ConvertTo-Json -Depth 5 -Compress)}
  return Invoke-RestMethod @args
}
try {
  foreach($item in @($workstationFile,$wifiFile,$caFile)){
    if(-not(Test-Path -LiteralPath $item -PathType Leaf)){throw "Saved setup file missing: $item . Do not erase anything or reflash the ESP32."}
  }
  $ws=Unprotect-Text ([IO.File]::ReadAllText($workstationFile))
  $ws=$ws|ConvertFrom-Json
  $uri=[Uri]([string]$ws.origin)
  if($uri.Scheme -ne 'https' -or $uri.Port -ne 443 -or $uri.UserInfo -or $uri.AbsolutePath -ne '/climate' -or $uri.Query -or $uri.Fragment){
    throw 'Saved MSI endpoint is not valid HTTPS /climate'
  }
  if(([string]$ws.token).Length -lt 30){throw 'Saved workstation token invalid'}
  $script:origin=$uri.AbsoluteUri.TrimEnd('/')
  $script:accessToken=[string]$ws.token
  $wifi=Get-Content -LiteralPath $wifiFile -Raw -Encoding UTF8|ConvertFrom-Json
  $ssid=[string]$wifi.ssid
  $password=Unprotect-Text ([string]$wifi.dpapi)
  if($ssid.Length -lt 1 -or $ssid.Length -gt 32 -or $password.Length -lt 8 -or $password.Length -gt 63){throw 'Saved ESP32 Wi-Fi details invalid'}
  $ca=[IO.File]::ReadAllText($caFile).Trim()
  if($ca.Length -lt 100 -or $ca.Length -gt 3600 -or -not $ca.StartsWith('-----BEGIN CERTIFICATE-----') -or -not $ca.Contains('-----END CERTIFICATE-----')){
    throw 'Saved verified TLS CA certificate missing or invalid'
  }
  # ESP32 must be running the application, not the ROM download bootloader.
  $serial=New-Object System.IO.Ports.SerialPort($Port,115200,[System.IO.Ports.Parity]::None,8,[System.IO.Ports.StopBits]::One)
  $serial.ReadTimeout=900
  $serial.WriteTimeout=5000
  $serial.NewLine=[string][char]10
  $serial.DtrEnable=$false
  $serial.RtsEnable=$false
  $serial.Open()
  Start-Sleep -Milliseconds 200
  $serial.DiscardInBuffer()
  Write-Host "Serial connected to $Port. Release IO0. Briefly press EN on the ESP32, then ENTER here." -ForegroundColor Cyan
  $null=Read-Host 'ESP32 restarted (EN): press ENTER'
  $dev=$null
  $boot=$null
  $until=(Get-Date).AddSeconds(22)
  while((Get-Date) -lt $until) {
    try {
      $line=$serial.ReadLine().Trim()
      if($line -match '(PA-CLIM-[0-9A-F]{12})') {
        $dev=$Matches[1];$boot=$line;break
      }
    }catch [System.TimeoutException]{ }
  }
  if(-not $dev){throw "Could not read PA-CLIM device ID on $Port. Do not reflash. Ensure IO0 is released, and press EN while this script is listening."}
  if($boot -notmatch 'pa-climate-msi-2\.0\.1'){throw "Unexpected firmware: $boot . No credentials sent."}
  if($dev -eq 'PA-CLIM-70D38CA99B20'){throw 'Existing PA Climate Zone 1 must not be reprovisioned'}
  Write-Host "ESP32 detected: $dev, firmware 2.0.1" -ForegroundColor Green
  $zones=Rest 'GET' '/workstation/zones'
  $registered=@($zones.zones|Where-Object {$_.device_id -eq $dev})
  if($registered.Count -gt 1){throw 'MSI has conflicting device assignments. No credentials sent.'}
  if($registered.Count -eq 1 -and $registered[0].online){
    Write-Host "MSI already reports $dev ONLINE. No provisioning changes needed." -ForegroundColor Green
    return
  }
  $secretFile=Join-Path (Join-Path (Join-Path $root 'provisioning') $dev) 'device-secrets.dpapi'
  if(Test-Path -LiteralPath $secretFile){
    $creds=Unprotect-Text ([IO.File]::ReadAllText($secretFile))|ConvertFrom-Json
  }else{
    if($registered.Count -eq 1){throw 'Device registered on MSI but local DPAPI secret missing; do not rotate or issue another credential automatically.'}
    $creds=Rest 'POST' '/workstation/devices' @{device_id=$dev;model='PA-ESP32-WROOM32E-N4-R1'}
    $parent=Split-Path -Parent $secretFile
    New-Item -ItemType Directory -Path $parent -Force|Out-Null
    $protected=ConvertFrom-SecureString -SecureString (ConvertTo-SecureString ($creds|ConvertTo-Json -Depth 5 -Compress) -AsPlainText -Force)
    [IO.File]::WriteAllText($secretFile,$protected,[Text.Encoding]::ASCII)
    $protected=$null
  }
  if($creds.device_id -ne $dev -or $creds.zone_id -notmatch '^pa-zone-[1-9][0-9]*$' -or
     ([string]$creds.device_token).Length -lt 32 -or [string]$creds.ota_hmac_key -notmatch '^[a-fA-F0-9]{64}$'){
    throw 'MSI credentials do not belong to this ESP32 or are invalid'
  }
  $payload=@{
    device_id=$dev
    ssid=$ssid
    password=$password
    exchange_url=$script:origin+'/v1/exchange'
    token=[string]$creds.device_token
    ota_hmac_key=[string]$creds.ota_hmac_key
    root_ca_pem=$ca+[Environment]::NewLine
  }|ConvertTo-Json -Depth 5 -Compress
  $line='FP1:'+([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($payload)))
  if($line.Length -lt 104 -or $line.Length -gt 10000){throw 'Provisioning packet too large for firmware USB input'}
  Write-Host "Writing stored Wi-Fi and MSI credentials to $dev (zone $($creds.zone_id))..." -ForegroundColor Cyan
  $serial.WriteLine($line)
  $deadline=(Get-Date).AddSeconds(27)
  $acked=$false
  while((Get-Date) -lt $deadline) {
    try {
      $response=$serial.ReadLine().Trim()
      if($response -eq 'FP_PROVISION_OK'){$acked=$true;break}
      if($response -eq 'FP_PROVISION_FAILED'){throw 'ESP32 rejected provisioning packet. No reflash necessary.'}
    }catch [System.TimeoutException]{ }
  }
  if(-not $acked){throw 'ESP32 did not return FP_PROVISION_OK. Do not reflash; check USB serial and stored registration.'}
  Write-Host 'USB PROVISION PASS: ESP32 stored Wi-Fi/MSI credentials and is rebooting.' -ForegroundColor Green
  $serial.Close();$serial.Dispose();$serial=$null
  $payload=$null;$password=$null;$line=$null;$creds=$null
  for($i=0;$i -lt 3;$i++){
    Start-Sleep -Seconds 2
    try{
      $check=Rest 'GET' '/workstation/zones'
      $online=@($check.zones|Where-Object {$_.device_id -eq $dev -and $_.online -eq $true})
      if($online.Count -eq 1) {
        Write-Host "MSI ONLINE: $dev . Check T1/T2 on Farmplast site." -ForegroundColor Green
        return
      }
    }catch {}
  }
  Write-Host "USB provisioning successful; MSI ONLINE is pending. ESP32 needs saved Wi-Fi '$ssid' (2.4 GHz)." -ForegroundColor Yellow
}finally{
  $password=$null;$script:accessToken=$null
  if($serial){try{if($serial.IsOpen){$serial.Close()}}catch{};$serial.Dispose()}
}
