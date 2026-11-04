#!/usr/bin/env python3
"""Verify pinned inputs and reconstruct the canonical patch set without Chromium."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
upstream = json.loads((root / 'upstream/manifest.json').read_text())
source = json.loads((root / 'source-map.json').read_text())
if upstream['upstream'] != source['upstream'] or len(upstream['files']) != 91:
    raise SystemExit('Incorrect or incomplete pinned input set')


def checked(base, name, expected):
    p = base / name
    if p.is_symlink() or not p.is_file() or '..' in Path(name).parts or Path(name).is_absolute():
        raise SystemExit('Invalid source path: ' + name)
    if hashlib.sha256(p.read_bytes()).hexdigest() != expected:
        raise SystemExit('Digest mismatch: ' + name)
    return p


with tempfile.TemporaryDirectory(prefix='blanc-patch-check-') as directory:
    work = Path(directory)
    for name, digest in upstream['files'].items():
        p = checked(root / 'upstream', name, digest)
        q = work / name
        q.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(p, q)
    for patch in [root / 'patches/baseline/0001-foundation-baseline.patch',
                  root / 'patches/0002-canonical-layout.patch',
                  root / 'patches/0003-island-mode-predicate.patch',
                  root / 'patches/0004-typed-island-interface.patch',
                  root / 'patches/0005-channel-identity.patch',
                  root / 'patches/0006-external-scheme-deny.patch',
                  root / 'patches/0007-bangs-prefs.patch',
                  root / 'patches/0008-background-services.patch',
                  root / 'patches/0009-ui-language-pref.patch',
                  root / 'patches/0010-island-prefs.patch',
                  root / 'patches/0011-in-window-private-tabs.patch',
                  root / 'patches/0012-utility-sheet-commands.patch',
                  root / 'patches/0013-private-window-menus.patch',
                  root / 'patches/0014-http-auth-refusal.patch',
                  root / 'patches/0015-island-permission-prompt.patch',
                  root / 'patches/0016-private-certificate-decisions.patch',
                  root / 'patches/0017-inherited-sandbox.patch',
                  root / 'patches/0018-webrtc-ip-policy.patch',
                  root / 'patches/0019-settings-sheet-command.patch']:
        subprocess.run(['git', 'apply', '--check', str(patch)], cwd=work, check=True)
        subprocess.run(['git', 'apply', str(patch)], cwd=work, check=True)
    for name, digest in source['upstreamFiles'].items():
        checked(work, name, digest)
    for name, digest in source['canonicalSha256'].items():
        checked(root, name, digest)
    print(json.dumps({'status': 'passed', 'upstreamFiles': len(source['upstreamFiles']),
                      'customFiles': len(source['canonicalSha256']),
                      'qualification': 'patch reconstruction only; no compilation or runtime credit'}))
