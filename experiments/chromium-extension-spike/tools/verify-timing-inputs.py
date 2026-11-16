#!/usr/bin/env python3
"""Verify a frozen native timing handoff. Read-only; never launches a browser."""
import argparse
import hashlib
import json
from pathlib import Path


def digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def verify(receipt):
    if receipt['runtime'] != 'chromium' or receipt['requireIdle'] is not True:
        raise ValueError('Native-only, original idle admission required')
    for entry in receipt['files']:
        if digest(entry['path']) != entry['sha256']:
            raise ValueError('Input changed: ' + entry['path'])
    config = json.loads(Path(receipt['config']).read_text())
    if config.get('nativeTimingTrace') is not True:
        raise ValueError('Native hook timing trace required')
    for key in ['chromium', 'engine', 'ui']:
        if config[key] != receipt['configuration'][key]:
            raise ValueError('Unexpected configuration: ' + key)
    if any(config.get(key) for key in ['authoredCosmeticRules', 'fetchRetryProbe', 'lifecycleProbe', 'rendererTokenMismatchProbe']):
        raise ValueError('Diagnostic overrides are not a production timing baseline')
    engine = Path(config['engine'])
    resources = Path(receipt['signedResources'])
    for name in ['engine.js', 'manifest.json']:
        if digest(engine / name) != digest(resources / 'BlancBlocker' / name):
            raise ValueError('Candidate asset mismatch: ' + name)
    manifest = json.loads(Path(receipt['oracle'], 'candidate-manifest.json').read_text())
    if len(manifest['candidates']) != receipt['candidateCount']:
        raise ValueError('Candidate count changed')
    return {'verified': True, 'runtime': 'chromium', 'requireIdle': True,
            'browserLaunched': False, 'timingAcceptance': False,
            'candidateSource': receipt['candidateSource']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('receipt', type=Path)
    args = parser.parse_args()
    print(json.dumps(verify(json.loads(args.receipt.read_text())), indent=2))
