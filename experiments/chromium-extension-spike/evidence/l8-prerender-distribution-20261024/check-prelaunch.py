from pathlib import Path
import json,subprocess
r=Path('/private/tmp/blanc-prerender-final-20261024');d=json.loads((r/'native-download.json').read_text());found=[]
for line in subprocess.check_output(['ps','-axo','pid=,comm='],text=True).splitlines():
 parts=line.strip().split(None,1)
 if len(parts)!=2 or not parts[1].endswith('/Blanc Prototype') or '.app/' not in parts[1]:continue
 app=Path(parts[1].split('.app/',1)[0]+'.app')
 try:revision=json.loads((app/'Contents/Resources/preview-build.json').read_text()).get('revision')
 except (OSError,ValueError):continue
 if revision==d['source']:found.append({'pid':int(parts[0]),'app':str(app)})
out={'source':d['source'],'downloadedPath':d['path'],'matchingReplacementProcesses':found,'os':subprocess.check_output(['sw_vers'],text=True),'architecture':subprocess.check_output(['uname','-m'],text=True).strip()}
assert not found,out
Path('/private/tmp/blanc-l8-prerender-20261024/native-prelaunch.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
