from pathlib import Path
import subprocess,json,shutil
r=Path(__file__).parent; old=Path('/private/tmp/blanc-l8-startup-corrected/regression/nonregular');rows=[]
s=(old/'run.mjs').read_text().replace("throw Error('startup deadline exceeded')","{try{execFileSync('sample',[String(child.pid),'1','1','-file',root+'/startup-stall-sample.txt'],{stdio:'ignore'})}catch{}throw Error('startup deadline exceeded')}")
s=s.replace("app+'/Contents/MacOS/Blanc Preview Launcher'", "app+'/Contents/MacOS/Blanc Prototype'").replace("['--user-data-dir='+profile", "['--blanc-restore-diagnostic','--blanc-prototype-assets=/private/tmp/blanc-l8-startup-corrected/Blanc Chromium Preview.app/Contents/Resources/BlancAssets','--blanc-blocker-assets=/private/tmp/blanc-l8-startup-corrected/Blanc Chromium Preview.app/Contents/Resources/BlancBlocker','--user-data-dir='+profile")
for i in range(1,13):
 d=r/('signed-diagnostic-'+str(i));d.mkdir();(d/'run.mjs').write_text(s);shutil.copyfile(old/'cdp.mjs',d/'cdp.mjs')
 with (d/'console.log').open('w') as f:p=subprocess.run(['/usr/local/bin/node',str(d/'run.mjs'),'/private/tmp/blanc-l6-restore-diagnostic/Blanc Chromium Preview.app'],stdout=f,stderr=f,timeout=180)
 report=json.loads((d/'pipe-report.json').read_text());row={'cycle':i,'exitCode':p.returncode,'checks':len(report.get('checks',[])),'error':report.get('error')};rows.append(row);(r/'signed-diagnostic-summary.json').write_text(json.dumps(rows,indent=2)+'\n');print(json.dumps(row),flush=True)
 if p.returncode:break
