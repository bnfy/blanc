from pathlib import Path
import hashlib, json, shutil

h=Path(__file__).resolve().parent
src=Path('<local-home>/Projects/BlancChromium158/src')
preview=Path('<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview')
overlay=h/'overlay'; assets=preview/'evidence/start-page-sunrise-20261029/assets-v2'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
inputs=json.loads((h/'base-inputs.json').read_text())
assert sha(src/'chrome/browser/ui/blanc_prototype_ui.cc') == inputs['ui-restored-base.cc']['sha256'], 'actual UI source changed; reconcile first'
assert sha(src/'chrome/browser/prefs/browser_prefs.cc') == inputs['prefs-base.cc']['sha256'], 'actual pref source changed; reconcile first'
assert not overlay.exists() and not assets.exists(), 'refusing to replace any staged candidate'
files={
 'chrome/browser/ui/blanc_prototype_ui.cc':h/'ui-candidate.cc',
 'chrome/browser/ui/launch_sunrise_integration.inc':h/'launch-sunrise-integration.inc',
 'chrome/browser/ui/launch_sunrise_disk.inc':h/'launch-sunrise-disk.inc',
 'chrome/browser/ui/launch_sunrise_gate.h':h.parent/'launch-sunrise-draft/launch_sunrise_gate.h',
 'chrome/browser/prefs/browser_prefs.cc':h/'prefs-candidate.cc',
}
for relative,source in files.items():
    target=overlay/relative;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target)
base=preview/'evidence/start-page-sunrise-20261029/assets-v1'
base_manifest=json.loads((base.parent/'manifest-v1.json').read_text())['files']
assert {str(p.relative_to(base)):sha(p) for p in sorted(base.rglob('*')) if p.is_file()}==base_manifest
shutil.copytree(base,assets)
for relative,source in {'host.js':h/'host-candidate.js','pages/newtab-adapter.js':h/'adapter-candidate.js',
                        'settings-home.html':h/'settings-home.html','appearance-settings.html':h/'appearance-settings.html',
                        'appearance-settings.js':h/'appearance-settings.js'}.items():
    shutil.copy2(source,assets/relative)
result={'overlay':{str(p.relative_to(overlay)):sha(p) for p in sorted(overlay.rglob('*')) if p.is_file()},
        'assets':{str(p.relative_to(assets)):sha(p) for p in sorted(assets.rglob('*')) if p.is_file()},
        'actualInputHashes':{k:v['sha256'] for k,v in inputs.items() if k in ('ui-restored-base.cc','prefs-base.cc')}}
(h/'overlay-manifest.json').write_text(json.dumps(result,indent=2)+'\n')
print('Staged isolated checkout-relative source overlay and asset candidate')
