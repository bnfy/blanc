import json,pathlib
r=pathlib.Path('/private/tmp/blanc-session-recovery'); checks=[]
for folder in ['verified','verified-encrypted']:
 data=json.loads((r/folder/'results.json').read_text())
 for x in data:
  label=folder+'/'+x['label']
  checks.append((label+' exits without kill',x.get('exited') and not x.get('fixtureKilled')))
  if x['label']=='quit':
   checks.append((label+' recovery screen shown',x.get('recoveryShown')==1))
   checks.append((label+' original records unchanged',all(x['finalRecords'].get(k)==v for k,v in x['initialRecords'].items())))
  else:
   checks.append((label+' exact restored tabs and selection',x.get('states')==[{'urls':['blanc://newtab/','http://127.0.0.1:9470/one','http://127.0.0.1:9470/two'],'selected':1}]))
  if x['label']=='delay':checks.append((label+' screen shown and dismissed once',x.get('recoveryShown')==1 and x.get('recoveryDismissed')==1))
print(json.dumps(checks,indent=2));assert all(v for _,v in checks)
