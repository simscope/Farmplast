"""Prepare a private, unflashed candidate from the owner's local Waveshare source.

No serial port is opened. The original file is never modified. Credentials stay
in private owner/MSI folders. This does not establish that the source matches
the installed firmware.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re

ROOT = Path(r'E:\SimScopeData\Farmplast\NJTelemetry')
SOURCE = Path(r'D:\Farmplast\Tank-Barrel1\Barel2\Barel2.ino')
EXPECTED_SHA256 = '369a4e2aafe61d0204c0ec7936f9565df4d53bea3a37e69afc90e10540762124'
DEST = ROOT / 'private' / 'barrels-candidate' / 'Barel2'

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=SOURCE)
    parser.add_argument('--dest', type=Path, default=DEST)
    parser.add_argument('--config', type=Path, default=ROOT / 'private' / 'config.json')
    parser.add_argument('--ca', type=Path, default=Path(__file__).resolve().parents[1] / 'firmware' / 'common' / 'msi-ca.h')
    parser.add_argument('--panel-config', type=Path, required=True)
    parser.add_argument('--receipt', type=Path, default=ROOT / 'barrels-preparation.json')
    args = parser.parse_args()
    original = args.source.read_bytes()
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
    # Remove diagnostic sample dumps; sensor calculations and screen rendering stay intact.
    text, dumps = re.subn(r'  Serial\.println\("----- BARREL[12] [^\n]*\n.*?  Serial\.flush\(\);', '  // Sample diagnostics disabled: live display only.', text, flags=re.S)
    if dumps != 2:
        raise RuntimeError('Unexpected sensor diagnostic blocks')
    text = text.replace('  Serial.println("BOOT: ESP32-S3 Dual Barrel Monitor");', '  Serial.println("BOOT: ESP32-S3 Dual Barrel Monitor / barrels-msi-1");')
    text = text.replace('Supabase: DIRECT REST telemetry_latest by point_id', 'MSI: current readings in RAM only')
    if 'eeobivvwjzakbweluwtm.supabase.co' in text or 'SUPABASE_ANON_KEY' in text or '.setInsecure()' in text:
        raise RuntimeError('Old cloud transport remains')
    config = json.loads(args.config.read_text(encoding='utf-8-sig'))
    key = config['devices']['barrels']
    if not re.fullmatch(r'[a-f0-9]{64}', key):
        raise RuntimeError('Unexpected device key')
    header = '#pragma once\n' + '\n'.join(credentials) + '\n'
    header += '#define NJ_TELEMETRY_URL "https://farmplast.vercel.app/api/nj-ingest/barrels"\n'
    header += '#define NJ_TELEMETRY_BEARER ' + json.dumps(key) + '\n'
    ca = args.ca.read_text(encoding='utf-8')
    panel = args.panel_config.read_text(encoding='utf-8')
    panel = panel.replace('#define ESP_PANEL_BOARD_DEFAULT_USE_SUPPORTED       (0)', '#define ESP_PANEL_BOARD_DEFAULT_USE_SUPPORTED       (1)')
    panel, selected = re.subn(r'^// #define BOARD_WAVESHARE_ESP32_S3_TOUCH_LCD_7\s*$', '#define BOARD_WAVESHARE_ESP32_S3_TOUCH_LCD_7', panel, flags=re.M)
    if selected != 1:
        raise RuntimeError('Unexpected panel configuration template')
    args.dest.mkdir(parents=True, exist_ok=True)
    (args.dest / 'Barel2.ino').write_text(text, encoding='utf-8', newline='\n')
    (args.dest / 'secrets.h').write_text(header, encoding='utf-8', newline='\n')
    (args.dest / 'msi-ca.h').write_text(ca, encoding='utf-8', newline='\n')
    (args.dest / 'esp_panel_board_supported_conf.h').write_text(panel, encoding='utf-8', newline='\n')
    receipt = {'source': str(args.source), 'source_sha256': hashlib.sha256(original).hexdigest(), 'candidate': str(args.dest), 'candidate_sha256': hashlib.sha256(text.encode()).hexdigest(), 'version': 'barrels-msi-1', 'compiled': False, 'flashed': False, 'installed_source_confirmed': False, 'changes': ['MSI URL through HTTPS443 gateway and distinct bearer', 'verified TLS and NTP guard', 'remove cloud API key', 'remove sample serial logging', 'explicit Waveshare 7 panel build configuration'], 'unchanged': ['sensor calculations', 'GPIO', 'Modbus IDs/registers', 'screen rendering', '15-second cadence']}
    args.receipt.parent.mkdir(parents=True, exist_ok=True)
    args.receipt.write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    print(json.dumps(receipt, indent=2))

if __name__ == '__main__':
    main()
