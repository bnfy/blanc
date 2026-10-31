"""Verify the complete preview artifact set using the pinned release identity."""
import argparse
import hashlib
import json
import pathlib
import re
import subprocess

IDENTITY = 'anthony@bnfy.me'
ISSUER = 'https://github.com/login/oauth'


def sha256(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def verify(directory, version, source, cosign):
    directory = pathlib.Path(directory)
    if not re.fullmatch(r'\d+\.\d+\.\d+\.\d+', version) or not re.fullmatch(r'[0-9a-f]{40}', source):
        raise ValueError('Exact version and source commit required')
    stem = 'Blanc-Chromium-Preview-' + version + '-' + source[:8]
    names = {stem + '-arm64.zip', stem + '.cdx.json', stem + '.provenance.json', stem + '.files.json'}
    entries = {}
    for line in (directory / 'SHA256SUMS').read_text().splitlines():
        match = re.fullmatch(r'([0-9a-f]{64})  ([^/\\]+)', line)
        if not match or match[2] in entries:
            raise ValueError('Malformed or duplicate checksum entry')
        entries[match[2]] = match[1]
    if set(entries) != names:
        raise ValueError('Incomplete or unexpected artifact manifest')
    actual = {p.name for p in directory.iterdir()}
    if actual != names | {'SHA256SUMS', 'SHA256SUMS.sigstore.json'}:
        raise ValueError('Artifact directory contains missing or unexpected members')
    for name in actual:
        if not (directory / name).is_file() or (directory / name).is_symlink():
            raise ValueError('Artifact set contains a nonregular member')
    # Authenticate before trusting either the checksums or their metadata.
    subprocess.run([cosign, 'verify-blob', '--bundle', str(directory / 'SHA256SUMS.sigstore.json'),
                    '--certificate-identity', IDENTITY, '--certificate-oidc-issuer', ISSUER,
                    str(directory / 'SHA256SUMS')], check=True)
    for name, digest in entries.items():
        if sha256(directory / name) != digest:
            raise ValueError('Artifact checksum mismatch: ' + name)
    provenance = json.loads((directory / (stem + '.provenance.json')).read_text())
    if (provenance.get('_type') != 'https://in-toto.io/Statement/v1'
            or provenance.get('predicateType') != 'https://slsa.dev/provenance/v1'):
        raise ValueError('Invalid provenance statement')
    subject = provenance.get('subject', [])
    if subject != [{'name': stem + '-arm64.zip', 'digest': {'sha256': entries[stem + '-arm64.zip']}}]:
        raise ValueError('Provenance is not bound to this signed archive')
    definition = provenance['predicate']['buildDefinition']
    if definition['externalParameters']['sourceRevision'] != source:
        raise ValueError('Provenance source mismatch')
    bom = json.loads((directory / (stem + '.cdx.json')).read_text())
    properties = {p['name']: p['value'] for p in bom['metadata'].get('properties', [])}
    if (bom['bomFormat'] != 'CycloneDX' or bom['metadata']['component']['version'] != version
            or properties.get('blanc:source-revision') != source):
        raise ValueError('SBOM identity mismatch')
    inventory = json.loads((directory / (stem + '.files.json')).read_text())
    if inventory['sourceRevision'] != source or inventory['archiveSha256'] != entries[stem + '-arm64.zip']:
        raise ValueError('Signed file inventory identity mismatch')
    return {'version': version, 'source': source, 'archiveSha256': entries[stem + '-arm64.zip'],
            'authenticatedFiles': len(entries), 'signer': IDENTITY, 'issuer': ISSUER}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', required=True)
    parser.add_argument('--version', required=True)
    parser.add_argument('--source', required=True)
    parser.add_argument('--cosign', default='cosign')
    args = parser.parse_args()
    print(json.dumps(verify(args.directory, args.version, args.source, args.cosign), indent=2))
