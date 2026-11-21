from pathlib import Path
import json
r=Path(__file__).parent
def read(p):return json.loads((r/p).read_text())
completion=read('frozen-complete.json');assert completion['allMemberBytesAndSymlinksUnchanged'] and completion['notarizationCompletedBeforeTests']
assert all(x['exitCode']==0 for x in completion['suites'])
rows=[]
for name,path,count in [
 ('normal-startup','tests/startup/verification-final.json',7),('encrypted-recovery','regression/recovery/report.json',6),
 ('failed-write-retry','regression/verified/report.json',4),('split','regression/splits/report.json',5),
 ('private-lifecycle','regression/private-lifecycle/runtime.json',10),('grouped-windows-spaces','regression/grouped/runtime.json',6),
 ('native-cancellation-close','regression/close/test.json',6),('nonregular-record','regression/nonregular/pipe-report.json',6),
 ('owner-profile-teardown','regression/teardown-report.json',6),('core','tests/core/report.json',17),('notice','notice-test.json',16)]:
 d=read(path);assert not d.get('error'),(name,d.get('error'));checks=d['checks'];assert len(checks)==count,(name,len(checks));assert (d.get('pass') is True and all('value' in c for c in checks)) if name in ['private-lifecycle','grouped-windows-spaces','native-cancellation-close'] else all(c.get('pass') is True for c in checks),name
 rows.append({'schedule':name,'report':path,'passingCheckpoints':count})
for i in range(1,7):
 path=f'repeated/baseline-{i}/pipe-report.json';d=read(path);assert not d.get('error');assert len(d['checks'])==6 and all(c.get('pass') is True for c in d['checks'])
 rows.append({'schedule':f'repeated-nonregular-regular-restart-{i}','report':path,'passingCheckpoints':6})
assert sum(x['passingCheckpoints'] for x in rows)==125
assert read('frozen-before.json')==read('frozen-after.json')
a=read('notary-result.json');assert a['status']=='Accepted'
out={'sourceRevision':(r/'source-revision').read_text().strip(),'version':'157.0.8103.15','notarization':a,'frozenBundleMembers':completion['members'],'allMemberBytesAndSymlinksUnchanged':True,'totalPassingCheckpoints':125,'recoveryPassingCheckpoints':92,'coreAndNoticePassingCheckpoints':33,'schedules':rows,'excludedFromPassingTotal':['old7065 baseline36','temporary signed diagnostic72','ad-hoc keychain setup failure','original intermittent failure','functional event-order negative control'],'qualificationScope':'Finite signed-candidate recovery acceptance; no power-loss, real provider-outage, permanent profile migration, new owner VoiceOver or distribution acceptance claim.'}
(r/'local-runtime-summary.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
