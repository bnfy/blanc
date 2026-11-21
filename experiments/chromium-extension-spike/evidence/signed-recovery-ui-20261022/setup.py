from pathlib import Path
import shutil,os,json,hashlib,subprocess
r=Path('/private/tmp/blanc-signed-recovery-ui'); p=r/'profile'
assert not p.exists()
shutil.copytree('/private/tmp/blanc-save-retry-repair/recovery/isolated-home/Library/Application Support/Blanc Chromium Preview',p,symlinks=True)
for name in ['SingletonLock','SingletonSocket','SingletonCookie']:
 (p/name).unlink(missing_ok=True)
shutil.rmtree(p/'Default/Sessions',ignore_errors=True)
files=sorted((p/'Default/Sessions_Encrypted').glob('Session_*'));assert files
f=files[-1];data=f.read_bytes();(r/'held-session').write_bytes(data);f.unlink();os.mkfifo(f)
(r/'setup.json').write_text(json.dumps({'path':str(f),'sha256':hashlib.sha256(data).hexdigest()}))
log=(r/'browser.log').open('w'); proc=subprocess.Popen(['/private/tmp/blanc-save-retry-repair/Blanc Chromium Preview.app/Contents/MacOS/Blanc Preview Launcher','--user-data-dir='+str(p),'--remote-debugging-port=9893','--no-first-run','--restore-last-session','--hide-crash-restore-bubble'],stdout=log,stderr=log)
(r/'pid').write_text(str(proc.pid));print(proc.pid)
