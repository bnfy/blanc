#!/usr/bin/env python3
# Lists the third-party components a Chromium GN target ships, read from
# Chromium's own license metadata (tools/licenses/licenses.py, the same
# discovery chrome://credits is generated from), with a SHA-256 of every
# licence text. Read-only: `gn desc` runs on a temporary copy of the output
# folder's args.gn, never in the build folder, and nothing is built.
#
#   python3 chromium/release/sbom_scan.py --src SRC --out-dir out/BlancBeta OUT.json
import argparse
import hashlib
import json
import os
import sys
import types


def sha256(path):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--src', required=True, help='Chromium src folder')
    parser.add_argument('--out-dir', required=True, help='GN output folder, relative to src')
    parser.add_argument('--target', default='//chrome:chrome')
    parser.add_argument('output')
    a = parser.parse_args()
    src = os.path.realpath(a.src)
    out_dir = os.path.join(src, a.out_dir)
    if not os.path.isfile(os.path.join(out_dir, 'args.gn')):
        sys.exit('sbom_scan: the output folder has no args.gn')
    sys.path.insert(0, os.path.join(src, 'tools', 'licenses'))
    sys.path.insert(0, os.path.join(src, 'build'))
    os.chdir(src)
    import licenses  # noqa: E402 (Chromium's module, from the pinned tree)
    # licenses.py parses only the fields chrome://credits needs; an SBOM also
    # wants each component's version, revision and CPE.
    for field in ('Version', 'Revision', 'CPEPrefix'):
        if field not in licenses.OPTIONAL_FIELDS:
            licenses.OPTIONAL_FIELDS.append(field)

    # Chromium drops a folder whose licence metadata is broken, from the credits
    # page too, and only says so as a boolean. Record which folders, so the
    # audit can make each one a reviewed decision.
    skipped = []
    parse_dir = licenses.ParseDir

    def recording_parse_dir(path, *rest, **kwargs):
        try:
            return parse_dir(path, *rest, **kwargs)
        except licenses.LicenseError as error:
            skipped.append({'dir': os.path.relpath(os.path.join(src, path), src), 'reason': str(error)[:300]})
            raise
    licenses.ParseDir = recording_parse_dir
    args = types.SimpleNamespace(
        gn_target=a.target, gn_out_dir=out_dir, scan_root=src, target_os='mac',
        exclude_dirs=None, extra_third_party_dirs=None, extra_allowed_dirs=None,
        enable_warnings=False, shipped_only=True)
    metadatas, had_errors = licenses._DiscoverMetadatas(args)
    components = []
    for m in metadatas:
        files = []
        for path in m.get('License File', []):
            full = os.path.realpath(os.path.join(src, path))
            if not full.startswith(src + os.sep) or not os.path.isfile(full):
                sys.exit('sbom_scan: a licence file is missing or outside the tree')
            files.append({'path': os.path.relpath(full, src), 'sha256': sha256(full)})
        def field(name):
            value = (m.get(name) or '').strip()
            return None if value.upper() in ('', 'N/A', 'NA', 'UNKNOWN', '0') else value
        components.append({
            'name': m['Name'],
            'version': field('Version'),
            'revision': field('Revision'),
            'url': m.get('URL') or None,
            'license': m.get('License') or None,
            'cpePrefix': field('CPEPrefix'),
            'dir': m.get('dir', ''),
            'licenseFiles': files,
        })
    with open(a.output, 'x', encoding='utf-8') as f:
        json.dump({'schema': 1, 'target': a.target, 'outDir': a.out_dir,
                   'parseErrors': bool(had_errors), 'skippedDirs': skipped, 'components': components}, f, indent=1)
        f.write('\n')
    print(json.dumps({'components': len(components), 'skippedDirs': len(skipped)}))


if __name__ == '__main__':
    main()
