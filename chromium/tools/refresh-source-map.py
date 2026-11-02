#!/usr/bin/env python3
"""Set source-map canonicalSha256 to every file under blanc/ (the canonical
custom source applied into //blanc). --check fails if it is stale."""
import hashlib, json, sys
from pathlib import Path
root = Path(__file__).resolve().parents[1]
path = root / 'source-map.json'
source = json.loads(path.read_text())
files = sorted(p for p in (root / 'blanc').rglob('*') if p.is_file() and not p.name.startswith('.'))
current = {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
if '--check' in sys.argv:
    if current != source['canonicalSha256']: raise SystemExit('source-map canonicalSha256 is stale; run tools/refresh-source-map.py')
    print(json.dumps({'status': 'current', 'customFiles': len(current)})); raise SystemExit
source['canonicalSha256'] = current
path.write_text(json.dumps(source, indent=2) + '\n')
print(json.dumps({'status': 'refreshed', 'customFiles': len(current)}))
