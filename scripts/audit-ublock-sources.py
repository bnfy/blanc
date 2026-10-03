#!/usr/bin/env python3
"""Offline coverage audit; an exact source match is not a license clearance."""
import hashlib
import json
import pathlib
import tarfile

root = pathlib.Path(__file__).resolve().parent.parent / 'ublock'
pin = json.loads((root / 'pinned.json').read_text())
prefix = 'uBlock-1.75.0/'
with tarfile.open(root / 'sources/uBlock-1.75.0.tar.gz') as archive:
    entries = {item.name: item for item in archive.getmembers() if item.isfile()}
    source_hashes = {}
    for name, item in entries.items():
        digest = hashlib.sha256(archive.extractfile(item).read()).hexdigest()
        source_hashes.setdefault(digest, []).append(name.removeprefix(prefix))
    coverage = []
    for item in pin['files']:
        matches = source_hashes.get(item['sha256'], [])
        coverage.append({'path': item['path'], 'sha256': item['sha256'],
                         'sourcePaths': matches, 'exactSourceMatch': bool(matches)})

report = {'format': 1, 'version': pin['version'],
          'sourceArchiveSha256': pin['sources'][0]['sha256'],
          'exactMatchCount': sum(item['exactSourceMatch'] for item in coverage),
          'packageFileCount': len(coverage), 'files': coverage,
          'clearance': False,
          'note': 'Minified libraries, fonts, compiled WASM, fetched filter assets and transformed files require a preferred-source/build/notice assessment. Exact matches alone do not establish complete corresponding source.'}
(root / 'source-audit.json').write_text(json.dumps(report, indent=2) + '\n')
print(f"Source audit: {report['exactMatchCount']}/{len(coverage)} exact matches; public distribution remains blocked.")
