from pathlib import Path
import hashlib,gzip
r=Path(__file__).parent
for line in (r/'SHA256SUMS').read_text().splitlines():
 digest,name=line.split('  ',1);p=r/name
 assert hashlib.sha256(p.read_bytes()).hexdigest()==digest,name
 if p.suffix=='.gz':gzip.decompress(p.read_bytes())
print('All evidence hashes and compressed logs verified')
