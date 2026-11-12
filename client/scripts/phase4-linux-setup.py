"""Isolated Linux prerequisite setup; no production connections or credentials.

Uses PostgreSQL 17.6, upstream pg_cron v1.6.4 and Vault v0.3.1 installed first.
pg_cron SQL version canonicalization follows Supabase's official nix recipe.
Never run on an existing database host.
"""
import pathlib, subprocess
root=pathlib.Path('/vercel/phase4')
assert root.is_dir() and not (root/'data').exists(), 'New isolated cluster required'
ext=root/'pg/share/postgresql/extension'
# Supabase maps the schema-identical upstream SQL 1.6 to canonical 1.6.4.
versions={'1.0':'1.0.0','1.1':'1.1.0','1.2':'1.2.0','1.3':'1.3.1','1.4':'1.4.0','1.4-1':'1.4.2','1.5':'1.5.2','1.6':'1.6.4'}
for source in list(ext.glob('pg_cron--*.sql')):
    parts=source.stem.split('--')
    name='--'.join([parts[0]]+[versions.get(v,v) for v in parts[1:]])+'.sql'
    (ext/name).write_bytes(source.read_bytes())
control=ext/'pg_cron.control'
control.write_text(control.read_text().replace("default_version = '1.6'","default_version = '1.6.4'"))
subprocess.run([str(root/'pg/bin/initdb'),'-D',str(root/'data'),'-U','phase4_admin','--auth=trust'],check=True,stdout=subprocess.DEVNULL)
(root/'data/postgresql.conf').write_text((root/'data/postgresql.conf').read_text()+"\nshared_preload_libraries='pg_cron,pg_stat_statements'\ncron.database_name='phase4_restore'\ncron.launch_active_jobs=off\ncron.log_run=off\nlisten_addresses='127.0.0.1'\nport=55440\nwal_level=logical\n")
subprocess.run([str(root/'pg/bin/pg_ctl'),'-D',str(root/'data'),'-l',str(root/'private/server.log'),'-w','start'],check=True,stdout=subprocess.DEVNULL)
print('Isolated PostgreSQL started with cron.launch_active_jobs=off')
