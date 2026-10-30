"""Read-only qualification of one scoped development candidate; never launches it."""
from pathlib import Path
import hashlib,json,os,subprocess,sys

preview=Path('<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview')
draft=Path(__file__).resolve().parent
src=Path('<local-home>/Projects/BlancChromium158/src');out=src/'out/BlancPrototype'
ev=preview/'evidence/start-page-sunrise-20261029';assets=ev/'assets-v2'
app=out/'Blanc Prototype.app';rel='Contents/Frameworks/Blanc Prototype Framework.framework/Versions/158.0.8127.2/Blanc Prototype Framework'
framework=app/rel
blocker=preview/'artifacts/procedural-groups-combined-20261028';blocker_manifest=preview/'evidence/development-matched-20261028/blocker-current-sha256.json'
expected_framework='ee7517576e8c43525e57351239a79d0093271bdf0aaac669005f05b120a1f77c'
expected_manifest='0a0b32c3fd5e10ad744f3efd25a3d468637d9d8fd4521ed1bac4a2acaad367b6'
expected_receipt='cf403d860c0bc0334fc54876043881a030b01636b410b09b8a65dbce68eaf204'
scenario_hashes={'background':'f96862ccd86a13eecf7b8905eec0489181c550121fab8a1b7b8ca3e386314f6c','glance-main':'69faa23198837be9a79bd79fdb901c98fe9b92ec976b0272ecdbe9f472d7da8f','glance-reference':'1ac64bbe7ac5b45d2846f7e236f4d5d60310215a70be886de9f64acf9d5a6faa','inactive-split':'f749065d76ab6bd9874ba9ddfba113bcfec0d125b01c176773a3590c5e8441d5','split-main':'26d78408f0da08e5330e4d5b8ecf0ea5338299ae5601ecbed43e1dceddaa3c6c','split-reference':'d7225c7ab9329ef5de8e5652c88d6ce0ced95d09a75d980a98387e20efa49915'}
expected_checks={'background':['background start receives no grant','same WebContents cannot retry','visible regular start obtains one real native grant','second visible start cannot obtain another grant'],'inactive-split':['inactive split denied','visible tab receives unspent grant'],**{x:[x.replace('-',' ')+' receives real native grant'] for x in ('split-main','split-reference','glance-main','glance-reference')}}
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
def require(condition,message):
 if not condition:raise RuntimeError(message)
def check_digest(path,expected):require(path.is_file() and not path.is_symlink() and sha(path)==expected,'hash mismatch: '+str(path))
def files(root):
 result={}
 for p in sorted(root.rglob('*')):
  name=str(p.relative_to(root))
  if p.is_symlink():result[name]={'symlink':os.readlink(p)}
  elif p.is_file():result[name]={'sha256':sha(p)}
 return result
def no_build():
 for line in subprocess.check_output(['/bin/ps','-axo','pid=,comm='],text=True).splitlines():
  v=line.strip().split(None,1)
  if len(v)==2 and Path(v[1]).name.lower() in ('ninja','siso','autoninja'):raise RuntimeError('build process active: '+v[0])
 for name in ('.blanc-build-guard.lock','.blanc-sunrise-transaction.lock'):
  require(not (out/name).exists(),'coordination lock exists: '+name)
try:
 no_build()
 manifest_path=draft/'overlay-foreground-v2-manifest.json';check_digest(manifest_path,expected_manifest);manifest=json.loads(manifest_path.read_text())
 receipt_path=ev/'build-sunrise-v2/receipt.json';check_digest(receipt_path,expected_receipt);receipt=json.loads(receipt_path.read_text())
 require(receipt.get('status')=='verified' and receipt.get('overlayManifestSha256')==expected_manifest and receipt.get('frameworkSha256')==expected_framework and receipt.get('buildExit')==0 and receipt.get('guardExit')==0 and receipt.get('guardActions')==0,'build receipt not verified')
 guard=out/'blanc-build-plan.log';check_digest(guard,receipt['guardPlanSha256']);guard_text=guard.read_text()
 require('ninja: no work to do.' in guard_text and 'Build Succeeded: 0 steps' in guard_text,'zero-action guard absent')
 for name,digest in manifest['overlay'].items():check_digest(src/name,digest)
 require(all((src/name).stat().st_mtime_ns<=guard.stat().st_mtime_ns for name in manifest['overlay']),'guard predates source')
 check_digest(framework,expected_framework);require(framework.stat().st_mtime_ns<=guard.stat().st_mtime_ns,'guard predates framework')
 require(files(assets)=={name:{'sha256':digest} for name,digest in manifest['assets'].items()},'prototype assets differ from reviewed v2 manifest')
 check_digest(blocker_manifest,'a95094c9a55dd8459280920a403a660e909678aadc5c128e75f09bb68a0e2418')
 require(files(blocker)=={name:{'sha256':digest} for name,digest in json.loads(blocker_manifest.read_text()).items()},'blocker assets differ')
 stage=ev/'stage-sunrise-v2/transaction.json';check_digest(stage,'2bbbd3d31aa2f8d8072fcfa65578f70c2f00c0f397fa77a7930a1d02d5a3aaf8');transaction=json.loads(stage.read_text())
 require(transaction['status']=='staged' and transaction['overlayManifestSha256']==expected_manifest,'staging transaction mismatch')
 expected_app=transaction['baselineAppInventory'].copy();expected_app[rel]={'sha256':expected_framework}
 require(files(app)==expected_app,'app inventory differs from verified baseline plus v2 framework')
 for scenario,digest in scenario_hashes.items():
  path=ev/('fg-'+scenario+'.json');check_digest(path,digest);result=json.loads(path.read_text())
  require(result.get('pass') is True and result.get('scenario')==scenario and result.get('framework')==expected_framework and result.get('manifest')==expected_manifest and result.get('receiptSha256')==expected_receipt,'scenario identity failed: '+scenario)
  require(result.get('errors')==[] and result.get('exits')==[{'phase':1,'exitCode':0}] and result.get('cleanup')==['proxy closed','HTTP server closed'],'scenario cleanup failed: '+scenario)
  require([c['name'] for c in result.get('checks',[])]==expected_checks[scenario] and all(c['detail'] is True for c in result['checks']),'scenario checks missing: '+scenario)
 prior=ev/'sunrise-b.json';check_digest(prior,'4597731746a78cae5ee745a8771b41e803f7e7cfae3b7d9d93425707bd2c356b')
 previous=json.loads(prior.read_text());require(previous['framework']=='f318783b47b1f89d82de4a2c539bdaa810cbe71ed34234737ec3bc1df8175454' and previous['pass'] is False,'prior evidence identity changed')
 no_build();check_digest(framework,expected_framework)
 print(json.dumps({'verified':True,'scope':'development candidate identity and six focused Sunrise foreground scenarios only','frameworkSha256':expected_framework,'manifestSha256':expected_manifest,'prototypeAssets':str(assets),'blockerAssets':str(blocker),'scenarios':list(scenario_hashes),'priorSettingsPrivate':'sunrise-b checked on f318; its overall run failed and it does not establish v2 Settings/private behavior','limits':['No full product parity, visual or accessibility acceptance.','The v2 background check observed a hidden renderer and did not reproduce the prior visible-background failure.',
'Real write-failure, managed policy and other lifecycle/security scenarios remain unverified.','Snapshots do not exclude transient visibility changes; network proxy is not host-wide isolation.','Read-only checks do not lock out non-cooperating writers and are not a launch-time guarantee.','No signing, release, candidate promotion, restart or launch performed.']},indent=2))
except Exception as e:
 print(json.dumps({'verified':False,'error':str(e)}),file=sys.stderr);sys.exit(1)
