# Entry point on the user's Windows PC with the ESP32 attached over USB-UART. No local server or service is installed.
param([string]$Manifest=(Join-Path $PSScriptRoot '..\..\workstation-bootstrap.json'))
$ErrorActionPreference='Stop'
if($PSVersionTable.PSEdition -eq 'Desktop'){$env:PSModulePath="$env:SystemRoot\System32\WindowsPowerShell\v1.0\Modules;"+$env:PSModulePath}
$bootstrap=Get-Content -LiteralPath $Manifest -Raw | ConvertFrom-Json
$uri=[Uri]$bootstrap.public_origin
if($uri.Scheme -ne 'https' -or $uri.Port -ne 443 -or $uri.UserInfo -or $uri.AbsolutePath -ne '/climate' -or $uri.Query -or $uri.Fragment){throw 'Invalid MSI HTTPS bootstrap origin'}
$root=Join-Path $env:LOCALAPPDATA 'Farmplast\PAClimate'
New-Item -ItemType Directory -Path $root -Force | Out-Null
& icacls $root /inheritance:r /grant:r "${env:USERNAME}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
if($LASTEXITCODE -ne 0){throw 'Cannot protect workstation files'}
# Enrollment ticket is used once. The scoped workstation credential stays DPAPI encrypted.
# Fail before consuming a ticket if this Windows user cannot use DPAPI.
$probe=ConvertTo-SecureString 'Farmplast DPAPI preflight' -AsPlainText -Force
$encryptedProbe=$probe | ConvertFrom-SecureString
$null=ConvertTo-SecureString $encryptedProbe
$probe=$null;$encryptedProbe=$null
$credentialFile=Join-Path $root 'workstation.dpapi'
if(-not (Test-Path -LiteralPath $credentialFile)) {
  $reply=Invoke-RestMethod -Uri ($bootstrap.public_origin+'/workstation/enroll') -Method Post -ContentType 'application/json' -Body (@{ticket=$bootstrap.ticket}|ConvertTo-Json -Compress)
  if(-not $reply.workstation_token){throw 'MSI workstation enrollment failed'}
  $private=@{origin=$bootstrap.public_origin;token=$reply.workstation_token}|ConvertTo-Json -Compress
  $encrypted=ConvertFrom-SecureString -SecureString (ConvertTo-SecureString $private -AsPlainText -Force)
  [System.IO.File]::WriteAllText($credentialFile,$encrypted,[System.Text.Encoding]::ASCII)
  $encrypted=$null
  $reply=$null;$private=$null
}
# Set-Content in earlier ZIPs appended CR/LF; ConvertTo-SecureString rejects it as invalid format.
# Preserve the existing one-time redeemed workstation token: do NOT delete or re-enroll.
$encrypted=(Get-Content -LiteralPath $credentialFile -Raw -Encoding ASCII).Trim()
try{
  if([string]::IsNullOrWhiteSpace($encrypted)){throw 'Empty credential'}
  $secure=ConvertTo-SecureString -String $encrypted -ErrorAction Stop
}catch{
  throw 'Workstation DPAPI credential could not be read. Keep workstation.dpapi; retry under the same Windows account. Never delete it or consume another enrollment ticket automatically.'
}
$encrypted=$null
$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try{$saved=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)|ConvertFrom-Json}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
if($saved.origin -ne $bootstrap.public_origin){throw 'Saved workstation belongs to a different MSI endpoint'}
$config=Join-Path $root 'workstation.env'
@("DATA_DIR=$root", "CLIMATE_HTTPS_BASE_URL=$($bootstrap.public_origin)", "PUBLIC_ORIGIN=$($bootstrap.public_origin)", "CA_PEM_FILE=") | Set-Content -LiteralPath $config -Encoding UTF8

$tools=Join-Path $root 'tools'
New-Item -ItemType Directory -Path $tools -Force | Out-Null
# Retrieve official tools over Windows-validated TLS and check their published SHA256.
function Get-VerifiedArchive($url,$sumUrl,$name,$destination) {
  $archive=Join-Path $tools $name
  Invoke-WebRequest -Uri $url -OutFile $archive -UseBasicParsing
  $sums=(Invoke-WebRequest -Uri $sumUrl -UseBasicParsing).Content
  $line=@($sums -split "`n" | Where-Object {$_ -match ([regex]::Escape($name)+'\s*$')})
  if($line.Count -ne 1){throw 'Official tool checksum entry missing'}
  $expected=([regex]::Match($line[0],'(?i)^[a-f0-9]{64}')).Value
  if(-not $expected -or (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $expected){throw 'Official tool checksum mismatch'}
  Expand-Archive -LiteralPath $archive -DestinationPath $destination -Force
  Remove-Item -LiteralPath $archive
}
if(-not (Get-Command node -ErrorAction SilentlyContinue)) {
  $nodeRoot=Get-ChildItem $tools -Directory -Filter 'node-*-win-x64' | Sort-Object Name -Descending | Select-Object -First 1
  if(-not $nodeRoot){
    $release=(Invoke-RestMethod 'https://nodejs.org/dist/index.json') | Where-Object {$_.lts -and $_.files -contains 'win-x64-zip'} | Select-Object -First 1
    $name='node-'+$release.version+'-win-x64.zip'
    Get-VerifiedArchive ('https://nodejs.org/dist/'+$release.version+'/'+$name) ('https://nodejs.org/dist/'+$release.version+'/SHASUMS256.txt') $name $tools
    $nodeRoot=Get-ChildItem $tools -Directory -Filter 'node-*-win-x64' | Sort-Object Name -Descending | Select-Object -First 1
  }
  $env:PATH=$nodeRoot.FullName+';'+$env:PATH
}
# Reuse Arduino IDE's bundled CLI if available; users with Arduino IDE should not
# need a second CLI download. Keep the official SHA256-verified release fallback.
if(-not (Get-Command arduino-cli -ErrorAction SilentlyContinue)) {
  $candidatePaths=@(
    (Join-Path $env:LOCALAPPDATA 'Programs\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe'),
    (Join-Path $env:ProgramFiles 'Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe')
  )
  if(${env:ProgramFiles(x86)}) {
    $candidatePaths+=Join-Path ${env:ProgramFiles(x86)} 'Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe'
  }
  foreach($candidate in $candidatePaths) {
    if(Test-Path -LiteralPath $candidate -PathType Leaf) {
      $env:PATH=(Split-Path -Parent $candidate)+';'+$env:PATH
      break
    }
  }
}
if(-not (Get-Command arduino-cli -ErrorAction SilentlyContinue)) {
  $cli=Join-Path $tools 'arduino-cli'
  if(-not (Test-Path (Join-Path $cli 'arduino-cli.exe'))){
    $release=Invoke-RestMethod 'https://api.github.com/repos/arduino/arduino-cli/releases/latest'
    # Official assets use e.g. arduino-cli_1.5.1_Windows_64bit.zip AND
    # 1.5.1-checksums.txt (hyphen, not the incorrect _checksums.txt).
    $asset=@($release.assets | Where-Object {$_.name -match '(?i)_Windows_64bit\.zip
$env:PA_WORKSTATION_TOKEN=$saved.token
try {
  & (Join-Path $PSScriptRoot 'Auto-Add-ESP32.ps1') -Config $config
} finally {
  Remove-Item Env:PA_WORKSTATION_TOKEN -ErrorAction SilentlyContinue
  $saved=$null
  # Pending USB payloads contain plaintext Wi-Fi/device secrets only during provisioning.
  $provision=Join-Path $root 'provisioning'
  if(Test-Path -LiteralPath $provision){Get-ChildItem -LiteralPath $provision -Filter 'pending-provision.json' -Recurse -File | ForEach-Object {Remove-Item -LiteralPath $_.FullName -Force}}
}
})
    $sums=@($release.assets | Where-Object {$_.name -match '(?i)-checksums\.txt
$env:PA_WORKSTATION_TOKEN=$saved.token
try {
  & (Join-Path $PSScriptRoot 'Auto-Add-ESP32.ps1') -Config $config
} finally {
  Remove-Item Env:PA_WORKSTATION_TOKEN -ErrorAction SilentlyContinue
  $saved=$null
  # Pending USB payloads contain plaintext Wi-Fi/device secrets only during provisioning.
  $provision=Join-Path $root 'provisioning'
  if(Test-Path -LiteralPath $provision){Get-ChildItem -LiteralPath $provision -Filter 'pending-provision.json' -Recurse -File | ForEach-Object {Remove-Item -LiteralPath $_.FullName -Force}}
}
})
    if($asset.Count -ne 1 -or $sums.Count -ne 1){throw 'Official Arduino CLI release assets unavailable'}
    Get-VerifiedArchive $asset[0].browser_download_url $sums[0].browser_download_url $asset[0].name $cli
  }
  $env:PATH=$cli+';'+$env:PATH
}
if(-not (Get-Command arduino-cli -ErrorAction SilentlyContinue)) {throw 'Arduino CLI executable not found after setup'}

$env:PA_WORKSTATION_TOKEN=$saved.token
try {
  & (Join-Path $PSScriptRoot 'Auto-Add-ESP32.ps1') -Config $config
} finally {
  Remove-Item Env:PA_WORKSTATION_TOKEN -ErrorAction SilentlyContinue
  $saved=$null
  # Pending USB payloads contain plaintext Wi-Fi/device secrets only during provisioning.
  $provision=Join-Path $root 'provisioning'
  if(Test-Path -LiteralPath $provision){Get-ChildItem -LiteralPath $provision -Filter 'pending-provision.json' -Recurse -File | ForEach-Object {Remove-Item -LiteralPath $_.FullName -Force}}
}
