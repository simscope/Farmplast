"""Prepare a private, unflashed candidate from the owner's local Waveshare source.

No serial port is opened. The original file is never modified. Credentials stay
on MSI. This does not establish that the source matches the installed firmware.
"""
from pathlib import Path
import hashlib
import json
import re

ROOT = Path(r'E:\SimScopeData\Farmplast\NJTelemetry')
SOURCE = Path(r'D:\Farmplast\Tank-Barrel1\Barel2\Barel2.ino')
EXPECTED_SHA256 = '369a4e2aafe61d0204c0ec7936f9565df4d53bea3a37e69afc90e10540762124'
DEST = ROOT / 'private' / 'barrels-candidate' / 'Barel2'

def main():
    original = SOURCE.read_bytes()
    if hashlib.sha256(original).hexdigest() != EXPECTED_SHA256:
        raise RuntimeError('Owner source changed; review it before preparing another candidate')
    text = original.decode('utf-8-sig')
    if 'CONFIG_BOARD_WAVESHARE_ESP32_S3_TOUCH_LCD_7 1' not in text:
        raise RuntimeError('Unexpected board source')
    if '28289681-9b1d-4273-b972-57ad9125c247' not in text:
        raise RuntimeError('Unexpected barrel mapping')
    credentials = []
    for name in ('WIFI_SSID', 'WIFI_PASS', 'SUPABASE_ANON_KEY'):
        pattern = rf'(?:static\s+)?const\s+char\s*\*\s*{name}\s*=\s*"(?:\\.|[^"\\])*"\s*;'
        matches = list(re.finditer(pattern, text, flags=re.S))
        if len(matches) != 1:
            raise RuntimeError(f'Expected one {name} declaration')
        declaration = matches[0].group()
        if name.startswith('WIFI_'):
            credentials.append(declaration)
        text = text.replace(declaration, '')
    text, count = re.subn(r'const\s+char\s*\*\s*TELEMETRY_URL\s*=\s*"[^"\n]+"\s*;', 'const char* TELEMETRY_URL = NJ_TELEMETRY_URL;', text)
    if count != 1 or text.count('client.setInsecure();') != 1:
        raise RuntimeError('Unexpected networking implementation')
    text = text.replace('#include <Arduino.h>', '#include <Arduino.h>\n#include "secrets.h"\n#include "msi-ca.h"')
    text = re.sub(r'^\s*http\.addHeader\("apikey",\s*SUPABASE_ANON_KEY\);\s*$', '', text, flags=re.M)
    text = re.sub(r'^\s*http\.addHeader\("Prefer",[^\n]*\);\s*$', '', text, flags=re.M)
    text = text.replace('SUPABASE_ANON_KEY', 'NJ_TELEMETRY_BEARER')
    text = text.replace('client.setInsecure();', 'client.setCACert(NJ_MSI_CA_PEM);')
    text = text.replace('  WiFiClientSecure client;', '  if (time(nullptr) < 1700000000) return false; // Wait for NTP before verified TLS.\n  WiFiClientSecure client;')
    text = text.replace('  Serial.println(body);', '  // No complete telemetry packet is written to the serial log.')
    text = text.replace('Supabase: DIRECT REST telemetry_latest by point_id', 'MSI: current readings in RAM only')
    if 'eeobivvwjzakbweluwtm.supabase.co' in text or 'SUPABASE_ANON_KEY' in text or '.setInsecure()' in text:
        raise RuntimeError('Old cloud transport remains')
    config = json.loads((ROOT / 'private' / 'config.json').read_text(encoding='utf-8-sig'))
    key = config['devices']['barrels']
    if not re.fullmatch(r'[a-f0-9]{64}', key):
        raise RuntimeError('Unexpected device key')
    header = '#pragma once\n' + '\n'.join(credentials) + '\n'
    header += '#define NJ_TELEMETRY_URL "https://msi.tail4626fb.ts.net:10000/v1/ingest/barrels"\n'
    header += '#define NJ_TELEMETRY_BEARER ' + json.dumps(key) + '\n'
    ca = (ROOT / 'release' / 'msi-ca.h').read_text(encoding='utf-8')
    DEST.mkdir(parents=True, exist_ok=True)
    (DEST / 'Barel2.ino').write_text(text, encoding='utf-8', newline='\n')
    (DEST / 'secrets.h').write_text(header, encoding='utf-8', newline='\n')
    (DEST / 'msi-ca.h').write_text(ca, encoding='utf-8', newline='\n')
    receipt = {'source': str(SOURCE), 'source_sha256': hashlib.sha256(original).hexdigest(), 'candidate': str(DEST), 'candidate_sha256': hashlib.sha256(text.encode()).hexdigest(), 'compiled': False, 'flashed': False, 'installed_source_confirmed': False, 'changes': ['MSI URL and distinct bearer', 'verified TLS and NTP guard', 'remove cloud API key', 'remove JSON packet serial logging'], 'unchanged': ['sensor calculations', 'GPIO', 'Modbus IDs/registers', 'screen rendering', '15-second cadence']}
    (ROOT / 'barrels-preparation.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    print(json.dumps(receipt, indent=2))

if __name__ == '__main__':
    main()
