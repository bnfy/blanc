from pathlib import Path
import json,hashlib
r=Path('/private/tmp/blanc-session-readiness');xs=json.loads((r/'results.json').read_text());assert len(xs)==5
for x in xs:
 expected=['blanc://newtab/'] if x['label']=='retained' else ['blanc://newtab/','http://127.0.0.1:9470/one','http://127.0.0.1:9470/two']
 assert x['states']==[{'urls':expected,'selected':0 if x['label']=='retained' else 1}]
 assert x['ready'] and x['cleanExit'] and not x.get('error') and not x.get('sampled')
 c=x['callbacks'];markers=['BLANC_READ request type=1 stage=2 ready=0','BLANC_READ encryptor_ready type=1 pending=1','BLANC_READ request type=1 stage=2 ready=1','BLANC_READ backend_begin encrypted=0','BLANC_READ backend_begin encrypted=1','BLANC_READ replay_end windows=1','BLANC_RESTORE resumed'];idx=[c.index(m) for m in markers];assert idx==sorted(idx)
 for enc in [0,1]:assert any(a.startswith('BLANC_READ backend_end encrypted=%d status=1 commands='%enc) for a in c)
for root,files in json.loads((r/'original-profile-hashes.json').read_text()).items():
 now={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in Path(root).rglob('*') if p.is_file() and not p.is_symlink()};assert now==files
assert json.loads((r/'before.json').read_text())==json.loads((r/'after.json').read_text())
v={'starts':5,'normal_configuration_starts':3,'explicit_encrypted_preferred_starts':2,'all_effective_stages':2,'queued_browser_reads_resumed':5,'exact_tabs_selection_and_clean_exits':True,'original_profiles_unchanged':True,'google_and_dev_unchanged':True,'stall_reproduced':False,'root_cause_established':False}
(r/'validation.json').write_text(json.dumps(v,indent=2));print(json.dumps(v))
