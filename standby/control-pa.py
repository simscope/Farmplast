import argparse, pathlib, json, hashlib, os, subprocess, urllib.request
p=argparse.ArgumentParser()
p.add_argument('action',choices=['probe','stop-cloud','activate-msi','rollback-cloud'],nargs='?',default='probe')
p.add_argument('--execute');p.add_argument('--msi-writes-stopped',action='store_true')
a=p.parse_args()
root=pathlib.Path('/root/farmplast-msi-reserve');live=pathlib.Path('/opt/farmplast-zkt-linux-bridge/.env')
manifest=json.loads((root/'prepared.json').read_text());service='farmplast-zkt-linux-bridge.service'
if os.uname().nodename!='hp-pen' or manifest['host']!='hp-pen':raise SystemExit('Unexpected PA host')
def digest(file):return hashlib.sha256(file.read_bytes()).hexdigest()
if digest(pathlib.Path('/opt/farmplast-zkt-linux-bridge/bridge.cjs'))!=manifest['hashes']['bridge.cjs']:raise SystemExit('Bridge source changed; refresh preparation')
def state():return subprocess.run(['systemctl','is-active',service],text=True,capture_output=True).stdout.strip()
def health():
    key=next(line.split('=',1)[1] for line in (root/'msi.env').read_text().splitlines() if line.startswith('SUPABASE_SERVICE_ROLE_KEY='))
    request=urllib.request.Request('https://msi.tail4626fb.ts.net:9444/api/reserve/bridge-health',headers={'Authorization':'Bearer '+key})
    with urllib.request.urlopen(request,timeout=20) as response:return json.load(response)
if a.action=='probe':
    result=health();print(json.dumps({'host':'hp-pen','ready':result['ready'],'mode':result['mode'],'commandsEnabled':result['commandsEnabled'],'cloudConfigUnchanged':digest(live)==manifest['hashes']['cloud.env'],'serviceState':state()}));raise SystemExit()
if a.execute!='PAYROLL-MSI-CUTOVER':raise SystemExit('Explicit operator cutover acknowledgement required')
if a.action=='stop-cloud':
    if digest(live)!=manifest['hashes']['cloud.env']:raise SystemExit('Live config changed; refresh preparation')
    subprocess.run(['systemctl','stop',service],check=True)
    if state()!='inactive':raise SystemExit('Worker did not stop')
    print('PA_CLOUD_WORKER_STOPPED');raise SystemExit()
if state()!='inactive':raise SystemExit('Stop PA worker before replacing config')
if a.action=='activate-msi':
    result=health()
    if not result['ready'] or result['mode']!='active' or not result['commandsEnabled']:raise SystemExit('MSI is not active; no worker started')
    if digest(live)!=manifest['hashes']['cloud.env']:raise SystemExit('Cloud config changed; refuse overwrite')
    replacement=root/'msi.env'
else:
    if not a.msi_writes_stopped:raise SystemExit('Rollback requires verified MSI write fence and no MSI workers')
    replacement=root/'cloud.env'
live.write_bytes(replacement.read_bytes());os.chmod(live,0o600)
subprocess.run(['systemctl','start',service],check=True)
if state()!='active':raise SystemExit('Worker did not start')
print('PA_WORKER_STARTED_'+a.action)
