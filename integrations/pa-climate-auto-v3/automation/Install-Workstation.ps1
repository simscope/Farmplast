# Entry point on the factory workstation. No server or service is installed here.
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
if(-not (Get-Command arduino-cli -ErrorAction SilentlyContinue)) {
  $cli=Join-Path $tools 'arduino-cli'
  if(-not (Test-Path (Join-Path $cli 'arduino-cli.exe'))){
    $release=Invoke-RestMethod 'https://api.github.com/repos/arduino/arduino-cli/releases/latest'
    $asset=@($release.assets | Where-Object {$_.name -match '_Windows_64bit.zip$'})
    $sums=@($release.assets | Where-Object {$_.name -match '_checksums.txt$'})
    if($asset.Count -ne 1 -or $sums.Count -ne 1){throw 'Official Arduino CLI release assets unavailable'}
    Get-VerifiedArchive $asset[0].browser_download_url $sums[0].browser_download_url $asset[0].name $cli
  }
  $env:PATH=$cli+';'+$env:PATH
}
# Enrollment ticket is used once. The scoped workstation credential stays DPAPI encrypted.
$credentialFile=Join-Path $root 'workstation.dpapi'
if(-not (Test-Path -LiteralPath $credentialFile)) {
  $reply=Invoke-RestMethod -Uri ($bootstrap.public_origin+'/workstation/enroll') -Method Post -ContentType 'application/json' -Body (@{ticket=$bootstrap.ticket}|ConvertTo-Json -Compress)
  if(-not $reply.workstation_token){throw 'MSI workstation enrollment failed'}
  $private=@{origin=$bootstrap.public_origin;token=$reply.workstation_token}|ConvertTo-Json -Compress
  ConvertTo-SecureString $private -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -LiteralPath $credentialFile -Encoding ASCII
  $reply=$null;$private=$null
}
$secure=Get-Content -LiteralPath $credentialFile -Raw | ConvertTo-SecureString
$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try{$saved=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)|ConvertFrom-Json}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
if($saved.origin -ne $bootstrap.public_origin){throw 'Saved workstation belongs to a different MSI endpoint'}
$config=Join-Path $root 'workstation.env'
@("DATA_DIR=$root", "CLIMATE_HTTPS_BASE_URL=$($bootstrap.public_origin)", "PUBLIC_ORIGIN=$($bootstrap.public_origin)", "CA_PEM_FILE=") | Set-Content -LiteralPath $config -Encoding UTF8
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
