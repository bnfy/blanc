import subprocess,pathlib
r=pathlib.Path('/private/tmp/blanc-l7-repair')
with (r/'signing-desktop.log').open('w') as f:
 p=subprocess.run(['python3',str(r/'sign.py'),'--app',str(r/'Blanc Chromium Preview.app'),'--identity','55283A84D3706D5A22386D5F002A0CD4845ECFD4','--entitlements',str(r/'entitlements'),'--report',str(r/'signing-report.json')],stdout=f,stderr=f)
(r/'signing-desktop.exit').write_text(str(p.returncode))
