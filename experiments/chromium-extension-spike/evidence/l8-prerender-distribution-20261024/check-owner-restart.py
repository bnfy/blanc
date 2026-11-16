from pathlib import Path
import subprocess,json,struct,hashlib,os,re
r=Path('/private/tmp/blanc-l8-prerender-20261024');inv=json.loads(next(Path('/private/tmp/blanc-prerender-final-20261024/artifacts').glob('*.files.json')).read_text());found=[]
for line in subprocess.check_output(['ps','-axo','pid=,comm='],text=True).splitlines():
 s=line.strip().split(None,1)
 if len(s)!=2 or not s[1].endswith('/Blanc Prototype') or '.app/' not in s[1]:continue
 app=Path(s[1].split('.app/',1)[0]+'.app');m=app/'Contents/Resources/preview-build.json'
 try:d=json.loads(m.read_text())
 except (OSError,ValueError):continue
 if d.get('revision')!=inv['sourceRevision']:continue
 args=subprocess.check_output(['ps','-ww','-p',s[0],'-o','args='],text=True)
 for name,x in inv['files'].items():
  p=app/name;h=hashlib.sha256()
  with p.open('rb') as f:
   for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
  assert h.hexdigest()==x['sha256'],name
 for name,target in inv['symlinks'].items():assert os.readlink(app/name)==target,name
 found.append({'pid':int(s[0]),'app':str(app),'source':d['revision'],'userDataDir':re.findall(r'--user-data-dir=(.*?)(?=\s--|\n|$)',args),'regularFilesMatched':len(inv['files']),'symlinksMatched':len(inv['symlinks'])})
assert len(found)==1,found
profile=Path.home()/'Library/Application Support/Blanc Chromium Preview';sessions=[]
for p in sorted((profile/'Default/Sessions').glob('Session_*')):
 b=p.read_bytes();assert b[:4]==b'SNSS';off=8;tabs={}
 while off+2<=len(b):
  n=struct.unpack_from('<H',b,off)[0];off+=2
  if not n or off+n>len(b):raise ValueError('Incomplete record')
  v=b[off:off+n];off+=n;cmd=v[0];d=v[1:]
  if cmd==6:
   tid,idx,n=struct.unpack_from('<iii',d,4);tabs.setdefault(tid,{})[idx]=d[16:16+n].decode('utf8')
  elif cmd==16:tabs.pop(struct.unpack_from('<i',d)[0],None)
 urls=[u for t in tabs.values() for u in t.values() if u.startswith(('https://example.com','https://example.org'))]
 sessions.append({'file':p.name,'tabRecords':len(tabs),'exampleNavigationUrls':urls})
out={'runningCandidate':found[0],'savedSessions':sessions,'inspection':'Read-only; no restart/profile mutation performed'}
(r/'owner-restart-postcheck.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
