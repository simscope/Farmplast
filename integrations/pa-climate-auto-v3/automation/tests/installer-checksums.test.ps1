# Deterministic Windows PowerShell 5.1 regression tests for the exact installer function.
# No device, network, firmware write, or Windows enrollment is involved.
$ErrorActionPreference='Stop'
$file=Join-Path $PSScriptRoot '..\Install-Workstation.ps1'
$parseErrors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile($file,[ref]$null,[ref]$parseErrors)
if($parseErrors.Count -gt 0){throw "PowerShell syntax error: $($parseErrors | Out-String)"}
$functions=@($ast.FindAll({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Get-VerifiedArchive'},$true))
if($functions.Count -ne 1){throw 'Expected exactly one archive validation function'}
Invoke-Expression $functions[0].Extent.Text

$work=Join-Path $env:TEMP ('climate-checksum-'+[guid]::NewGuid().ToString('N'))
$tools=Join-Path $work 'tools'
New-Item -ItemType Directory -Path $tools -Force | Out-Null
$name='arduino-cli_1.5.1_Windows_64bit.zip'
$sourceZip=Join-Path $work 'official-test.zip'
$payload=Join-Path $work 'payload'
New-Item -ItemType Directory -Path $payload | Out-Null
[System.IO.File]::WriteAllText((Join-Path $payload 'arduino-cli.exe'),'test-only-executable')
Compress-Archive -Path (Join-Path $payload '*') -DestinationPath $sourceZip
$hash=(Get-FileHash -LiteralPath $sourceZip -Algorithm SHA256).Hash.ToLowerInvariant()
$checksums=Join-Path $work 'SHA256SUMS.txt'
[System.IO.File]::WriteAllText($checksums,"$hash  $name" + [Environment]::NewLine,[System.Text.Encoding]::UTF8)
# No actual downloads: simulate PowerShell's binary file response using file copy.
function Invoke-WebRequest {
  [CmdletBinding()]
  param([string]$Uri,[string]$OutFile,[switch]$UseBasicParsing)
  if($Uri -eq 'test://archive'){Copy-Item -LiteralPath $script:sourceZip -Destination $OutFile -Force}
  elseif($Uri -eq 'test://checksums'){Copy-Item -LiteralPath $script:checksums -Destination $OutFile -Force}
  else{throw "Unexpected fixture request $Uri"}
}
try{
  $dest1=Join-Path $work 'digest'
  Get-VerifiedArchive 'test://archive' ('sha256:'+$hash) $name $dest1
  if(-not (Test-Path (Join-Path $dest1 'arduino-cli.exe'))){throw 'GitHub digest path did not extract ZIP'}
  $dest2=Join-Path $work 'sums'
  Get-VerifiedArchive 'test://archive' 'test://checksums' $name $dest2
  if(-not (Test-Path (Join-Path $dest2 'arduino-cli.exe'))){throw 'Official checksums path did not extract ZIP'}
  $rejected=$false
  try{Get-VerifiedArchive 'test://archive' ('sha256:'+('0'*64)) $name (Join-Path $work 'bad')}
  catch{if($_.Exception.Message -match 'checksum mismatch'){$rejected=$true}else{throw}}
  if(-not $rejected){throw 'SHA256 mismatch was not rejected'}
  Write-Host 'PASS: Windows PowerShell syntax, GitHub asset digest, text checksum file, reject incorrect hash'
}finally{
  Remove-Item -LiteralPath $work -Force -Recurse -ErrorAction SilentlyContinue
}
