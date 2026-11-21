import json,struct,pathlib
root=pathlib.Path('/private/tmp/blanc-grouped-fix');out={}
for phase in ['before','after']:
 out[phase]=[]
 for p in sorted((root/phase/'Sessions').glob('Session_*')):
  b=p.read_bytes();o=8;windows=[];tabs=[];identities=[]
  while o+2<=len(b):
   n=struct.unpack_from('<H',b,o)[0];o+=2
   if not n or o+n>len(b):break
   k=b[o];x=b[o+1:o+n];o+=n
   if k==9:windows.append(struct.unpack_from('<ii',x))
   if k==0:tabs.append(struct.unpack_from('<ii',x))
   if k==34 and b'blanc.window.identity.v1' in x:identities.append(x[-36:].decode())
  out[phase].append(dict(file=p.name,bytes=len(b),windowTypes=windows,tabWindows=tabs,identities=identities))
(root/'session-records.json').write_text(json.dumps(out,indent=2));print(json.dumps(out,indent=2))
