#!/usr/bin/env python3
"""Apply canonical source to a pristine or already-matching pinned checkout."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
source = json.loads((root / 'source-map.json').read_text())
pristine = json.loads((root / 'upstream/manifest.json').read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest() if p.is_file() else None
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--src', type=Path, required=True)
parser.add_argument('--backup', type=Path)
parser.add_argument('--apply', action='store_true')
parser.add_argument('--previous-map', type=Path)
args = parser.parse_args()
previous = json.loads(args.previous_map.read_text()) if args.previous_map else {}
if previous and previous.get('upstream') != source['upstream']: raise SystemExit('Previous source map has different upstream')
head = subprocess.check_output(['git','-C',str(args.src),'rev-parse','HEAD']).decode().strip()
if head != source['upstream']:
    raise SystemExit('Unexpected upstream; no changes made')
with tempfile.TemporaryDirectory(prefix='blanc-source-apply-') as temp:
    work = Path(temp)
    for name, expected in pristine['files'].items():
        p = root / 'upstream' / name
        if sha(p) != expected: raise SystemExit('Pristine input mismatch: ' + name)
        q = work / name; q.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(p,q)
    for patch in [root/'patches/baseline/0001-foundation-baseline.patch', root/'patches/0002-canonical-layout.patch', root/'patches/0003-island-mode-predicate.patch']:
        subprocess.run(['git','apply',str(patch)],cwd=work,check=True)
    for name, expected in source['canonicalSha256'].items():
        p = root/name
        if sha(p) != expected: raise SystemExit('Canonical input mismatch: ' + name)
        q = work/name; q.parent.mkdir(parents=True,exist_ok=True); shutil.copyfile(p,q)
    selected = dict(source['upstreamFiles'], **source['canonicalSha256'])
    changes = []
    for name, expected in selected.items():
        before = sha(args.src/name)
        if sha(work/name) != expected: raise SystemExit('Reconstruction mismatch: '+name)
        if before == expected: continue
        allowed_before = {pristine['files'].get(name), previous.get('canonicalSha256', {}).get(name), previous.get('upstreamFiles', {}).get(name)}
        if before not in allowed_before:
            raise SystemExit('Unrecognized cached source; preserve and reconcile: '+name)
        changes.append({'path':name,'before':before,'after':expected})
    print(json.dumps({'mode':'apply' if args.apply else 'check','changes':len(changes)}))
    if args.apply and changes:
        if not args.backup or args.backup.exists(): raise SystemExit('A new durable backup directory is required')
        if root.parent in args.backup.resolve().parents: raise SystemExit('Backup must remain outside the Git repository')
        args.backup.mkdir(parents=True)
        for change in changes:
            old=args.src/change['path']
            if old.exists():
                p=args.backup/'preimages'/change['path'];p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(old,p)
        (args.backup/'journal.json').write_text(json.dumps(changes,indent=2)+'\n')
        for change in changes:
            p=args.src/change['path']
            if sha(p)!=change['before']:raise SystemExit('Source changed during backup')
            p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(work/change['path'],p)
