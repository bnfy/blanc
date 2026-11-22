#!/usr/bin/env python3
"""Move a lane's pinned Chromium inputs to a new checkout (the rebase drill, docs/android/rebase.md).

  refresh-upstream.py --lane android --src <chromium src> --version <a.b.c.d>
      Copies every file the lane's upstream manifest lists from the checkout, rewrites their
      hashes, the manifest's upstream and version, the lane file's version and upstream and the
      source map's upstream. Then applies the lane's patches to the new files and, if they all
      apply, rewrites the source map's patched hashes (what check-patches.py verifies).
      Exit 1: a listed file is missing from the checkout; nothing is written.
      Exit 3: a patch no longer applies; the pins moved, the patched hashes did not. Rebase that
      patch, then run --patched-only.
  refresh-upstream.py --lane desktop --src <files> --version <a.b.c.d> --upstream <commit>
      The same from a copy of just the pinned files fetched at <commit> (no git checkout, no
      build tree). With a git checkout, --upstream must equal its HEAD.
  refresh-upstream.py --lane android --patched-only
      Recomputes the patched hashes from the pinned files and the current patches.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
parser.add_argument('--lane', default='android')
parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1],
                    help='the chromium/ folder (tests pass a fixture)')
parser.add_argument('--src', type=Path)
parser.add_argument('--version')
parser.add_argument('--upstream', help='the Chromium commit --src was fetched at, for a source that is not a git checkout')
parser.add_argument('--patched-only', action='store_true')
args = parser.parse_args()
if not args.patched_only and (args.src is None or args.version is None):
    parser.error('--src and --version are required unless --patched-only')
if args.version is not None and not re.fullmatch(r'\d+\.\d+\.\d+\.\d+', args.version):
    parser.error('--version must be four numbers, like 157.0.7000.10')
if args.upstream is not None and not re.fullmatch(r'[0-9a-f]{40}', args.upstream):
    parser.error('--upstream must be a full 40-character commit hash')

root = args.root.resolve()
lane_path = root / 'lanes' / f'{args.lane}.json'
lane = json.loads(lane_path.read_text())
upstream_dir = root / lane['upstreamDir']
manifest_path = upstream_dir / 'manifest.json'
manifest = json.loads(manifest_path.read_text())
map_path = root / lane['sourceMap']
source_map = json.loads(map_path.read_text())
sha = lambda data: hashlib.sha256(data).hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')


def safe(name):
    p = Path(name)
    if p.is_absolute() or '..' in p.parts:
        sys.exit(f'Invalid pinned path: {name}')
    return name


def patched_hashes():
    """The pinned files with every lane patch applied, hashed; None and the patch that failed."""
    with tempfile.TemporaryDirectory(prefix='blanc-refresh-') as temp:
        work = Path(temp)
        for name in manifest['files']:
            q = work / safe(name)
            q.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(upstream_dir / name, q)
        for patch in lane['patches']:
            result = subprocess.run(['git', 'apply', str(root / patch)], cwd=work, capture_output=True, text=True)
            if result.returncode != 0:
                return None, patch, result.stderr.strip()
        # apply.py installs files from this map, including files created by a patch.
        names = sorted(p.relative_to(work).as_posix() for p in work.rglob('*') if p.is_file())
        return {name: sha((work / name).read_bytes()) for name in names}, None, None


if not args.patched_only:
    src = args.src.resolve()
    # The version must be the checkout's own, or the pin would name a release it isn't.
    version_file = src / 'chrome' / 'VERSION'
    if version_file.is_file():
        parts = dict(line.split('=', 1) for line in version_file.read_text().split() if '=' in line)
        actual = '.'.join(parts.get(k, '?') for k in ('MAJOR', 'MINOR', 'BUILD', 'PATCH'))
        if actual != args.version:
            sys.exit(f'--version {args.version} is not the checkout\'s chrome/VERSION ({actual}); nothing was written')
    names = [safe(n) for n in manifest['files']]
    missing = [n for n in names if not (src / n).is_file() or (src / n).is_symlink()]
    if missing:
        print('These pinned files are missing from the checkout; nothing was written:', file=sys.stderr)
        for n in missing:
            print(f'  {n}', file=sys.stderr)
        sys.exit(1)
    git_head = subprocess.run(['git', '-C', str(src), 'rev-parse', '--verify', '-q', 'HEAD'], capture_output=True, text=True)
    is_checkout = git_head.returncode == 0 and subprocess.run(
        ['git', '-C', str(src), 'rev-parse', '--show-toplevel'], capture_output=True, text=True).stdout.strip() == str(src)
    if is_checkout:
        head = git_head.stdout.strip()
        if args.upstream is not None and args.upstream != head:
            sys.exit(f'--upstream {args.upstream} is not the checkout\'s HEAD ({head}); nothing was written')
    elif args.upstream is not None:
        head = args.upstream
    else:
        sys.exit(f'{src} is not a git checkout; pass --upstream with the commit its files came from')
    files = {}
    for n in names:
        data = (src / n).read_bytes()
        (upstream_dir / n).parent.mkdir(parents=True, exist_ok=True)
        (upstream_dir / n).write_bytes(data)
        files[n] = sha(data)
    manifest = {**manifest, 'upstream': head, 'version': args.version, 'files': files}
    write_json(manifest_path, manifest)
    write_json(lane_path, {**lane, 'version': args.version, 'upstream': head, 'fileCount': len(files)})
    source_map['upstream'] = head
    write_json(map_path, source_map)
    print(json.dumps({'status': 'pinned', 'upstream': head, 'version': args.version, 'files': len(files)}))

hashes, failed, detail = patched_hashes()
if failed:
    print(f'{failed} no longer applies; rebase it, then run --patched-only.', file=sys.stderr)
    if detail:
        print(detail, file=sys.stderr)
    sys.exit(3)
source_map['upstreamFiles'] = hashes
write_json(map_path, source_map)
print(json.dumps({'status': 'patched', 'upstreamFiles': len(hashes)}))
