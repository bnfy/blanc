from pathlib import Path
import gzip, hashlib, json
r = Path(__file__).parent
for line in (r / 'SHA256SUMS').read_text().splitlines():
    expected, name = line.split('  ', 1)
    p = r / name
    assert hashlib.sha256(p.read_bytes()).hexdigest() == expected, name
    if p.suffix == '.gz':
        gzip.decompress(p.read_bytes())
signed = json.loads((r / 'signed-candidate-audit.json').read_text())
final = json.loads((r / 'final-candidate-audit.json').read_text())
assert signed['machO'] == final['machO'] and len(final['machO']) == 17
assert signed['assets'] == final['assets'] and len(final['assets']) == 7
owner = json.loads((r / 'owner-session.json').read_text())
assert owner['readiness']['count'] == 7 and 'L6' in owner['readiness']['open']
assert owner['stage2']['bitwarden']['status'] == 'passed'
print('All evidence hashes, compressed AX, candidate equality and L5 gate accounting verified')
