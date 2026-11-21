from pathlib import Path
import sys,json,hashlib,subprocess,urllib.parse,plistlib
root=Path('/private/tmp/blanc-l8-acceptance'); downloads=Path(sys.argv[1]) if len(sys.argv)>1 else Path.home()/'Downloads'; details=json.loads((root/'artifact-details.json').read_text())
def cmd(args):
 p=subprocess.run(args,capture_output=True);return {'exitCode':p.returncode,'stdout':p.stdout.decode(errors='replace'),'stderr':p.stderr.decode(errors='replace')}
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
archive=downloads/details['archive']; app=downloads/'Blanc Chromium Preview.app'; out={}
if archive.is_file():
 out['archive']={'name':archive.name,'sha256':sha(archive),'quarantine':cmd(['xattr','-p','com.apple.quarantine',str(archive)])}
 assert out['archive']['sha256']==details['archiveSha256'],'Wrong downloaded bytes'
 assert out['archive']['quarantine']['exitCode']==0 and 'Safari' in out['archive']['quarantine']['stdout'],'Safari quarantine required'
 p=subprocess.run(['xattr','-px','com.apple.metadata:kMDItemWhereFroms',str(archive)],capture_output=True)
 if p.returncode==0:
  urls=plistlib.loads(bytes.fromhex(p.stdout.decode()))
  out['archive']['originHosts']=sorted({urllib.parse.urlparse(u).hostname for u in urls if urllib.parse.urlparse(u).hostname})
if app.is_dir():
 out['extractedApp']={'path':str(app),'quarantine':cmd(['xattr','-p','com.apple.quarantine',str(app)]),'codesign':cmd(['codesign','--verify','--deep','--strict',str(app)]),'gatekeeper':cmd(['spctl','--assess','--type','execute','--verbose=4',str(app)]),'stapler':cmd(['xcrun','stapler','validate',str(app)])}
 assert all(out['extractedApp'][k]['exitCode']==0 for k in ['quarantine','codesign','gatekeeper','stapler']),out['extractedApp']
assert out,'Download not found yet'
(root/'native-download.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
