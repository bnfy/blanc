#!/usr/bin/env python3
"""Verify an immutable, offline Sparkle staging receipt before GN links/copies it."""
import argparse
import hashlib
import json
from pathlib import Path
import plistlib
import re

LICENSE_SHA = '389a4e4e9a32f059775b13a06e25a591445ba229d2838d26dd3e7c0c45127cfe'

def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

def tree(framework):
    root = framework.resolve(strict=True)
    result = {}
    for p in sorted(framework.rglob('*')):
        name = p.relative_to(framework).as_posix()
        if p.is_symlink():
            target = p.readlink()
            if target.is_absolute() or not p.resolve(strict=True).is_relative_to(root):
                raise ValueError('escaping framework link')
            result[name] = {'link': str(target)}
        elif p.is_file():
            result[name] = {'sha256': digest(p), 'mode': p.stat().st_mode & 0o777}
        elif not p.is_dir():
            raise ValueError('unsupported framework entry')
    return result

def verify(stage, archive_sha):
    if not re.fullmatch('[0-9a-f]{64}', archive_sha):
        raise ValueError('reviewed archive digest required')
    stage = Path(stage)
    receipt = json.loads((stage / 'receipt.json').read_text())
    if receipt.get('schema') != 1 or receipt.get('version') != '2.10.1' or receipt.get('archiveSHA256') != archive_sha:
        raise ValueError('staging receipt mismatch')
    if digest(stage / 'LICENSE') != LICENSE_SHA:
        raise ValueError('Sparkle license mismatch')
    framework = stage / 'Sparkle.framework'
    if tree(framework) != receipt.get('files'):
        raise ValueError('staged framework changed')
    with (framework / 'Versions/B/Resources/Info.plist').open('rb') as stream:
        info = plistlib.load(stream)
    if info.get('CFBundleShortVersionString') != '2.10.1' or str(info.get('CFBundleVersion')) != '2065':
        raise ValueError('Sparkle version mismatch')
    for name in ['Sparkle', 'Autoupdate', 'Updater.app/Contents/MacOS/Updater',
                 'XPCServices/Installer.xpc/Contents/MacOS/Installer',
                 'XPCServices/Downloader.xpc/Contents/MacOS/Downloader']:
        if not (framework / 'Versions/B' / name).is_file():
            raise ValueError('Sparkle component missing')
    names = ['receipt.json', 'LICENSE'] + ['Sparkle.framework/' + p for p in receipt['files']]
    if json.loads((stage / 'inputs.json').read_text()) != names:
        raise ValueError('staging input inventory mismatch')
    return [str(stage / 'inputs.json')] + [str(stage / p) for p in names]

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--stage', required=True)
    parser.add_argument('--archive-sha256', required=True)
    parser.add_argument('--inputs', action='store_true')
    parser.add_argument('--stamp')
    args = parser.parse_args()
    try:
        inputs = verify(args.stage, args.archive_sha256)
        if args.inputs:
            print(json.dumps(inputs))
        if args.stamp:
            Path(args.stamp).write_text('Verified Sparkle 2.10.1 staged inputs\n')
    except Exception:
        raise SystemExit('Sparkle staging verification failed; no paths or inputs disclosed') from None
