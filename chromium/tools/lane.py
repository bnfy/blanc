"""The lane a patch tool works on: its pinned upstream inputs, its source map
and its patch list (chromium/lanes/<name>.json). Desktop is the default."""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
LANES = ('desktop', 'android')


def load(name='desktop'):
    if name not in LANES:
        raise SystemExit(f'Unknown lane {name!r}; use one of {", ".join(LANES)}')
    lane = json.loads((root / 'lanes' / f'{name}.json').read_text())
    upstream = json.loads((root / lane['upstreamDir'] / 'manifest.json').read_text())
    source = json.loads((root / lane['sourceMap']).read_text())
    # Blanc's own source under blanc/ is shared; source-map.json lists it.
    canonical = json.loads((root / 'source-map.json').read_text())['canonicalSha256']
    if not (lane['upstream'] == upstream['upstream'] == source['upstream']) or len(upstream['files']) != lane['fileCount']:
        raise SystemExit('Incorrect or incomplete pinned input set')
    return {'name': name, 'upstream': lane['upstream'], 'upstreamDir': root / lane['upstreamDir'],
            'files': upstream['files'], 'upstreamFiles': source['upstreamFiles'], 'canonicalSha256': canonical,
            'patches': [root / p for p in lane['patches']]}
