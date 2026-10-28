"""Prepare and validate a source-bound preview license/SBOM payload; never build."""
import argparse
import ast
import hashlib
import html
import json
import pathlib
import shutil
import subprocess
import urllib.parse

FONTS = {
    'inter': ('Inter', 'inter-latin.woff2', 'inter-OFL.txt'),
    'jetbrains-mono': ('JetBrains Mono', 'jetbrains-mono-latin.woff2', 'jetbrains-mono-OFL.txt'),
    'caveat': ('Caveat', 'caveat-latin.woff2', 'caveat-OFL.txt'),
    'instrument-sans': ('Instrument Sans', 'instrument-sans-latin-wdth-normal.woff2', 'instrument-sans-OFL.txt'),
}


def digest(path):
    h = hashlib.sha256()
    with pathlib.Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def validate_renderer(blocker, source=None):
    blocker = pathlib.Path(blocker)
    engine = json.loads((blocker / 'manifest.json').read_text())
    renderer = engine.get('proceduralRenderer')
    if renderer is None:
        return None
    script = blocker / 'procedural.js'
    if digest(script) != renderer['bundleSha256']:
        raise ValueError('Procedural renderer differs from manifest')
    if source is not None:
        header = (pathlib.Path(source) / 'chrome/services/blanc_blocker/procedural_renderer.h').read_text()
        prefix = 'inline constexpr char kBlancProceduralRenderer[] = '
        if not header.startswith(prefix) or not header.rstrip().endswith(';'):
            raise ValueError('Unexpected procedural renderer header')
        embedded = json.loads(header[len(prefix):].rstrip()[:-1])
        if embedded != script.read_text():
            raise ValueError('Native procedural renderer differs from asset')
    return renderer['bundleSha256']


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + '\n')


def render_credits(spdx):
    """Render the reachable inventory, never the optional GN placeholder page."""
    packages = spdx.get('packages', [])
    licenses = {item['licenseId']: item['extractedText']
                for item in spdx.get('hasExtractedLicensingInfos', [])}
    if not packages or not licenses:
        raise ValueError('Chromium license inventory is empty')
    sections = []
    for package in packages:
        text = licenses.get(package['licenseConcluded'], '')
        if not text.strip():
            raise ValueError('Missing full license text for ' + package['name'])
        sections.append('<section><h2>' + html.escape(package['name']) + '</h2><pre>'
                        + html.escape(text) + '</pre></section>')
    return ('<!doctype html><html lang="en"><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1">'
            '<title>Chromium third-party notices</title>'
            '<style>body{font:16px system-ui;max-width:80rem;margin:2rem auto;padding:1rem}'
            'pre{white-space:pre-wrap;overflow-wrap:anywhere}section{margin:2rem 0}</style>'
            '<h1>Chromium third-party notices</h1><p>Full license texts from the '
            'GN-reachable shipped component inventory.</p>' + ''.join(sections) + '</html>\n')


def validate(payload, assets, blocker, version, revision):
    payload, assets, blocker = map(pathlib.Path, (payload, assets, blocker))
    manifest = json.loads((payload / 'manifest.json').read_text())
    if manifest['version'] != version or manifest['sourceRevision'] != revision:
        raise ValueError('Compliance version/source does not match the package')
    required = {'LICENSE', 'ASSET-LICENSE.md', 'LICENSE.chromium', 'chromium-credits.html',
                'chromium.spdx.json', 'runtime-sbom.cdx.json', 'source-materials.json',
                'THIRD-PARTY-NOTICES.txt'} | {'licenses/' + item[2] for item in FONTS.values()}
    if not required.issubset(manifest['files']):
        raise ValueError('Required license/provenance files are missing')
    if set(manifest['fontInputs']) != {item[1] for item in FONTS.values()}:
        raise ValueError('Incomplete font inventory')
    expected = set(manifest['files']) | {'manifest.json'}
    actual = {p.relative_to(payload).as_posix() for p in payload.rglob('*') if p.is_file()}
    if actual != expected or any(p.is_symlink() for p in payload.rglob('*')):
        raise ValueError('Compliance payload has missing or unexpected files')
    for name, sha in manifest['files'].items():
        p = pathlib.PurePosixPath(name)
        if p.is_absolute() or '..' in p.parts or digest(payload / name) != sha:
            raise ValueError('Compliance payload digest/path mismatch: ' + name)
    spdx = json.loads((payload / 'chromium.spdx.json').read_text())
    if (payload / 'chromium-credits.html').read_text() != render_credits(spdx):
        raise ValueError('Chromium credits do not contain the inventoried full license texts')
    for name, sha in manifest['fontInputs'].items():
        if digest(assets / 'pages' / name) != sha:
            raise ValueError('Font differs from the licensed input: ' + name)
    if digest(blocker / 'engine.js') != manifest['blockerInput']:
        raise ValueError('Blocker differs from the licensed input')
    if manifest.get('proceduralRendererInput') is not None:
        if validate_renderer(blocker) != manifest['proceduralRendererInput']:
            raise ValueError('Procedural renderer differs from licensed input')
    bom = json.loads((payload / 'runtime-sbom.cdx.json').read_text())
    if (bom['bomFormat'] != 'CycloneDX' or bom['specVersion'] != '1.6'
            or bom['metadata']['component']['version'] != version
            or len(bom['components']) != manifest['componentCount']):
        raise ValueError('Invalid runtime SBOM')
    return manifest


def prepare(repo, source, assets, blocker, output, revision):
    repo, source, assets, blocker, output = map(pathlib.Path, (repo, source, assets, blocker, output))
    if output.exists():
        raise ValueError('Refusing to overwrite a compliance payload')
    git = lambda *a: subprocess.check_output(['git', '-C', str(repo), *a], text=True).strip()
    if git('rev-parse', revision + '^{commit}') != revision:
        raise ValueError('Exact source commit required')
    upstream = subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip()
    parts = dict(line.strip().split('=') for line in (source / 'chrome/VERSION').read_text().splitlines())
    version = '.'.join(parts[k] for k in ['MAJOR', 'MINOR', 'BUILD', 'PATCH'])
    procedural_hash = validate_renderer(blocker, source)
    output.mkdir(parents=True)
    for name in ['LICENSE', 'ASSET-LICENSE.md']:
        shutil.copyfile(repo / name, output / name)
    shutil.copyfile(source / 'LICENSE', output / 'LICENSE.chromium')
    subprocess.run(['python3', str(source / 'tools/licenses/licenses.py'), 'license_file',
                    '--target-os', 'mac', '--gn-out-dir', 'out/BlancPrototype',
                    '--gn-target', '//chrome:chrome', '--format', 'spdx',
                    '--spdx-link', 'https://chromium.googlesource.com/chromium/src/+/' + upstream + '/',
                    '--spdx-doc-name', 'Blanc Chromium Preview ' + version + ' upstream licenses',
                    '--spdx-doc-namespace', 'https://github.com/bnfy/blanc/preview/' + revision + '/upstream',
                    str(output / 'chromium.spdx.json')], cwd=source, check=True)
    license_dir = output / 'licenses'
    license_dir.mkdir()
    components = []
    font_inputs = {}
    for key, (name, filename, license_name) in FONTS.items():
        src = repo / 'src/renderer/pages' / filename
        if digest(src) != digest(assets / 'pages' / filename):
            raise ValueError('Stale font input: ' + filename)
        shutil.copyfile(repo / 'src/renderer/pages' / license_name, license_dir / license_name)
        font_inputs[filename] = digest(src)
        components.append({'type': 'file', 'bom-ref': 'font:' + key, 'name': name,
                           'hashes': [{'alg': 'SHA-256', 'content': digest(src)}],
                           'licenses': [{'expression': 'OFL-1.1'}]})
    engine = json.loads((blocker / 'manifest.json').read_text())
    if digest(blocker / 'engine.js') != engine['bundleSha256']:
        raise ValueError('Blocker manifest does not match its bytes')
    for package in engine['packages']:
        for filename in package['licenseFiles']:
            name = package['name'].replace('/', '_') + '-' + filename
            shutil.copyfile(blocker / 'licenses' / name, license_dir / name)
        components.append({'type': 'library', 'bom-ref': 'npm:' + package['name'],
                           'name': package['name'], 'version': package['version'],
                           'purl': 'pkg:npm/' + urllib.parse.quote(package['name'], safe='/') + '@' + package['version'],
                           'licenses': [{'expression': package['license']}]})
    if procedural_hash is not None:
        components.append({'type': 'file', 'bom-ref': 'file:procedural-renderer',
                           'name': 'Blanc isolated procedural renderer',
                           'hashes': [{'alg': 'SHA-256', 'content': procedural_hash}],
                           'licenses': [{'expression': 'MPL-2.0 AND MIT'}]})
    pins = json.loads((repo / 'adblock/sources/pinned.json').read_text())
    raw = b'\n'.join((repo / 'adblock/sources' / x['file']).read_bytes() for x in pins['lists'])
    if hashlib.sha256(raw).hexdigest() != engine['filtersSha256']:
        raise ValueError('Current filter source differs from the bundled blocker provenance')
    for item in pins['lists']:
        src = repo / 'adblock/sources' / item['file']
        if digest(src) != item['sha256']:
            raise ValueError('Filter source digest mismatch')
        components.append({'type': 'data', 'bom-ref': 'filter:' + item['file'],
                           'name': item['name'] if 'name' in item else item['file'],
                           'hashes': [{'alg': 'SHA-256', 'content': digest(src)}],
                           'licenses': [{'expression': 'CC-BY-SA-3.0-or-later'}]})
    resources = repo / 'adblock/sources' / pins['ghosteryResources']['file']
    if digest(resources) != engine['resourcesSha256']:
        raise ValueError('Redirect/scriptlet source differs from the bundled blocker')
    components.append({'type': 'data', 'bom-ref': 'data:ghostery-resources', 'name': 'Ghostery blocker resources',
                       'hashes': [{'alg': 'SHA-256', 'content': digest(resources)}],
                       'licenses': [{'expression': 'MPL-2.0'}]})
    spdx = json.loads((output / 'chromium.spdx.json').read_text())
    (output / 'chromium-credits.html').write_text(render_credits(spdx))
    for package in spdx['packages']:
        components.append({'type': 'library', 'bom-ref': 'upstream:' + package['SPDXID'],
                           'name': package['name'],
                           'licenses': [{'license': {'name': package['licenseConcluded']}}],
                           'properties': [{'name': 'blanc:inventory-scope', 'value': 'GN-reachable shipped Chromium license component; dependency version not asserted by upstream license inventory'}]})
    refs = [x['bom-ref'] for x in components]
    if len(refs) != len(set(refs)):
        raise ValueError('Duplicate component identifier')
    bom = {'bomFormat': 'CycloneDX', 'specVersion': '1.6', 'version': 1,
           'metadata': {'component': {'type': 'application', 'bom-ref': 'blanc-preview',
                                     'name': 'Blanc Chromium Preview', 'version': version},
                        'properties': [{'name': 'blanc:source-revision', 'value': revision},
                                       {'name': 'blanc:upstream-revision', 'value': upstream},
                                       {'name': 'blanc:inventory-limit', 'value': 'Native license components derive from the selected GN target, with versions unasserted where upstream metadata does not supply them. Resolved dependency pins and source diff are recorded in source-materials.json. This is not a vulnerability-free attestation.'}]},
           'components': components, 'dependencies': [{'ref': 'blanc-preview', 'dependsOn': refs}]}
    write_json(output / 'runtime-sbom.cdx.json', bom)
    native_diff = subprocess.check_output(['git', '-C', str(source), 'diff', '--binary', upstream, '--'])
    additions = subprocess.check_output(['git', '-C', str(source), 'ls-files', '--others',
                                        '--exclude-standard'], text=True).splitlines()
    native_additions = {}
    for name in additions:
        item = source / name
        if item.is_symlink() or not item.is_file():
            raise ValueError('Unexpected added native source: ' + name)
        native_additions[name] = digest(item)
    entries_tree = ast.parse((source.parent / '.gclient_entries').read_text())
    if (len(entries_tree.body) != 1 or not isinstance(entries_tree.body[0], ast.Assign)
            or len(entries_tree.body[0].targets) != 1
            or not isinstance(entries_tree.body[0].targets[0], ast.Name)
            or entries_tree.body[0].targets[0].id != 'entries'):
        raise ValueError('Unexpected resolved dependency manifest')
    dependency_pins = ast.literal_eval(entries_tree.body[0].value)
    write_json(output / 'resolved-dependencies.json', dependency_pins)
    env = json.loads((source / 'out/BlancPrototype/.blanc-build-environment.json').read_text())
    write_json(output / 'source-materials.json', {
        'schemaVersion': 1, 'repository': 'https://github.com/bnfy/blanc', 'sourceRevision': revision,
        'sourceTree': git('rev-parse', revision + '^{tree}'), 'nativeUpstreamRevision': upstream,
        'nativeDiffSha256': hashlib.sha256(native_diff).hexdigest(), 'buildEnvironment': env,
        'addedNativeSourceSha256': native_additions,
        'resolvedDependencyPinsSha256': digest(output / 'resolved-dependencies.json'),
        'buildRecord': json.loads((source / 'out/BlancPrototype/.blanc-last-successful-build.json').read_text()),
        'proceduralRendererInput': procedural_hash,
        'blockerManifestSha256': digest(blocker / 'manifest.json'), 'filterPinsSha256': digest(repo / 'adblock/sources/pinned.json'),
        'upstreamLicenseInventorySha256': digest(output / 'chromium.spdx.json'),
        'provenanceScope': 'Materials observed at packaging; local incremental native build, not a hosted or independent hermetic rebuild. Final signed artifact digest and authenticated distribution manifest are external to avoid a self-hash cycle.'})
    (output / 'THIRD-PARTY-NOTICES.txt').write_text(
        'Blanc Chromium Preview\n\nBlanc-owned software: MIT (LICENSE). Identity artwork: reserved (ASSET-LICENSE.md).\n'
        'Chromium and its shipped third-party components: LICENSE.chromium, chromium-credits.html and chromium.spdx.json.\n'
        'Bundled Inter, Instrument Sans, JetBrains Mono and Caveat: SIL Open Font License 1.1; full notices in licenses/.\n'
        'Blanc Blocker JavaScript packages: exact versions and licenses in runtime-sbom.cdx.json and full texts in licenses/.\n'
        'EasyList/EasyPrivacy-derived data: The EasyList authors, https://easylist.to/, CC BY-SA 3.0 or later; '
        'https://easylist.to/pages/licence.html. The combined filter bytes are transformed into the bundled engine.\n'
        'Ghostery redirect/scriptlet resources: MPL 2.0, https://github.com/ghostery/adblocker.\n'
        'Source and modifications: https://github.com/bnfy/blanc/tree/' + revision + '/experiments/chromium-extension-spike\n')
    files = {p.relative_to(output).as_posix(): digest(p) for p in output.rglob('*') if p.is_file()}
    write_json(output / 'manifest.json', {'version': version, 'sourceRevision': revision,
        'nativeUpstreamRevision': upstream, 'componentCount': len(components), 'files': files,
        'proceduralRendererInput': procedural_hash,
        'fontInputs': font_inputs, 'blockerInput': digest(blocker / 'engine.js')})
    validate(output, assets, blocker, version, revision)
    return len(components)


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    for name in ['repo', 'source', 'assets', 'blocker', 'output', 'revision']:
        p.add_argument('--' + name, required=True)
    a = p.parse_args()
    print('Prepared', prepare(a.repo, a.source, a.assets, a.blocker, a.output, a.revision), 'source-bound components')
