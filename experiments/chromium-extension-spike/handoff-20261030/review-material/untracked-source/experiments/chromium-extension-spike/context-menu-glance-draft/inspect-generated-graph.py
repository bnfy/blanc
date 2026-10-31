from pathlib import Path
from collections import deque
import json,hashlib
out=Path('<local-home>/Projects/BlancChromium158/src/out/BlancPrototype');receipt=Path('<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview/evidence/context-glance-gn-draft-20261030/generated-graph.json');assert not receipt.exists();graph={};files=0
for f in [out/'build.ninja',*(out/'obj').rglob('*.ninja')]:
 try:
  with f.open(errors='replace') as stream:
   files+=1
   for line in stream:
    if not line.startswith('build phony/'):continue
    while line.rstrip().endswith('$'):line=line.rstrip()[:-1]+' '+next(stream,'')
    if ': phony ' not in line:continue
    left,right=line.split(': phony ',1);graph[left[6:].strip()]=[x for x in right.split() if x.startswith('phony/')]
 except OSError:pass
def find(a,b):
 q=deque([(a,[a])]);seen={a}
 while q:
  x,path=q.popleft()
  if x==b:return path
  for y in graph.get(x,[]):
   if y not in seen:seen.add(y);q.append((y,path+[y]))
 return None
base='phony/chrome/browser/';labels={'menu':base+'renderer_context_menu/impl','view':base+'ui/views/frame/browser_view','view_header':base+'ui/views/frame/browser_view_header','tab_strip':base+'ui/tabs/tab_strip'}
pairs=[('view','menu'),('view_header','menu'),('tab_strip','menu'),('menu','view_header'),('tab_strip','view')];checks=[]
for suffix in ['.linkdeps','.harddeps']:
 for a,b in pairs:
  start,end=labels[a]+suffix,labels[b]+suffix
  assert start in graph and end in graph,(start,end)
  checks.append({'from':start,'to':end,'path':find(start,end)})
receipt.write_text(json.dumps({'scope':'Read-only traversal of generated phony/harddeps/linkdeps only; archives/object edges and proposed targets are not analyzed, not a GN cycle check','ninjaFilesRead':files,'phonyNodes':len(graph),'checks':checks},indent=2)+'\n');print('wrote',receipt,'sha256',hashlib.sha256(receipt.read_bytes()).hexdigest())
