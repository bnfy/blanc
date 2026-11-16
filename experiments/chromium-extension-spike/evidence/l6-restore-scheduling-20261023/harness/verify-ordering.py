from pathlib import Path
import json
r=Path(__file__).parent;out={'purpose':'Functional main-loop ordering only; no latency comparison'}
for name in ['old','fixed']:
 d=json.loads((r/('ordering-'+name)/'report.json').read_text());assert d.get('complete') and not d.get('error'),name
 mains=d['mainMarkers'];loops=d['restoreMarkers'];assert len(mains)==1 and loops,name
 main=mains[0];loops=[e for e in loops if e['pid']==main['pid'] and e['tid']==main['tid']];assert loops
 out[name]={'mainLoopMarkerPresent':True,'restorationMarkerPresent':True,'allRestorationAfterMainLoop':all(e['ts']>main['ts'] for e in loops),'sourceLocations':[e['args'].get('location') for e in loops]}
assert not out['old']['allRestorationAfterMainLoop'],'Old candidate failed to exercise the pre-main-loop path'
assert out['fixed']['allRestorationAfterMainLoop'],'Repaired candidate still enters restoration before the main loop'
out['negativeControlRejectsOld']=True;out['repairedContractPasses']=True
(r/'ordering-verification.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
