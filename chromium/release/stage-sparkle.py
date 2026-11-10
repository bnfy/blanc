#!/usr/bin/env python3
"""Stage a reviewed local 2.8.0 archive. No network, keys, signing or build."""
import argparse
import json
import os
from pathlib import Path, PurePosixPath
import plistlib
import runpy
import shutil
import tarfile
import tempfile

api = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'blanc/third_party/sparkle/verify.py'))

def stage(archive, expected, parent):
    archive, parent = Path(archive), Path(parent)
    if api['digest'](archive) != expected:
        raise ValueError('archive digest mismatch')
    destination = parent / ('sparkle-2.8.0-' + expected)
    if destination.exists() or destination.is_symlink():
        raise ValueError('staging destination already exists')
    parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix='.sparkle-stage-', dir=parent))
    try:
        with tarfile.open(archive) as bundle:
            members = [m for m in bundle.getmembers() if m.name == 'LICENSE' or m.name.startswith('Sparkle.framework/') or m.name == 'Sparkle.framework']
            if len(members) > 10000 or sum(m.size for m in members) > 2 * 1024**3:
                raise ValueError('archive exceeds staging bounds')
            names = set()
            links = set(m.name for m in members if m.issym())
            for member in members:
                name = PurePosixPath(member.name)
                if name.is_absolute() or '..' in name.parts or member.name in names or any(str(p) in links for p in name.parents):
                    raise ValueError('unsafe archive entry')
                names.add(member.name)
                if not (member.isdir() or member.isfile() or member.issym()):
                    raise ValueError('unsupported archive entry')
                if member.issym() and PurePosixPath(member.linkname).is_absolute():
                    raise ValueError('absolute archive link')
            for member in members:
                target = temporary / member.name
                target.parent.mkdir(parents=True, exist_ok=True)
                if member.isdir(): target.mkdir(exist_ok=True)
                elif member.isfile():
                    with bundle.extractfile(member) as source, target.open('xb') as output:
                        shutil.copyfileobj(source, output)
                    target.chmod(member.mode & 0o755)
            for member in members:
                if member.issym(): (temporary / member.name).symlink_to(member.linkname)
        files = api['tree'](temporary / 'Sparkle.framework')
        (temporary / 'receipt.json').write_text(json.dumps({'schema':1,'version':'2.8.0','archiveSHA256':expected,'files':files},indent=2)+'\n')
        (temporary / 'inputs.json').write_text(json.dumps(['receipt.json', 'LICENSE'] + ['Sparkle.framework/' + p for p in files]) + '\n')
        api['verify'](temporary, expected)
        # Publish only a fully verified immutable tree. No replacement/overwrite.
        temporary.rename(destination)
        return destination
    finally:
        if temporary.exists(): shutil.rmtree(temporary)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--archive', required=True)
    parser.add_argument('--sha256', required=True)
    parser.add_argument('--parent', required=True)
    args = parser.parse_args()
    try:
        stage(args.archive, args.sha256, args.parent)
        print('Sparkle 2.8.0 staged and hash-verified; binary signatures/architecture still require qualification.')
    except Exception:
        raise SystemExit('Sparkle staging failed; no release operation performed') from None
