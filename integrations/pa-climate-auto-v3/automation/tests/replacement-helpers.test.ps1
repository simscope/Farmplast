$ErrorActionPreference='Stop'
$source=Join-Path $PSScriptRoot '..\Replace-Controller.ps1'
$tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseFile($source,[ref]$tokens,[ref]$errors)
if($errors.Count){throw ($errors|Out-String)}
foreach($name in @('Get-OtaSequenceCrc','Get-BootApplicationAddress')){$f=$ast.Find({param($node)$node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name},$true);. ([scriptblock]::Create($f.Extent.Text))}
if((Get-OtaSequenceCrc ([BitConverter]::GetBytes([uint32]1))) -ne 1195612314){throw 'CRC differs from official boot_app0.bin vector'}
$bytes=New-Object byte[] 8192;for($i=0;$i -lt $bytes.Length;$i++){$bytes[$i]=255}
if((Get-BootApplicationAddress $bytes 0) -ne '0x10000'){throw 'Erased OTA metadata default failed'}
foreach($entry in @(@{offset=0;seq=1},@{offset=4096;seq=2})){
 [BitConverter]::GetBytes([uint32]$entry.seq).CopyTo($bytes,$entry.offset);[BitConverter]::GetBytes([uint32]2).CopyTo($bytes,$entry.offset+24);[BitConverter]::GetBytes([uint32](Get-OtaSequenceCrc ([BitConverter]::GetBytes([uint32]$entry.seq)))).CopyTo($bytes,$entry.offset+28)
}
if((Get-BootApplicationAddress $bytes 0) -ne '0x150000'){throw 'Active OTA1 selection failed'}
$bytes[4096+28]=0
if((Get-BootApplicationAddress $bytes 0) -ne '0x10000'){throw 'Corrupt OTA1 CRC was accepted'}
[BitConverter]::GetBytes([uint32]1).CopyTo($bytes,24)
$rejected=$false;try{$null=Get-BootApplicationAddress $bytes 0}catch{$rejected=$_.Exception.Message -match 'unvalidated'}
if(-not $rejected){throw 'Pending OTA was not rejected'}
'Replacement helper tests PASS: CRC, erased metadata, OTA1, corrupt CRC, pending boot.'
