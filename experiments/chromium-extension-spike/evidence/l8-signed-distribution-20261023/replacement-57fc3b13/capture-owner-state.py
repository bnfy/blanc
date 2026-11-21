from pathlib import Path
import json,hashlib,subprocess,sys
root=Path('/private/tmp/blanc-l8-notices-final');profile=Path.home()/'Library/Application Support/Blanc Chromium Preview';bitwarden='nngceckbapebfimnlniiiahkandclblb'
result={'phase':sys.argv[1],'previewProfileExists':profile.is_dir(),'extension':{},'shippingHashes':{}}
for name in ['Preferences','Secure Preferences']:
 p=profile/'Default'/name
 if not p.is_file():continue
 settings=json.loads(p.read_text()).get('extensions',{}).get('settings',{})
 if bitwarden in settings:
  x=settings[bitwarden];result['extension'][name]={'state':x.get('state'),'from_webstore':x.get('from_webstore'),'disable_reasons':x.get('disable_reasons'),'manifestVersion':x.get('manifest',{}).get('version'),'location':x.get('location')}
folder=profile/'Default/Extensions'/bitwarden
if folder.is_dir():
 for p in folder.glob('*/manifest.json'):
  m=json.loads(p.read_text());result.setdefault('installedManifests',[]).append({'version':m.get('version'),'update_url':m.get('update_url'),'name':m.get('name')})
for name in ['Contents/Info.plist','Contents/MacOS/Blanc','Contents/Resources/app.asar']:
 p=Path('/Applications/Blanc.app')/name
 if p.is_file():result['shippingHashes'][name]=hashlib.sha256(p.read_bytes()).hexdigest()
baseline=json.loads(Path('/private/tmp/blanc-l8-acceptance/preflight.json').read_text())['shippingFiles'];result['shippingFilesUnchanged']=result['shippingHashes']==baseline;assert result['shippingFilesUnchanged']
(root/('owner-state-'+sys.argv[1]+'.json')).write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
