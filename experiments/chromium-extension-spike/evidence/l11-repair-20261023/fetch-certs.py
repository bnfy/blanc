import pathlib,json,re,urllib.request,base64,hashlib,concurrent.futures
root=pathlib.Path('/private/tmp/blanc-l11-fix');d=root/'certificates';d.mkdir(exist_ok=True)
p=json.load(open('/private/tmp/blanc-l11-20261023/electron-fix.json'));patch=next(f['patch'] for f in p['files'] if f['filename'].endswith('add_entries_to_the_spki_blocklist.patch'))
hashes=re.findall(r'^\+\+        // ([a-f0-9]{64})\.pem',patch,re.M)
def fetch(h):
 u='https://chromium.googlesource.com/chromium/src/+/main/net/data/ssl/blocklist/'+h+'.pem?format=TEXT';pem=base64.b64decode(urllib.request.urlopen(u,timeout=30).read());text=pem.decode();der=base64.b64decode(''.join(text.split('-----BEGIN CERTIFICATE-----')[1].split('-----END CERTIFICATE-----')[0].split()));assert hashlib.sha256(der).hexdigest()==h
 (d/(h+'.pem')).write_bytes(pem);return {'sha256':h,'sourceUrl':u}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:records=list(ex.map(fetch,hashes))
(root/'certificate-sources.json').write_text(json.dumps(records,indent=2)+'\n');print('verified',len(records))
