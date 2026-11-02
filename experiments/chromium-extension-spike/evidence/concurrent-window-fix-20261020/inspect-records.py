import pathlib,struct,json
root=pathlib.Path('/private/tmp/blanc-overlap-fix');out={}
for phase in ['before-crash','after-crash']:
 r=root/phase;entry={'preferencesPresent':(r/'Default/Preferences').is_file(),'sessions':[]}
 for p in sorted(r.glob('Default/Sessions/Session_*')):
  b=p.read_bytes();o=8;ids=[];w=[]
  while o+2<=len(b):
   n=struct.unpack_from('<H',b,o)[0];o+=2
   if not n or o+n>len(b):break
   k=b[o];x=b[o+1:o+n];o+=n
   if k==9:w.append(struct.unpack_from('<ii',x))
   if k==34 and b'blanc.window.identity.v1' in x:ids.append(x[-36:].decode())
  entry['sessions'].append(dict(file=p.name,bytes=len(b),windowTypes=w,identities=ids))
 out[phase]=entry
(root/'session-records.json').write_text(json.dumps(out,indent=2));print(json.dumps(out,indent=2))
