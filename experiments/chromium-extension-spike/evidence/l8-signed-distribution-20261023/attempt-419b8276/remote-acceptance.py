from pathlib import Path
import sys,json,subprocess,hashlib,urllib.parse,os,shutil,time
ROOT=Path('/private/tmp/blanc-l8-acceptance');HOME=Path.home()
def digest(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
def command(args):
 p=subprocess.run(args,capture_output=True,text=True);return {'exitCode':p.returncode,'stdout':p.stdout,'stderr':p.stderr}
def save(name,value):
 ROOT.mkdir(exist_ok=True);(ROOT/(name+'.json')).write_text(json.dumps(value,indent=2)+'\n');print(json.dumps(value))
def shipping():
 app=Path('/Applications/Blanc.app');files=['Contents/Info.plist','Contents/MacOS/Blanc','Contents/Resources/app.asar'];return {x:digest(app/x) for x in files if (app/x).is_file()}
action=sys.argv[1]
if action=='preflight':
 assert not ROOT.exists(),'Acceptance directory already exists'
 data={'OS':command(['sw_vers']), 'architecture':command(['uname','-m']), 'defaultPreviewProfileExists':(HOME/'Library/Application Support/Blanc Chromium Preview').exists(),'installedPreviewExists':Path('/Applications/Blanc Chromium Preview.app').exists(),'shippingFiles':shipping()}
 assert not data['defaultPreviewProfileExists'] and not data['installedPreviewExists'],'Not a clean Preview application state'
 save('preflight',data)
elif action=='extract':
 details=json.loads((ROOT/'artifact-details.json').read_text());name=details['archive'];download=HOME/'Downloads'/name
 assert download.is_file(),'Native Safari download is not present: '+str(download)
 assert digest(download)==details['archiveSha256'],'Download digest mismatch'
 quarantine=command(['xattr','-p','com.apple.quarantine',str(download)]);assert quarantine['exitCode']==0 and 'Safari' in quarantine['stdout'],'Native Safari quarantine missing'
 origins=command(['mdls','-raw','-name','kMDItemWhereFroms',str(download)])
 data={'filename':name,'sha256':digest(download),'quarantine':quarantine,'originMetadataAvailable':origins['exitCode']==0,'downloadAgent':'Safari; native download, no synthetic quarantine'}
 incoming=ROOT/'incoming';incoming.mkdir();os.rename(download,incoming/name);save('download',data)
 result=command(['open','-a','Archive Utility',str(incoming/name)]);assert result['exitCode']==0,result
 save('extraction-request',result)
elif action=='verify':
 app=ROOT/'incoming/Blanc Chromium Preview.app';assert app.exists(),'Archive Utility extraction is not complete'
 data={'codesign':command(['codesign','--verify','--deep','--strict',str(app)]),'gatekeeper':command(['spctl','--assess','--type','execute','--verbose=4',str(app)]),'stapler':command(['xcrun','stapler','validate',str(app)]),'quarantine':command(['xattr','-p','com.apple.quarantine',str(app)])}
 assert all(data[k]['exitCode']==0 for k in data),data
 data['shippingFilesUnchanged']=shipping()==json.loads((ROOT/'preflight.json').read_text())['shippingFiles'];assert data['shippingFilesUnchanged']
 save('extracted-verification',data)
elif action=='launch':
 app=ROOT/'incoming/Blanc Chromium Preview.app';assert app.exists()
 save('launch-request',command(['open','-n',str(app),'--args','--user-data-dir='+str(ROOT/'profile'),'--remote-debugging-port=9945','--no-first-run','http://127.0.0.1:9944/a']))
elif action=='after':
 data={'shippingFilesUnchanged':shipping()==json.loads((ROOT/'preflight.json').read_text())['shippingFiles'],'defaultPreviewProfileStillAbsent':not(HOME/'Library/Application Support/Blanc Chromium Preview').exists()};assert all(data.values()),data;save('preservation',data)
else:raise ValueError(action)
