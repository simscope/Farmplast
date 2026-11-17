"""Validate an onsite barrel build against the actual protected recovery backup.

No serial port is opened and no credentials or sensor readings are printed.
"""
import argparse, hashlib, json, shutil, struct
from pathlib import Path

def sha(data): return hashlib.sha256(data).hexdigest()

def main():
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument('--root',type=Path,required=True)
 p.add_argument('--recovery',type=Path,required=True)
 p.add_argument('--build',type=Path)
 p.add_argument('--sketch-name',default='Barel2Onsite')
 p.add_argument('--fqbn',default='esp32:esp32:esp32s3:PSRAM=opi,FlashMode=qio,FlashSize=8M,PartitionScheme=huge_app,CDCOnBoot=cdc')
 args=p.parse_args()
 inspection=json.loads((args.recovery/'inspection.json').read_text(encoding='utf-8'))
 backup=args.recovery/'original-flash.bin'
 if backup.stat().st_size!=16777216 or sha(backup.read_bytes())!=inspection['backup_sha256']:
  raise RuntimeError('Full physical flash recovery backup is invalid')
 app0=next(e for e in inspection['partitions'] if e['name']=='app0')
 old=next(e['image'] for e in inspection['applications'] if e['partition']=='app0')
 if not all(old[k] for k in ('expected_barrel_point_ids','owner_wifi_matches','waveshare_7_marker')):
  raise RuntimeError('Installed firmware identity/source is not confirmed')
 if app0['offset']!=65536 or app0['size']!=3145728:raise RuntimeError('Unexpected application layout')
 build=args.build or args.root/'build'/'barrels-onsite'
 image=(build/(args.sketch_name+'.ino.bin')).read_bytes()
 if image[0]!=0xe9 or struct.unpack_from('<H',image,12)[0]!=9:raise RuntimeError('Expected ESP32-S3 application')
 if image[2]!=old['flash_mode'] or 2**(image[3]>>4)!=old['flash_header_mb'] or image[3]&15!=old['flash_frequency_code']:
  raise RuntimeError('Existing flash header parameters must be preserved')
 if len(image)>app0['size']-65536:raise RuntimeError('Insufficient application headroom')
 at,checksum=24,0xef
 if not 1<=image[1]<=16:raise RuntimeError('Invalid segment count')
 for _ in range(image[1]):
  count=struct.unpack_from('<I',image,at+4)[0];at+=8
  if at+count>len(image):raise RuntimeError('Truncated image')
  for value in image[at:at+count]:checksum^=value
  at+=count
 checksum_at=((at+16)//16)*16-1
 if image[checksum_at]!=checksum or image[23]!=1 or checksum_at+33!=len(image) or hashlib.sha256(image[:checksum_at+1]).digest()!=image[checksum_at+1:]:
  raise RuntimeError('Image checksum/appended SHA mismatch')
 for marker in (b'barrels-msi-2',b'https://farmplast.vercel.app/api/nj-ingest/barrels',b'-----BEGIN CERTIFICATE-----'):
  if marker not in image:raise RuntimeError('Transport/version marker missing')
 if b'.supabase.co' in image or b'PRE B1 ok=%d raw=%u' in image or b'PRE B2 ok=%d raw=%u' in image:
  raise RuntimeError('Old transport or startup sample logging remains')
 table=(build/(args.sketch_name+'.ino.partitions.bin')).read_bytes()
 if table!=(args.recovery/'installed-partitions.bin').read_bytes():raise RuntimeError('Build differs from the installed partition table')
 if sha((build/(args.sketch_name+'.ino.bootloader.bin')).read_bytes())!=inspection['bootloader']['sha256']:
  raise RuntimeError('Build bootloader differs from installed boot parameters')
 kit=args.root/'barrels-usb-onsite-20261117'
 if (kit/'programming-receipt.json').exists():
  raise RuntimeError('Installed kit is immutable; use a new versioned package for another build')
 kit.mkdir(exist_ok=True)
 files=[]
 sources={'application.bin':build/(args.sketch_name+'.ino.bin'),'partitions.bin':build/(args.sketch_name+'.ino.partitions.bin'),
  'esptool.exe':args.root/'barrels-usb'/'esptool.exe',
  'install-barrels-onsite.ps1':Path(__file__).parent/'install-barrels-onsite.ps1',
  'USB_README_RU.md':Path(__file__).parent/'BARRELS_ONSITE_RU.md'}
 for name,source in sources.items():
  shutil.copyfile(source,kit/name);data=(kit/name).read_bytes()
  files.append(dict(name=name,bytes=len(data),sha256=sha(data)))
 manifest=dict(version='barrels-msi-2',chip='esp32s3',physical_flash_bytes=16777216,logical_flash_bytes=8388608,
  board='Waveshare ESP32-S3-Touch-LCD-7',psram='OPI 8MB',core='3.3.8',partition_scheme='installed huge_app',build_fqbn=args.fqbn,
  app_offset=app0['offset'],app_partition_size=app0['size'],headroom=app0['size']-len(image),
  bootloader_bytes=inspection['bootloader']['image_bytes'],bootloader_sha256=inspection['bootloader']['sha256'],
  backup_file=str(backup),backup_sha256=inspection['backup_sha256'],rollback_app_bytes=old['image_bytes'],rollback_app_sha256=old['sha256'],
  checksum='PASS',appended_sha='PASS',installed_partition_match=True,flashed=False,files=files)
 (kit/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
 print(json.dumps(dict(package=str(kit),version=manifest['version'],application_bytes=len(image),application_sha256=sha(image),headroom=manifest['headroom'],partition_match=True,bootloader_match=True,checksum='PASS',appended_sha='PASS'),indent=2))

if __name__=='__main__':main()
