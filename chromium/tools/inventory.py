#!/usr/bin/env python3
"""Read-only source reconciliation; writes only the explicitly chosen report."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None


def run(src, *args):
    return subprocess.check_output(['git', '-C', str(src), *args])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--src', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[2]
    baseline = repo / 'experiments/chromium-extension-spike/rebases/158.0.8127.2/manifest.json'
    manifest = json.loads(baseline.read_text())
    paths = run(args.src, 'diff', '--name-only', '-z').decode().split('\0')
    changed = [p for p in paths if p]
    added = []
    for name, expected in sorted(manifest['addedFiles'].items()):
        actual = digest(args.src / name)
        added.append({'path': name, 'baselineSha256': expected,
                      'currentSha256': actual, 'matchesBaseline': actual == expected})
    report = {
        'schemaVersion': 1,
        'qualification': 'read-only inventory; no build or acceptance claim',
        'upstreamHead': run(args.src, 'rev-parse', 'HEAD').decode().strip(),
        'expectedUpstream': manifest['upstream'],
        'baselineManifestSha256': digest(baseline),
        'trackedDiffSha256': hashlib.sha256(run(args.src, 'diff', '--binary')).hexdigest(),
        'modifiedTrackedCount': len(changed),
        'modifiedTracked': [{'path': p, 'sha256': digest(args.src / p)} for p in changed],
        'baselineAddedFiles': added,
    }
    if args.output.exists():
        raise SystemExit('Refusing to overwrite an existing inventory report')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'modifiedTracked': len(changed), 'addedBaselineMatches':
                     sum(x['matchesBaseline'] for x in added), 'addedBaselineTotal': len(added)}))


if __name__ == '__main__':
    main()
