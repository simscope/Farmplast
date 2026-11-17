"""Validate an offline barrel image and assemble a private, unflashed USB kit."""
from pathlib import Path
import hashlib
import json
import shutil
import struct
import argparse

def sha(data):
    return hashlib.sha256(data).hexdigest()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True)
    args = parser.parse_args()
    root = args.root
    build = root / 'build' / 'barrels'
    image = (build / 'Barel2.ino.bin').read_bytes()
    if image[0] != 0xE9 or struct.unpack_from('<H', image, 12)[0] != 9:
        raise RuntimeError('Expected ESP32-S3 application')
    at, checksum = 24, 0xEF
    if not 1 <= image[1] <= 16:
        raise RuntimeError('Invalid segment count')
    for _ in range(image[1]):
        length = struct.unpack_from('<I', image, at + 4)[0]
        at += 8
        if at + length > len(image):
            raise RuntimeError('Truncated image')
        for value in image[at:at + length]:
            checksum ^= value
        at += length
    checksum_at = ((at + 16) // 16) * 16 - 1
    if image[checksum_at] != checksum or image[23] != 1 or checksum_at + 33 != len(image) or hashlib.sha256(image[:checksum_at + 1]).digest() != image[checksum_at + 1:]:
        raise RuntimeError('Invalid checksum or appended SHA')
    for marker in (b'barrels-msi-1', b'https://farmplast.vercel.app/api/nj-ingest/barrels', b'-----BEGIN CERTIFICATE-----'):
        if marker not in image:
            raise RuntimeError('Expected transport/version marker missing')
    if b'eeobivvwjzakbweluwtm.supabase.co' in image:
        raise RuntimeError('Old cloud address remains')
    table = (build / 'Barel2.ino.partitions.bin').read_bytes()
    entries = {}
    for at in range(0, len(table), 32):
        magic, kind, sub, offset, size, label, flags = struct.unpack_from('<HBBII16sI', table, at)
        if magic != 0x50AA:
            break
        entries[label.rstrip(b'\0').decode()] = {'type': kind, 'subtype': sub, 'offset': offset, 'size': size, 'flags': flags}
    if entries.get('app0', {}).get('offset') != 0x10000 or entries.get('app0', {}).get('size') != 0x330000 or entries.get('otadata', {}).get('offset') != 0xE000 or entries.get('otadata', {}).get('size') != 0x2000:
        raise RuntimeError('Unexpected partition layout')
    if len(image) > 0x330000 - 65536:
        raise RuntimeError('Insufficient application headroom')
    sdk = root / 'arduino-data' / 'packages' / 'esp32'
    kit = root / 'barrels-usb'
    kit.mkdir(exist_ok=True)
    sources = {
        'application.bin': build / 'Barel2.ino.bin',
        'partitions.bin': build / 'Barel2.ino.partitions.bin',
        'boot_app0.bin': sdk / 'hardware' / 'esp32' / '3.3.8' / 'tools' / 'partitions' / 'boot_app0.bin',
        'esptool.exe': sdk / 'tools' / 'esptool_py' / '5.2.0' / 'esptool.exe',
        'install-barrels-usb.ps1': Path(__file__).parent / 'install-barrels-usb.ps1',
        'USB_README_RU.md': Path(__file__).parent / 'USB_README_RU.md',
    }
    files = []
    for name, source in sources.items():
        shutil.copyfile(source, kit / name)
        data = (kit / name).read_bytes()
        files.append({'name': name, 'bytes': len(data), 'sha256': sha(data)})
    manifest = {'version': 'barrels-msi-1', 'board': 'Waveshare ESP32-S3-Touch-LCD-7', 'chip': 'esp32s3', 'flash_bytes': 8388608, 'psram': 'OPI', 'usb_cdc': True, 'fqbn': 'esp32:esp32:esp32s3:PSRAM=opi,FlashMode=qio,FlashSize=8M,PartitionScheme=default_8MB,CDCOnBoot=cdc', 'core': '3.3.8', 'partitions': entries, 'checksum': 'PASS', 'appended_sha': 'PASS', 'flashed': False, 'installed_source_confirmed': False, 'files': files}
    (kit / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    receipt_path = root / 'barrels-preparation.json'
    receipt = json.loads(receipt_path.read_text())
    receipt.update(compiled=True, package=str(kit), app_sha256=sha(image), app_bytes=len(image), headroom=0x330000-len(image), checksum='PASS', appended_sha='PASS')
    receipt_path.write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    print(json.dumps(receipt, indent=2))

if __name__ == '__main__':
    main()
