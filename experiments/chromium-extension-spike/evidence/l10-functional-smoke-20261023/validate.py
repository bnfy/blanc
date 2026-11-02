from pathlib import Path
import json,hashlib
r=Path(__file__).resolve().parent
def read(p):return json.loads((r/p).read_text())
core=read('core/report.json');assert core['complete'] and len(core['checks'])==17 and all(x['pass'] for x in core['checks'])
for phase in ['installed','applied','restart']:
 row=read('store/'+phase+'.json');assert row['theme']['id']=='lelfanicbadaahlibeimcpfpedfjccnk';assert row['prefs']['wallpaper']['source']=='web-store';assert row['image']['width']==1920
for phase in ['undo','removed','removed-restart']:
 row=read('store/'+phase+'.json');assert not row['theme'];assert row['prefs']['wallpaper']['source']!='web-store'
assert read('store/restart.json')['prefs']['wallpaper']['wash']==55
assert read('store/restart.json')['prefs']['wallpaper']['style']=='spotlight'
assert not read('store/install-cancel.json')['cancelledExtensionPresentInSecurePreferences']
x=read('store/extension-restart.json');assert x['state']=='ENABLED' and x['location']=='FROM_STORE' and x['version']=='2026.10.0'
for f in ['popup.json','popup-restart.json']:
 x=read('store/'+f);assert x['focused'] if 'focused' in x else x['focus'];assert 'chrome-extension://nngceckbapebfimnlniiiahkandclblb/' in x['url']
assert read('store/extension-removed.json')['removed']
assert all(read('password-fill.json').values())
x=read('store/final-persistence.json');assert x['importedBookmarkPresent'] and x['removedThemeAbsent'] and x['removedExtensionAbsent'] and all(x['syntheticCredentialFilledAfterRestart'].values())
x=read('store/signin-config.json');assert x['signinAllowed'] is False and x['signinAvailable'] is False
assert read('store/extension-scope.json')['nativeMessagingPermission'] is False
assert read('artifact-after.json')['unchanged'] and read('artifact-after.json')['executables']==17
for f,h in read('SHA256.json').items():assert hashlib.sha256((r/f).read_bytes()).hexdigest()==h,f
print('17 core checkpoints, six theme phases, Store/popup/import/password persistence and all evidence hashes verified.')
