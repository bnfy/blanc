from pathlib import Path
import json,shlex,subprocess
root=Path(__file__).resolve().parent;log=root.parent/'search-host-routing-draft/build-158.log'
line=next(l for l in log.read_text().splitlines() if l.startswith('../../third_party/llvm-build/Release+Asserts/bin/clang++ '));a=shlex.split(line)
i=a.index('-MF');del a[i:i+2];a.remove('-MMD');i=a.index('-o');del a[i:i+2];a[a.index('../../chrome/browser/ui/blanc_prototype_ui.cc')]=str(root/'fresh_default_adapter.cc');a.remove('-c');a+=['-fsyntax-only','-I',str(root)]
cwd='<local-home>/Projects/BlancChromium158/src/out/BlancPrototype'
p=subprocess.run(a,cwd=cwd,text=True,capture_output=True);(root/'strict-syntax.log').write_text(p.stdout+p.stderr);(root/'strict-syntax.json').write_text(json.dumps({'argv':a,'cwd':cwd,'exit':p.returncode},indent=2)+'\n');print('strict syntax exit',p.returncode);print((p.stdout+p.stderr)[-3000:]);raise SystemExit(p.returncode)
