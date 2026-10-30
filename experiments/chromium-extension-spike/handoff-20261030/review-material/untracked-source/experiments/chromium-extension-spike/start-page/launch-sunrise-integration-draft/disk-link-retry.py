from pathlib import Path
import json,subprocess
h=Path(__file__).resolve().parent
data=json.loads((h/'disk-commands.json').read_text());out=Path(data['cwd']);cmd=data['link']
lines=(out/'obj/chrome/chrome_framework_shared_library.ninja').read_text().splitlines()
rlibs=next(x.split()[2:] for x in lines if x.startswith('  rlibs = '))
extra=['obj/third_party/rust/serde_json_lenient/v0_2/wrapper/wrapper_cxx_generated/lib.rs.o','obj/build/rust/cxx_cppdeps_lib/cxx.o']+rlibs
cmd=cmd[:-2]+extra+cmd[-2:]
(h/'disk-link-retry-command.json').write_text(json.dumps({'cwd':str(out),'argv':cmd},indent=2)+'\n')
r=subprocess.run(cmd,cwd=out,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
(h/'disk-link-retry.log').write_text(r.stdout);print('retry exit',r.returncode);print(r.stdout[-5000:]);
if r.returncode:raise SystemExit(r.returncode)
r=subprocess.run(data['run'],cwd=out,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
(h/'disk-run.log').write_text(r.stdout);print('reader exit',r.returncode);print(r.stdout);raise SystemExit(r.returncode)
