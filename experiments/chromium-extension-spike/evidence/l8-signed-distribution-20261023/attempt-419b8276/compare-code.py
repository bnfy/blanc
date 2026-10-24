from pathlib import Path
import json,struct,hashlib
old=Path('/private/tmp/blanc-l6-close-warning-final/Blanc Chromium Preview.app');new=Path('/private/tmp/blanc-l8-distribution/Blanc Chromium Preview.app');audit=json.loads(Path('/private/tmp/blanc-l8-distribution/signed-candidate-audit.json').read_text())
def code_hash(path):
 with path.open('rb') as f:
  header=f.read(32);assert header[:4]==bytes.fromhex('cffaedfe')
  count,size=struct.unpack_from('<II',header,16);commands=bytearray(f.read(size));pos=0;offset=None;length=None
  for _ in range(count):
   cmd,n=struct.unpack_from('<II',commands,pos)
   if cmd==0x1d:
    offset,length=struct.unpack_from('<II',commands,pos+8);struct.pack_into('<I',commands,pos+12,0)
   pos+=n
  assert offset is not None and offset+length==path.stat().st_size
  h=hashlib.sha256(header+commands);remaining=offset-32-size
  while remaining:
   b=f.read(min(1024*1024,remaining));assert b;h.update(b);remaining-=len(b)
  return h.hexdigest()
rows=[]
for item in audit['machO']:
 p=item['path'];a=code_hash(old/p);b=code_hash(new/p);rows.append({'path':p,'previousExecutableCodeSha256':a,'currentExecutableCodeSha256':b,'same':a==b})
result={'method':'Hash the full Mach-O before LC_CODE_SIGNATURE data, normalizing only signature-size metadata. Verify signature allocation ends at EOF; code, load commands and other pre-signature bytes remain covered.','previousSource':'f4996df4e88c775bc1947a574b2bd7a0f9ad7539','currentSource':'419b8276fd42e115fdea793d461fb5f4e1642a24','rows':rows,'allCodeUnchanged':all(r['same'] for r in rows)}
Path('/private/tmp/blanc-l8-distribution/code-equivalence.json').write_text(json.dumps(result,indent=2)+'\n');print('Native code unchanged:',result['allCodeUnchanged'],'of',len(rows));print([r['path'] for r in rows if not r['same']])
