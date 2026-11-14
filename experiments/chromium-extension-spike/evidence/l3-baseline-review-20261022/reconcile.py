import urllib.request,json,base64,re
from pathlib import Path
r=Path('/private/tmp/blanc-l3-review');base='41520584daa68d0040db7746ae562a0ff82187f6';head='1aa07b638799e59656559ae6c6649d4b197f555e'
d=json.loads((r/'beta-log.json').read_text());commits=d['log'][:];seen=set(x['commit'] for x in commits);page=1
while d.get('next'):
 page+=1
 if page>20:raise RuntimeError('pagination bound')
 url=f'https://chromium.googlesource.com/chromium/src/+log/{base}..{head}?format=JSON&n=100&s='+d['next']
 raw=urllib.request.urlopen(url,timeout=30).read();(r/f'beta-log-{page}.raw').write_bytes(raw);d=json.loads(raw.decode().split('\n',1)[1]);(r/f'beta-log-{page}.json').write_text(json.dumps(d,indent=2))
 for c in d['log']:
  if c['commit'] in seen:raise RuntimeError('duplicate pagination')
  seen.add(c['commit']);commits.append(c)
paths=re.findall(r'^diff --git a/(.*?) b/',(r/'beta-diff.patch').read_text(),re.M)
inv=json.loads(Path('/private/tmp/blanc-pending-read-repair/inventory.json').read_text());patched={x['path'] for x in inv['files']};overlap=sorted(set(paths)&patched)
result={'base':base,'head':head,'pages':page,'commits':len(commits),'changedFiles':len(set(paths)),'patchOverlap':overlap,'dependencyManifests':[p for p in paths if p=='DEPS' or 'DEPS' in p.split('/')[-1]],'reviewCandidates':[{'commit':c['commit'],'subject':c['message'].split('\n')[0],'message':c['message']} for c in commits if any(x in c['message'].lower() for x in ['uaf','use-after','security','corrupt segment','out-of-bounds'])]}
(r/'delta-summary.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k!='reviewCandidates'},indent=2));print('review candidate count',len(result['reviewCandidates']))
