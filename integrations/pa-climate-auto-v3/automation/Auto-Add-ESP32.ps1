# Run on ANY Windows workstation with USB-UART access to the ESP32; MSI remains the remote server.
# This script NEVER starts a second HTTP server, Docker container, or Windows service.
param(
  [string]$Config = 'E:\SimScopeData\Farmplast\Climate\climate.env',
  [string]$Zone = '',
  [string]$Port = '',
  [switch]$ResetWifi
)
$ErrorActionPreference='Stop'
if($PSVersionTable.PSEdition -eq 'Desktop'){$env:PSModulePath="$env:SystemRoot\System32\WindowsPowerShell\v1.0\Modules;"+$env:PSModulePath}
$node=(Get-Command node -ErrorAction Stop).Source
$script=Join-Path $PSScriptRoot 'onboard.mjs'
if(-not (Test-Path $Config)){throw "MSI module configuration not found: $Config. Run Install-MSI.ps1 to STAGE files first (no new server)."}
# Generate the correct CA PEM from the EXISTING public TLS endpoint automatically.
# No invented URLs, self-signed substitutes, setInsecure(), or extra services.
$configText=Get-Content -Path $Config -Raw
$originMatch=[regex]::Match($configText,'(?m)^PUBLIC_ORIGIN=(.+?)\s*$')
if(-not $originMatch.Success -or [string]::IsNullOrWhiteSpace($originMatch.Groups[1].Value)){
  throw 'MSI HTTPS public ingress is not configured yet. Existing gateway must be published once; no fake URL will be used.'
}
$publicOrigin=$originMatch.Groups[1].Value.Trim().TrimEnd('/')
$parsed=[Uri]$publicOrigin
if($parsed.Scheme -ne 'https' -or $parsed.UserInfo -or $parsed.Port -ne 443 -or $parsed.AbsolutePath -notin @('/','/climate')){throw 'Unexpected HTTPS public origin'}
$caMatch=[regex]::Match($configText,'(?m)^CA_PEM_FILE=(.*?)\s*$')
$caFile=if($caMatch.Success){$caMatch.Groups[1].Value.Trim()}else{''}
if(-not $caFile -or -not (Test-Path $caFile)) {
  $healthUri=$publicOrigin+'/healthz'
  $response=Invoke-WebRequest -Uri $healthUri -UseBasicParsing -TimeoutSec 12
  if($response.StatusCode -ne 200){throw "Public MSI climate route not reachable: HTTP $($response.StatusCode)"}
  $tcp=New-Object System.Net.Sockets.TcpClient($parsed.DnsSafeHost,443)
  try{
    $tls=New-Object System.Net.Security.SslStream($tcp.GetStream(),$false)
    try{
      $tls.AuthenticateAsClient($parsed.DnsSafeHost)
      $cert=New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($tls.RemoteCertificate)
      $chain=New-Object System.Security.Cryptography.X509Certificates.X509Chain
      $chain.ChainPolicy.RevocationMode=[System.Security.Cryptography.X509Certificates.X509RevocationMode]::Online
      if(-not $chain.Build($cert)){throw 'Windows TLS chain validation failed; no CA will be generated'}
      $root=$chain.ChainElements[$chain.ChainElements.Count-1].Certificate
      if($root.Subject -ne $root.Issuer){throw 'A trusted self-signed root was not found in the validated chain'}
      $base64=[Convert]::ToBase64String($root.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert))
      $pem="-----BEGIN CERTIFICATE-----`n"+([regex]::Replace($base64,'.{1,64}',{"$($args[0].Value)`n"}))+"-----END CERTIFICATE-----`n"
      $caFile=Join-Path (Split-Path -Parent $Config) 'climate-verified-root.pem'
      Set-Content -Path $caFile -Value $pem -Encoding Ascii
      if($caMatch.Success){$configText=[regex]::Replace($configText,'(?m)^CA_PEM_FILE=.*$',('CA_PEM_FILE='+$caFile))}
      else{$configText+="`nCA_PEM_FILE=$caFile`n"}
      Set-Content -Path $Config -Value $configText -Encoding UTF8
      Write-Host 'Validated public TLS root CA saved locally on MSI.'
    } finally {$tls.Dispose()}
  } finally {$tcp.Dispose()}
}
# Preflight before reading Wi-Fi secrets or opening the serial port.
& $node $script --config $Config --preflight
if($LASTEXITCODE -ne 0){throw 'MSI climate API is not connected to the EXISTING gateway, or HTTPS is not ready. No device touched.'}

function Find-Executable([string]$name,[string[]]$paths) {
  $cmd=Get-Command $name -ErrorAction SilentlyContinue
  if($cmd){return $cmd.Source}
  foreach($candidate in $paths) {if($candidate -and (Test-Path $candidate)){return $candidate}}
  return $null
}
$arduino=Find-Executable 'arduino-cli.exe' @(
  "$env:LOCALAPPDATA\Programs\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe",
  'C:\Program Files\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe',
  'C:\Program Files (x86)\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe'
)
if(-not $arduino){$c=Get-Command arduino-cli -ErrorAction SilentlyContinue;if($c){$arduino=$c.Source}}
if(-not $arduino){throw 'Arduino CLI not installed/found. Arduino IDE 2 may contain arduino-cli.exe. No flashing attempted.'}

# Detect USB–UART port; ask only if more than one is connected.
if(-not $Port){
  $ports=@([System.IO.Ports.SerialPort]::GetPortNames() | Sort-Object)
  if($ports.Count -eq 0){throw 'No COM ports found. Connect the ESP32 via a 3.3V USB–UART adapter.'}
  if($ports.Count -eq 1){$Port=$ports[0]}
  else{
    Write-Host 'Several COM ports found:'
    for($i=0;$i -lt $ports.Count;$i++){Write-Host "[$($i+1)] $($ports[$i])"}
    $choice=Read-Host 'Enter COM port number (only once)'
    if($choice -notmatch '^[0-9]+$' -or [int]$choice -lt 1 -or [int]$choice -gt $ports.Count){throw 'Invalid COM port selection'}
    $Port=$ports[[int]$choice-1]
  }
}
Write-Host "Selected serial port: $Port"
Write-Host 'The target board must be NEW, with no mains/HVAC load connected.' -ForegroundColor Yellow
$confirm=Read-Host 'Type NEW to confirm first USB flashing (a 4MB backup will be saved)'
if($confirm -cne 'NEW'){throw 'Cancelled. No firmware written.'}

# One-time Wi-Fi entry. Password persists with Windows DPAPI bound to this user,
# not in plaintext config, commands, GitHub, logs or the firmware repository.
$wifiDir=Join-Path $env:APPDATA 'Farmplast\PAClimate'
$wifiFile=Join-Path $wifiDir 'wifi.dpapi.json'
if($ResetWifi -and (Test-Path $wifiFile)){Remove-Item $wifiFile -Force}
if(Test-Path $wifiFile){
  $saved=Get-Content -Path $wifiFile -Raw | ConvertFrom-Json
  $ssid=[string]$saved.ssid
  $password=ConvertTo-SecureString -String ([string]$saved.dpapi)
}else{
  # The workstation can be at home, at the plant, or anywhere with USB-UART.
  # Do not read its current WLAN SSID: that might be unrelated to the ESP32 destination.
  $ssid=(Read-Host 'Enter the future ESP32 Wi-Fi SSID (not necessarily your current PC Wi-Fi)').Trim()
  if(-not $ssid){throw 'Target ESP32 Wi-Fi SSID is required'}
  $password=Read-Host -AsSecureString 'Enter the password of that ESP32 Wi-Fi (stored using Windows DPAPI)'
  New-Item -ItemType Directory -Path $wifiDir -Force | Out-Null
  @{ssid=$ssid;dpapi=($password | ConvertFrom-SecureString)} | ConvertTo-Json | Set-Content -Path $wifiFile -Encoding UTF8
}
$raw=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
try{$plain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($raw)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($raw)}
if($ssid.Length -lt 1 -or $ssid.Length -gt 32 -or $plain.Length -lt 8 -or $plain.Length -gt 63) { throw 'Invalid WPA2/WPA3 Wi-Fi SSID or password length'; }

# Ensure compiler packages automatically. No new MSI server/service is installed.
& $arduino core list | Out-Null
if($LASTEXITCODE -ne 0){throw 'Arduino CLI core list failed'}
$coreJson=(& $arduino core list --format json | Out-String)
if($coreJson -notmatch 'esp32:esp32' -or $coreJson -notmatch '3\.3\.8'){
  Write-Host 'Installing official Espressif ESP32 core 3.3.8...'
  & $arduino core update-index --additional-urls 'https://espressif.github.io/arduino-esp32/package_esp32_index.json'; if($LASTEXITCODE -ne 0){throw 'Arduino core index download failed'}
  & $arduino core install 'esp32:esp32@3.3.8' --additional-urls 'https://espressif.github.io/arduino-esp32/package_esp32_index.json'; if($LASTEXITCODE -ne 0){throw 'ESP32 core installation failed'}
}
$libJson=(& $arduino lib list --format json | Out-String)
if($LASTEXITCODE -ne 0){throw 'Arduino library list failed'}
foreach($lib in @('OneWire','DallasTemperature','ArduinoJson')){
  if($libJson -notmatch ('"'+[regex]::Escape($lib)+'"')){
    Write-Host "Installing Arduino library: $lib"
    & $arduino lib install $lib; if($LASTEXITCODE -ne 0){throw "Failed to install Arduino library $lib"}
  }
}
$esptool=Find-Executable 'esptool.exe' @()
if(-not $esptool){
  $dir=Join-Path $env:LOCALAPPDATA 'Arduino15\packages\esp32\tools\esptool_py'
  if(Test-Path $dir){$esptool=Get-ChildItem -Path $dir -Recurse -Filter esptool.exe -File -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName}
}
if(-not $esptool){throw 'Espressif esptool.exe not found in Arduino ESP32 core. No flashing attempted.'}

$env:PA_ONBOARD_WIFI_SSID=$ssid
$env:PA_ONBOARD_WIFI_PASSWORD=$plain
$plain=$null
try {
  $args=@('--config',$Config,'--port',$Port,'--arduino-cli',$arduino,'--esptool',$esptool,'--confirm-new')
  if($Zone){$args+=@('--zone',$Zone)}
  # Capture machine-readable payload PATH, never credentials, from Node's output.
  $output=@(& $node $script @args 2>&1)
  foreach($line in $output){Write-Host ([string]$line)}
  if($LASTEXITCODE -ne 0){throw 'USB firmware write failed or was cancelled. Check the error above; no manual flash bypass.'}
  $candidate=@($output | ForEach-Object {[string]$_} | Where-Object {$_ -like 'FP_PROVISION_FILE=*'})
  if($candidate.Count -ne 1){throw 'Provisioning file path was not emitted; online setup is NOT complete'}
  $payloadFile=$candidate[0].Substring('FP_PROVISION_FILE='.Length)
  if(-not (Test-Path $payloadFile)){throw 'Provisioning payload missing'}
  $payload=Get-Content -Path $payloadFile -Raw
  $info=$payload | ConvertFrom-Json
  if($info.device_id -notmatch '^PA-CLIM-[0-9A-F]{12}$'){throw 'Invalid device identity'}
  $provisionLine='FP1:'+([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($payload)))
  if($provisionLine.Length -gt 10500){throw 'Provisioning payload exceeds device USB receive capacity'}
  Write-Host 'Sending the UNIQUE device credentials into the ESP32 NVS using USB serial...'
  $serial=New-Object System.IO.Ports.SerialPort($Port,115200,[System.IO.Ports.Parity]::None,8,[System.IO.Ports.StopBits]::One)
  $serial.ReadTimeout=1500
  $serial.WriteTimeout=4000
  $serial.NewLine="`n"
  $serial.DtrEnable=$false
  $serial.RtsEnable=$false
  $acked=$false
  try {
    $serial.Open()
    Start-Sleep -Seconds 3  # ESP32 may reboot when the UART port is opened.
    $serial.DiscardInBuffer()
    $serial.WriteLine($provisionLine)
    $deadline=(Get-Date).AddSeconds(25)
    while((Get-Date) -lt $deadline){
      try{
        $msg=$serial.ReadLine().Trim()
        if($msg -eq 'FP_PROVISION_OK'){$acked=$true;break}
        if($msg -eq 'FP_PROVISION_FAILED'){throw 'ESP32 rejected provisioning data'}
      }catch [System.TimeoutException]{ }
    }
  }finally{if($serial.IsOpen){$serial.Close()};$serial.Dispose()}
  if(-not $acked){throw 'ESP32 did not confirm credentials in NVS. Not reporting success; do not install into an HVAC panel.'}
  # The password/token/CA are now in NVS. Remove temporary JSON with plaintext.
  Remove-Item -Path $payloadFile -Force
  # Distinguish a successful USB flash from a complete end-to-end MSI verification.
  # The ESP32 may be provisioned at home for a Wi-Fi network that exists only in PA.
  $currentWifi=@(netsh wlan show interfaces | Out-String | Select-String -Pattern '(?m)^\s*SSID\s*:\s*(.+?)\s*$' -AllMatches | ForEach-Object {$_.Matches} | ForEach-Object {$_.Groups[1].Value.Trim()})
  if($currentWifi -contains $ssid){
    Write-Host 'ESP32 provisioned. Checking real authenticated MSI telemetry...'
    & $node $script --config $Config --verify --device ([string]$info.device_id)
    if($LASTEXITCODE -ne 0){throw 'USB provisioning succeeded, but the controller has not yet reported ONLINE to MSI.'}
    Write-Host "SUCCESS: $($info.device_id) registered, firmware flashed, NVS provisioned and MSI ONLINE confirmed." -ForegroundColor Green
  }else{
    Write-Host "USB FLASH/PROVISION PASS: $($info.device_id). The target SSID is not the current Windows Wi-Fi." -ForegroundColor Yellow
    Write-Host 'MSI ONLINE / end-to-end verification is PENDING until the ESP32 reaches the target Wi-Fi. This is not an online success claim.' -ForegroundColor Yellow
    Write-Host 'No second application flash is needed solely for the location change.'
  }
}finally{
  Remove-Item Env:PA_ONBOARD_WIFI_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:PA_ONBOARD_WIFI_SSID -ErrorAction SilentlyContinue
}
