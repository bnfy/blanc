from pathlib import Path
import subprocess,json,sys,hashlib
r=Path('/private/tmp/blanc-l11-fix');phase=sys.argv[1];exe=Path('/private/tmp/blanc-chromium157-update/src/out/BlancPrototype/cert_verify_tool');out=[]
for cert in sorted((r/'certificates').glob('*.pem')):
 for mode in ['builtin','downloaded']:
  args=[str(exe),'--impls=builtin','--no-system-roots','--no-net-fetcher','--hostname=fixture.invalid','--trust-leaf-cert']
  if mode=='downloaded':args+=['--crlset='+str(r/'crlset-profile-2/CertificateRevocation/10856/crl-set')]
  p=subprocess.run(args+[str(cert)],capture_output=True,text=True,timeout=30);log=p.stdout+p.stderr;(r/(phase+'-'+cert.stem+'-'+mode+'.log')).write_text(log)
  out.append({'certificate':cert.stem,'mode':mode,'exitCode':p.returncode,'revoked':'REVOKED' in log,'note':'Certificate-only verifier probe, not a successful TLS handshake. Other name/path errors may coexist.'})
report={'phase':phase,'toolSha256':hashlib.sha256(exe.read_bytes()).hexdigest(),'results':out};(r/(phase+'-verification.json')).write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(out))
