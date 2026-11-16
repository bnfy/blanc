from pathlib import Path
import json,hashlib
r=Path('/private/tmp/blanc-encryption-faults');initial=json.loads((r/'results.json').read_text());fixed=json.loads((r/'corrected-results.json').read_text());assert len(initial)==8 and len(fixed)==4
want={'urls':['blanc://newtab/','http://127.0.0.1:9470/one','http://127.0.0.1:9470/two'],'selected':1}
final=[x for x in initial if x['label'].startswith(('temporary','permanent'))]+fixed
for x in final:
 if x['label']=='never-corrected':
  assert not x['ready'] and x['fixtureKilled'] and x['sampled']
  assert 'BLANC_PROVIDER withheld' in x['callbacks'] and 'BLANC_RESTORE resumed' not in x['callbacks']
 else:
  assert x['ready'] and x['cleanExit'] and want in x['states'],x
for mode,code in [('temporary',6),('permanent',8)]:
 x=next(x for x in initial if x['label']==mode)
 assert any(c.startswith('BLANC_READ backend_end encrypted=1 status=%d commands=0'%code) for c in x['callbacks'])
 assert any(c.startswith('BLANC_READ backend_end encrypted=0 status=1') for c in x['callbacks'])
p=Path('/private/tmp/blanc-restore-stall/multi-settled-profile');now={str(x.relative_to(p)):hashlib.sha256(x.read_bytes()).hexdigest() for x in p.rglob('*') if x.is_file() and not x.is_symlink()};assert now==json.loads((r/'original-profile-hashes.json').read_text())
assert json.loads((r/'before.json').read_text())==json.loads((r/'after.json').read_text())
result={'final_starts':8,'restored_with_exact_state_and_clean_exit':7,'withheld_callback_no_timeout_observed':True,'initial_inconclusive_delay_and_automatic_restore_assumptions_retained':True,'provider_failures_recover_via_clear_store':True,'original_profile_unchanged':True,'google_dev_unchanged':True,'real_os_provider_failure_tested':False,'historical_stall_cause_established':False}
(r/'validation.json').write_text(json.dumps(result,indent=2));print(result)
