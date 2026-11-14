param([switch]$Commission)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
# The scheduled companion reads attendance only; it never drains bridge commands.
$hour=(Get-Date).Hour
if(!$Commission -and ($hour -lt 8 -or $hour -ge 21)){exit 0}
$env:ZKT_V2_ALLOW_LIVE='true'
$exe=Join-Path $PSScriptRoot 'zkt-mapped-attendance.exe'
$config=Join-Path $PSScriptRoot 'mapped.env'
$output=Join-Path $PSScriptRoot 'last-run.json'
$errors=Join-Path $PSScriptRoot 'last-error.json'
if(!(Test-Path -LiteralPath $exe) -or !(Test-Path -LiteralPath $config)){throw 'Mapped attendance installation is incomplete'}
# Windows PowerShell treats harmless native stderr warnings as error records.
$ErrorActionPreference='Continue'
& $exe --pull-mapped-once --config $config 1> $output 2> $errors
exit $LASTEXITCODE
