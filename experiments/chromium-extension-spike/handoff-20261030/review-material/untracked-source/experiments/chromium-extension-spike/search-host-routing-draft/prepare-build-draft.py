from pathlib import Path
import hashlib,json
here=Path(__file__).resolve().parent
source=Path('<local-home>/Projects/BlancChromium158/src/chrome/browser/ui/views/frame/BUILD.gn')
s=source.read_text();anchor='  deps = [\n    "//chrome/browser/bookmarks",\n    "//chrome/browser/history",\n'
replacement=anchor+'    "//chrome/browser/search_engines",\n'
assert s.count(anchor)==1, 'existing BrowserView dependency anchor changed'
start=s.index('source_set("browser_view") {');end=s.find('\nsource_set(',start+1);target=s[start:end if end>=0 else None]
for name in ['//chrome/browser/search_engines']:
 assert target.count('"'+name+'"') == 0, 'dependency already exists; re-review instead of duplicating'
out=here/'BUILD.158-candidate.gn';out.write_text(s.replace(anchor,replacement,1))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
(here/'build-preparation.json').write_text(json.dumps({'input':sha(source),'candidate':sha(out),'dependencies':['//chrome/browser/search_engines'],'graphEvidence':sha(here/'gn-path-review-20261029.json'),'scope':'No GN generation or build was run; generated graph and exact build action count remain unverified.'},indent=2)+'\n')
print('Prepared isolated BUILD.gn candidate; no Chromium files changed')
