import json,urllib.request,urllib.parse,xml.etree.ElementTree as ET,datetime
from pathlib import Path
rows=json.load(open('experiments/chromium-extension-spike/evidence/extension-final-status.json'))['extensions']
out=[]
for e in rows:
 x=urllib.parse.urlencode({'id':e['id'],'v':e['version'],'uc':''})
 url='https://clients2.google.com/service/update2/crx?'+urllib.parse.urlencode({'response':'updatecheck','prodversion':'157.0.8103.6','acceptformat':'crx3','x':x})
 try:
  with urllib.request.urlopen(url,timeout=30) as r:body=r.read().decode();status=r.status
  Path('/private/tmp/blanc-task0/google-update-'+e['id']+'.xml').write_text(body)
  doc=ET.fromstring(body);checks=[n.attrib for n in doc.iter() if n.tag.split('}')[-1] in ['updatecheck','manifest']]
  out.append({'id':e['id'],'name':e['name'],'recorded156Version':e['version'],'httpStatus':status,'response':checks})
 except Exception as ex:out.append({'id':e['id'],'name':e['name'],'error':str(ex)})
result={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':'Google update service; compare recorded October16 versions; not installed profile inspection','extensions':out}
Path('/private/tmp/blanc-task0/google-six-versions.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
