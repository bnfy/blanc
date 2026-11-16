#!/usr/bin/env python3
"""Verify pinned inputs and reconstruct the canonical patch set without Chromium."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

import lane as lanes

root = lanes.root
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--lane', default='desktop')
lane = lanes.load(parser.parse_args().lane)


def checked(base, name, expected):
    p = base / name
    if p.is_symlink() or not p.is_file() or '..' in Path(name).parts or Path(name).is_absolute():
        raise SystemExit('Invalid source path: ' + name)
    if hashlib.sha256(p.read_bytes()).hexdigest() != expected:
        raise SystemExit('Digest mismatch: ' + name)
    return p


with tempfile.TemporaryDirectory(prefix='blanc-patch-check-') as directory:
    work = Path(directory)
    for name, digest in lane['files'].items():
        p = checked(lane['upstreamDir'], name, digest)
        q = work / name
        q.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(p, q)
    for patch in lane['patches']:
        subprocess.run(['git', 'apply', '--check', str(patch)], cwd=work, check=True)
        subprocess.run(['git', 'apply', str(patch)], cwd=work, check=True)
    for name, digest in lane['upstreamFiles'].items():
        checked(work, name, digest)
    for name, digest in lane['canonicalSha256'].items():
        checked(root, name, digest)
    print(json.dumps({'status': 'passed', 'upstreamFiles': len(lane['upstreamFiles']),
                      'customFiles': len(lane['canonicalSha256']),
                      'qualification': 'patch reconstruction only; no compilation or runtime credit'}))
