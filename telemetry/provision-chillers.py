"""Read the three verified build configurations locally on MSI; never print keys."""
from pathlib import Path
import json
import re

ROOT=Path(r'E:\SimScopeData\Farmplast\NJTelemetry')
SOURCES=Path(r'C:\Users\sandr\Documents\PC-Sync-Work\farmplast')
def string(text,name):
    pattern=rf'(?:#define\s+{name}\s+|(?:static\s+)?const\s+char\s*\*\s*{name}\s*=\s*)"((?:\\.|[^"\\])*)"'
    values=re.findall(pattern,text)
    if len(values)!=1:
        raise RuntimeError('Expected exactly one local '+name)
    return json.loads('"'+values[0]+'"')

def main():
    path=ROOT/'private'/'config.json'
    config=json.loads(path.read_text(encoding='utf-8-sig'))
    keys={}
    ch1=SOURCES/'ch1-edge-free'/'firmware'/'Chiller1'
    keys['chiller-1']=string((ch1/'ota_config.h').read_text(encoding='utf-8-sig'),'CH1_OTA_DEVICE_KEY')
    for n in (2,3):
        source=SOURCES/f'ch{n}-edgefree-1-real-src'/f'Chiller{n}'
        keys[f'chiller-{n}']=string((source/'secrets.h').read_text(encoding='utf-8-sig'),'DEVICE_SECRET')
    if any(len(k)<16 for k in keys.values()) or len(set(keys.values()))!=3:
        raise RuntimeError('Invalid or reused legacy device credential')
    config['legacyKeys']=keys
    config['cloud']={'url':'https://eeobivvwjzakbweluwtm.supabase.co','anonKey':string((ch1/'secrets.h').read_text(encoding='utf-8-sig'),'SUPABASE_ANON_KEY')}
    path.write_text(json.dumps(config,indent=2),encoding='utf-8')
    (ROOT/'private'/'owner-provision.json').write_text(json.dumps({'readKey':config['readKey'],'devices':config['devices'],'cloud':config['cloud']}),encoding='utf-8')
    print(json.dumps({'configured_producers':list(keys),'credentials_printed':False,'cloud_contains_service_role':False}))
if __name__=='__main__': main()
