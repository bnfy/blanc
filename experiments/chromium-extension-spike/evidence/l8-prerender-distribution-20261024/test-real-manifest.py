import pathlib, tempfile, shutil, os, json, subprocess
root=pathlib.Path('/private/tmp/blanc-prerender-final-20261024')
results=[]
for kind in ('manifest','artifact'):
 d=pathlib.Path(tempfile.mkdtemp(prefix='manifest-negative-',dir=root))
 try:
  for f in (root/'artifacts').iterdir(): os.link(f,d/f.name)
  target=d/('SHA256SUMS' if kind=='manifest' else next(p.name for p in d.glob('*.cdx.json')))
  original=target.read_bytes(); target.unlink(); target.write_bytes(original+b'\n' if kind=='artifact' else (b'1' if original[:1]==b'0' else b'0')+original[1:])
  p=subprocess.run(['python3','/private/tmp/blanc-chromium157-work/experiments/chromium-extension-spike/preview/verify_artifacts.py','--directory',str(d),'--version','157.0.8103.15','--source','14706b0e8d4753d2a7ef35ea32a875b516366b0d','--cosign','/private/tmp/blanc-l6-restore-final/bin/cosign'],capture_output=True,text=True)
  (root/('negative-'+kind+'.log')).write_text(p.stdout+p.stderr)
  assert p.returncode!=0,kind+' tampering accepted'
  if kind=='artifact': assert 'Artifact checksum mismatch' in p.stderr
  else: assert 'CalledProcessError' in p.stderr
  results.append({'case':kind,'exitCode':p.returncode,'rejected':True})
 finally: shutil.rmtree(d)
(root/'negative-verification.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps(results))
