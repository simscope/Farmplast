import os, pathlib, shutil, hashlib, json, datetime, subprocess
root = pathlib.Path('/root/farmplast-msi-reserve')
if (root/'prepared.json').exists(): raise SystemExit('Existing preparation requires review')
root.mkdir(mode=0o700, exist_ok=True)
os.chmod(root,0o700)
items={'cloud.env':'/opt/farmplast-zkt-linux-bridge/.env','service.unit':'/etc/systemd/system/farmplast-zkt-linux-bridge.service','bridge.cjs':'/opt/farmplast-zkt-linux-bridge/bridge.cjs'}
hashes={}
for name,source in items.items():
    shutil.copyfile(source,root/name);os.chmod(root/name,0o600)
    hashes[name]=hashlib.sha256((root/name).read_bytes()).hexdigest()
status=subprocess.check_output(['systemctl','is-active','farmplast-zkt-linux-bridge.service'],text=True).strip()
(root/'prepared.json').write_text(json.dumps({'host':os.uname().nodename,'preparedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'hashes':hashes,'state':status,'activeBackend':'Supabase'},indent=2))
os.chmod(root/'prepared.json',0o600)
print(json.dumps({'prepared':True,'serviceState':status,'productionUnchanged':True}))
