from pathlib import Path
import hashlib,json,gzip
r=Path(__file__).parent
for line in (r/'SHA256SUMS').read_text().splitlines():
 digest,name=line.split('  ',1);assert hashlib.sha256((r/name).read_bytes()).hexdigest()==digest,name
 if name.endswith('.gz'):gzip.decompress((r/name).read_bytes())
s=json.loads((r/'summary.json').read_text());assert s['readiness']=={'count':8,'total':12,'delta':0,'open':['L4','L8','L11','L12']}
a=r/'attempt-419b8276';assert json.loads((a/'placeholder-detection.json').read_text())['rejectedByUpdatedValidator']
assert json.loads((a/'notary-result.json').read_text())['status']=='Accepted'
v=json.loads((a/'manifest-verification.json').read_text());assert v['signer']=='anthony@bnfy.me' and v['issuer']=='https://github.com/login/oauth'
b=r/'replacement-57fc3b13';assert sum(x['checks'] for x in json.loads((b/'local-runtime-summary.json').read_text()))==39
credits=json.loads((b/'credits-verification.json').read_text());assert credits['packageCount']==323 and credits['fullLicenseTextCount']==320 and credits['matchesInventoryRenderer']
assert all(x['same'] for x in json.loads((b/'code-equivalence.json').read_text())['rows'])
assert json.loads((b/'notary-result.json').read_text())['status']=='Accepted'
auth=json.loads((b/'manifest-verification.json').read_text());assert auth['signer']=='anthony@bnfy.me' and auth['source']=='57fc3b131a087b3b085dbaf65766d130c6b7baed'
from html.parser import HTMLParser
class Credits(HTMLParser):
 def __init__(self):super().__init__();self.tag=None;self.names=[];self.texts=[]
 def handle_starttag(self,tag,attrs):
  if tag in ('h2','pre'):self.tag=tag;(self.names if tag=='h2' else self.texts).append('')
 def handle_endtag(self,tag):
  if tag==self.tag:self.tag=None
 def handle_data(self,data):
  if self.tag:(self.names if self.tag=='h2' else self.texts)[-1]+=data
parser=Credits();parser.feed(gzip.decompress((b/'compliance/chromium-credits.html.gz').read_bytes()).decode())
spdx=json.loads(gzip.decompress((b/'compliance/chromium.spdx.json.gz').read_bytes()))
texts={x['licenseId']:x['extractedText'] for x in spdx['hasExtractedLicensingInfos']}
assert parser.names==[x['name'] for x in spdx['packages']]
assert parser.texts==[texts[x['licenseConcluded']] for x in spdx['packages']]
assert len(parser.names)==323
print('Archived hashes, superseded initial packet, corrected credits and 39 replacement checks verified; L8 remains open')
