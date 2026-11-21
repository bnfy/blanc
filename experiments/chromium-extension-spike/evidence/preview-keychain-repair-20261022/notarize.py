import os,pathlib,subprocess,json
r=pathlib.Path('/private/tmp/blanc-preview-keychain-repair'); app=r/'Blanc Chromium Preview.app'; archive=r/'Blanc-Chromium-Preview-notary.zip'
if (r/'signing-desktop.exit').read_text().strip()!='0':raise SystemExit('Signing has not succeeded')
required=['APPLE_ID','APPLE_APP_SPECIFIC_PASSWORD','APPLE_TEAM_ID']
if any(not os.environ.get(k) for k in required):raise SystemExit('Notarization credentials unavailable')
if os.environ['APPLE_TEAM_ID']!='XYGUCY4498':raise SystemExit('Unexpected team')
subprocess.run(['codesign','--verify','--deep','--strict',str(app)],check=True)
archive.unlink(missing_ok=True)
subprocess.run(['ditto','-c','-k','--keepParent',str(app),str(archive)],check=True)
args=['xcrun','notarytool','submit',str(archive),'--apple-id',os.environ['APPLE_ID'],'--password',os.environ['APPLE_APP_SPECIFIC_PASSWORD'],'--team-id',os.environ['APPLE_TEAM_ID'],'--wait','--output-format','json']
p=subprocess.run(args,capture_output=True,text=True)
(r/'notary-result.json').write_text(p.stdout)
# notarytool diagnostics are retained with credentials redacted defensively.
err=p.stderr
for k in required:err=err.replace(os.environ[k],'[redacted]')
(r/'notary-stderr.txt').write_text(err)
if p.returncode:raise SystemExit('Notary submission failed; see redacted diagnostics')
d=json.loads(p.stdout)
if d.get('status')!='Accepted':raise SystemExit('Notary result: '+str(d.get('status')))
for command in [['xcrun','stapler','staple',str(app)],['xcrun','stapler','validate',str(app)],['codesign','--verify','--deep','--strict',str(app)],['spctl','--assess','--type','execute','--verbose=4',str(app)]]:
 p=subprocess.run(command,capture_output=True,text=True)
 with (r/'verification.log').open('a') as f:f.write(p.stdout+p.stderr+'\nreturncode='+str(p.returncode)+'\n')
 if p.returncode:raise SystemExit('Artifact verification failed')
subprocess.run(['ditto','-c','-k','--keepParent',str(app),str(r/'Blanc-Chromium-Preview-stapled.zip')],check=True)
(r/'notarization-complete').write_text('Accepted, stapled, validated\n')
print('Accepted, stapled, validated')
