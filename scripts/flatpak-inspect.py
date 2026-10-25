import os, json, pathlib
rows=[]
for p in pathlib.Path('/proc').iterdir():
 if not p.name.isdigit(): continue
 try:
  exe=os.readlink(p/'exe')
  if not exe.startswith('/app/lib/blanc/') or not exe.endswith('/blanc'): continue
  cmd=(p/'cmdline').read_bytes().replace(b'\0',b' ').decode(errors='replace')
  status=dict(s.split(':',1) for s in (p/'status').read_text().splitlines() if ':' in s)
  env={}
  for entry in (p/'environ').read_bytes().split(b'\0'):
   key,sep,val=entry.partition(b'=')
   if sep and key in [b'CHROME_DESKTOP',b'LD_PRELOAD',b'ZYPAK_LD_PRELOAD',b'BLANC_ECS_FULL_PROFILE']: env[key.decode()]=val.decode(errors='replace')
  ns={k:os.readlink(p/'ns'/k) for k in ['user','pid','mnt','net']}
  maps=[s for s in (p/'maps').read_text().splitlines() if any(x in s for x in ['libzypak','blanc-cdm-preload','libwidevine','libgio'])]
  rows.append(dict(pid=int(p.name),exe=exe,cmd=cmd,env=env,ns=ns,status={k:status.get(k,'').strip() for k in ['PPid','NSpid','Threads','NoNewPrivs','Seccomp','Seccomp_filters']},maps=maps))
 except (OSError,ValueError): continue
print(json.dumps(rows,indent=2))
