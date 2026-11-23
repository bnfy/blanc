"""Build and independently check the two native package indexes. No private key here."""
import gzip
import hashlib
import json
import os
from collections import Counter
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import xml.etree.ElementTree as ET

HERE = Path(__file__).resolve().parent
VERSION = r'(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){3}'
DEB = re.compile(rf'blanc-beta_({VERSION})-1_(amd64|arm64)\.deb')
RPM = re.compile(rf'blanc-beta-({VERSION})-1\.(x86_64|aarch64)\.rpm')
HASH = re.compile(r'[0-9a-f]{64}')
APT = Path('deb/dists/stable')
POOL = Path('deb/pool/main/b/blanc-beta')
RPM_BASE = Path('rpm/stable')
COMMON = '{http://linux.duke.edu/metadata/common}'
REPO = '{http://linux.duke.edu/metadata/repo}'
RPM_NS = '{http://linux.duke.edu/metadata/rpm}'
# Each architecture's index describes exactly one package, including its file list.
MAX_INDEX_BYTES = 4 * 1024 * 1024


def require(condition, message):
    if not condition:
        raise ValueError(message)


def stream_sha(stream, *, copy_to=None):
    digest = hashlib.sha256()
    for block in iter(lambda: stream.read(1024 * 1024), b''):
        digest.update(block)
        if copy_to is not None:
            copy_to.write(block)
    return digest.hexdigest()


def sha(file):
    with file.open('rb') as stream:
        return stream_sha(stream)


def package_record(file):
    return {'file': file.name, 'sha256': sha(file)}


def read_index(file):
    opener = gzip.open if file.suffix == '.gz' else open
    with opener(file, 'rb') as stream:
        data = stream.read(MAX_INDEX_BYTES + 1)
    require(len(data) <= MAX_INDEX_BYTES, f'index exceeds size limit: {file.name}')
    return data


APPDATA = './usr/share/appdata/blanc-beta.appdata.xml'
DEP11_ID = 'blanc-beta.desktop'
MAX_APPDATA_BYTES = 64 * 1024


def deb_appdata(deb):
    """The package's own AppStream file, streamed out of its data archive."""
    proc = subprocess.Popen(['dpkg-deb', '--fsys-tarfile', str(deb)], stdout=subprocess.PIPE)
    found = None
    try:
        with tarfile.open(fileobj=proc.stdout, mode='r|') as tar:
            for member in tar:
                if member.name == APPDATA:
                    require(member.isreg() and member.size <= MAX_APPDATA_BYTES, 'invalid AppStream file in package')
                    found = tar.extractfile(member).read()
                    break
    finally:
        proc.stdout.close()
        proc.kill()
        proc.wait()
    require(found is not None, f'package has no AppStream file: {deb.name}')
    return found


def _quote(text):
    return json.dumps(' '.join(text.split()))


def _markup(element):
    tags = {'p': [], 'ul': ['li'], 'ol': ['li'], 'li': []}
    require(element.tag in tags and not element.attrib, f'unsupported AppStream markup: {element.tag}')
    if tags[element.tag]:
        require(not (element.text or '').strip(), 'text outside list items')
        require(all(child.tag == 'li' for child in element), 'list item expected')
        inner = ''.join(_markup(child) for child in element)
    else:
        require(len(element) == 0, 'nested markup in a paragraph')
        inner = ' '.join((element.text or '').split()).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    return f'<{element.tag}>{inner}</{element.tag}>'


def dep11(appdata):
    """DEP-11 catalog text for the package's desktop component, from its AppStream file.

    Ubuntu's App Center matches an apt update to an app by the catalog's Package
    name; a package's own metainfo names no package. Both the runner and the
    owner's index check build these bytes from the approved .deb."""
    require(b'<!DOCTYPE' not in appdata and b'<!ENTITY' not in appdata, 'AppStream file declares entities')
    root = ET.fromstring(appdata)
    require(root.tag == 'component' and root.get('type') in ('desktop', 'desktop-application'), 'not a desktop component')

    def one(tag):
        found = [e for e in root.findall(tag) if '{http://www.w3.org/XML/1998/namespace}lang' not in e.attrib]
        require(len(found) == 1 and (found[0].text or '').strip(), f'AppStream file needs one {tag}')
        return found[0].text
    require(' '.join(one('id').split()) == DEP11_ID, 'unexpected AppStream component id')
    description = root.findall('description')
    require(len(description) == 1 and len(description[0]) > 0, 'AppStream file needs a description')
    urls = {}
    for url in root.findall('url'):
        require(url.get('type') in ('homepage', 'bugtracker', 'help') and url.get('type') not in urls,
                'unexpected AppStream url')
        require(re.fullmatch(r'https://[^\s"]+', (url.text or '').strip()), 'AppStream urls must be https')
        urls[url.get('type')] = url.text.strip()
    lines = ['---', 'File: DEP-11', "Version: '1.0'", 'Origin: blanc-stable-main', '---',
             'Type: desktop-application', f'ID: {DEP11_ID}', 'Package: blanc-beta',
             'Name:', '  C: ' + _quote(one('name')), 'Summary:', '  C: ' + _quote(one('summary')),
             'Description:', '  C: ' + json.dumps(''.join(_markup(e) for e in description[0])),
             'DeveloperName:', '  C: ' + _quote(one('developer_name')),
             'ProjectLicense: ' + _quote(one('project_license'))]
    if urls:
        lines += ['Url:', *(f'  {kind}: {json.dumps(urls[kind])}' for kind in sorted(urls))]
    lines += ['Icon:', '  stock: blanc-beta', 'Launchable:', '  desktop-id:', f'  - {DEP11_ID}', '']
    return '\n'.join(lines).encode()


def write_json(file, value):
    file.write_text(json.dumps(value, indent=2) + '\n')


def finish_directory(source, output):
    require(not os.path.lexists(output), f'output already exists: {output}')
    with tempfile.TemporaryDirectory(dir=output.parent) as temp:
        pending = Path(temp) / 'tree'
        shutil.copytree(source, pending)
        pending.rename(output)


def package_path(name):
    if DEB.fullmatch(name):
        return POOL / name
    match = RPM.fullmatch(name)
    require(match, f'unexpected package name: {name}')
    return RPM_BASE / match[2] / name


def validate_matrix(names):
    versions = set()
    for name in names:
        match = DEB.fullmatch(name) or RPM.fullmatch(name)
        require(match, f'unexpected package name: {name}')
        versions.add(match[1])
    require(len(versions) == 2, 'expected a proof build and a release build')
    for version in versions:
        for arch in ['amd64', 'arm64']:
            require(f'blanc-beta_{version}-1_{arch}.deb' in names, f'missing {version} {arch} deb')
        for arch in ['x86_64', 'aarch64']:
            require(f'blanc-beta-{version}-1.{arch}.rpm' in names, f'missing {version} {arch} rpm')
    proof, release = sorted(versions, key=lambda v: tuple(map(int, v.split('.'))))
    old_prefix, old_build = proof.rsplit('.', 1)
    prefix, build = release.rsplit('.', 1)
    require(prefix == old_prefix and int(build) == int(old_build) + 1,
            'expected consecutive proof and release builds of the same Chromium version')
    return release


def inventory(root, exclude=()):
    files = []
    for file in sorted(root.rglob('*'), key=lambda p: p.as_posix()):
        require(not file.is_symlink(), f'symlink in tree: {file.name}')
        if file.is_dir():
            continue
        require(file.is_file(), f'non-regular file: {file.name}')
        name = file.relative_to(root).as_posix()
        if name not in exclude:
            files.append({'path': name, 'sha256': sha(file)})
    return files


def approved(directory):
    doc = json.loads((directory / 'approved-packages.json').read_bytes())
    require(doc['schema'] == 1, 'unknown approval schema')
    rows = {row['file']: row for row in doc['packages']}
    require(len(rows) == len(doc['packages']), 'duplicate package approval')
    require(validate_matrix(rows) == doc['releaseVersion'], 'release must be the newer approved version')
    for row in rows.values():
        require(HASH.fullmatch(row['sha256']) and type(row['size']) is int and row['size'] > 0,
                'invalid approved package size or digest')
    return doc['releaseVersion'], rows


def package_files(directory):
    files = sorted(p for p in directory.iterdir() if p.suffix in ('.deb', '.rpm'))
    require(all(p.is_file() and not p.is_symlink() for p in files), 'expected regular package files')
    validate_matrix({p.name for p in files})
    return files


def write_approval(directory):
    files = package_files(directory)
    write_json(directory / 'approved-packages.json', {
        'schema': 1, 'releaseVersion': validate_matrix({p.name for p in files}),
        'packages': [{**package_record(p), 'size': p.stat().st_size} for p in files],
    })


def unpack_candidate(arch, tar_sha, archive, directory, channel='preview'):
    require(arch in ('x64', 'arm64'), 'unknown Linux architecture')
    require(HASH.fullmatch(tar_sha), 'invalid candidate tarball SHA-256')
    package = 'blanc-beta' if channel == 'beta' else 'blanc-prototype'
    manifest = None
    executable_sha = None
    packages = {}
    # The input may change. Verify the compressed bytes before opening the tar,
    # then unpack from the same private snapshot without reopening the input.
    def open_archive(file, flags):
        return os.open(file, flags | os.O_NOFOLLOW | os.O_NONBLOCK)

    with tempfile.TemporaryFile(dir=directory.parent) as snapshot:
        with open(archive, 'rb', opener=open_archive) as stream:
            require(stat.S_ISREG(os.fstat(stream.fileno()).st_mode), 'expected a regular archive')
            digest = stream_sha(stream, copy_to=snapshot)
        require(digest == tar_sha, 'candidate tarball SHA-256 mismatch')
        snapshot.seek(0)
        directory.mkdir()
        with tarfile.open(fileobj=snapshot, mode='r|gz') as tar:
            for entry in tar:
                name = entry.name.removeprefix('./')
                if name == '.' or entry.isdir():
                    continue
                if name == 'candidate.json':
                    require(entry.isfile() and manifest is None and entry.size <= 65536, 'invalid candidate.json')
                    manifest = json.load(tar.extractfile(entry))
                elif name == 'chrome/chrome':
                    require(entry.isfile() and executable_sha is None, 'invalid chrome executable')
                    executable_sha = stream_sha(tar.extractfile(entry))
                elif name.startswith('packages/'):
                    match = re.fullmatch(rf'packages/({package}[-_][\w.-]+\.(deb|rpm))', name, re.ASCII)
                    require(entry.isfile() and match and match[2] not in packages, f'unexpected package: {name}')
                    file = directory / match[1]
                    with file.open('xb') as out:
                        shutil.copyfileobj(tar.extractfile(entry), out)
                    packages[match[2]] = package_record(file)

    require(manifest, 'missing candidate.json')
    if not packages and not manifest.get('packages'):
        raise ValueError('Runtime-only candidate has no DEB or RPM. Build installers after the owner commits '
                         'chromium/linux/keys/blanc-repository.asc.')
    require(manifest['platform'] == 'linux' and manifest['channel'] == channel
            and manifest['arch'] == arch, f'expected the selected Linux {channel}')
    require(executable_sha and manifest['exeSha256'] == executable_sha
            and manifest['id'] == f'linux-{arch}-{executable_sha[:16]}', 'candidate executable hash mismatch')
    version = manifest['version']
    require(re.fullmatch(VERSION, version), 'invalid candidate version')
    deb_arch, rpm_arch = ('amd64', 'x86_64') if arch == 'x64' else ('arm64', 'aarch64')
    require(set(packages) == {'deb', 'rpm'} and
            packages['deb']['file'] == f'{package}_{version}-1_{deb_arch}.deb' and
            packages['rpm']['file'] == f'{package}-{version}-1.{rpm_arch}.rpm',
            'expected both packages for the candidate version and architecture')
    rows = manifest['packages']
    if channel == 'beta':
        build = manifest.get('build')
        require(type(build) is int and build == int(version.rsplit('.', 1)[1]),
                'manifest build must be an integer matching the archive build')
        # Earlier release inputs also allowed paths relative to the archive root.
        rows = [{**row, 'file': row['file'].removeprefix('packages/')} for row in rows]
    require(sorted(rows, key=lambda row: row['file']) ==
            sorted(packages.values(), key=lambda row: row['file']), 'candidate package hashes differ')
    if channel == 'preview':
        write_json(directory / 'unsigned-candidate.json', {
            'candidate': manifest['id'], 'tarSha256': tar_sha, 'arch': arch, **packages,
        })
    return manifest


def unpack_beta(checksums, archives, directory):
    lines = checksums.read_text().splitlines()
    require(len(lines) == 4, 'expected four build-checked candidate tarball digests')
    directory.mkdir()
    sources = set()
    for line in lines:
        match = re.fullmatch(r'([0-9a-f]{64})  (blanc-linux-beta-(x64|arm64)-([1-9][0-9]*)-candidate\.tar\.gz)', line)
        require(match, 'invalid beta candidate SHA256SUMS entry')
        digest, filename, arch, build = match.groups()
        with tempfile.TemporaryDirectory(dir=directory.parent) as scratch:
            pair = Path(scratch) / 'packages'
            manifest = unpack_candidate(arch, digest, archives / filename, pair, 'beta')
            require(manifest['version'].split('.')[-1] == build, 'archive build differs from its package version')
            require(re.fullmatch('[a-f0-9]{40}', manifest['treeCommit']), 'missing beta source commit')
            sources.add(manifest['treeCommit'])
            for file in pair.iterdir():
                require(not (directory / file.name).exists(), 'duplicate beta candidate package')
                file.rename(directory / file.name)
    require(len(sources) == 1, 'beta candidates have different source commits')
    package_files(directory)


def approve_candidate(directory):
    record = json.loads((directory / 'unsigned-candidate.json').read_bytes())
    require(package_record(directory / record['deb']['file']) == record['deb'], 'DEB changed during signing')
    record['rpm'] = package_record(directory / record['rpm']['file'])
    write_json(directory / f"signed-candidate-{record['arch']}.json", record)


def check_package(file, rows, digest, size):
    row = rows.get(file.name)
    require(row is not None, f'unapproved package: {file.name}')
    require((digest, size) == (row['sha256'], row['size']), f'unapproved digest or size for {file.name}')
    require(file.is_file() and file.stat().st_size == size and sha(file) == digest,
            f'package bytes differ: {file.name}')


def control(text):
    fields = {}
    key = None
    for line in text.strip('\n').splitlines():
        if line.startswith((' ', '\t')) and key:
            fields[key] += '\n' + line
        else:
            name, sep, value = line.partition(':')
            key = name.lower()
            require(sep and re.fullmatch(r'[a-z0-9-]+', key) and key not in fields,
                    f'invalid or duplicate control field: {name}')
            fields[key] = value.strip()
    return fields


def build(directory, tree, key, approval_directory):
    version, rows = approved(approval_directory)
    files = package_files(directory)
    require(set(rows) == {p.name for p in files}, 'inputs differ from the approval')
    tree.mkdir()
    for file in files:
        row = rows[file.name]
        match = DEB.fullmatch(file.name) or RPM.fullmatch(file.name)
        if match[1] == version:
            dest = tree / package_path(file.name)
            dest.parent.mkdir(exist_ok=True, parents=True)
            shutil.copyfile(file, dest)
            file = dest
        check_package(file, rows, row['sha256'], row['size'])
    shutil.copyfile(key, tree / 'blanc-repository.asc')
    apt = ['apt-ftparchive', '-c', str(HERE / 'apt-ftparchive.conf')]
    packages = subprocess.check_output([*apt, 'packages', 'pool'], cwd=tree / 'deb').decode()
    paragraphs = [p for p in packages.strip('\n').split('\n\n') if p]
    for arch in ['amd64', 'arm64']:
        dest = tree / APT / 'main' / ('binary-' + arch)
        dest.mkdir(parents=True)
        entries = [p for p in paragraphs if control(p)['architecture'] == arch]
        require(len(entries) == 1, f'expected one approved deb for {arch}')
        data = (entries[0] + '\n\n').encode()
        (dest / 'Packages').write_bytes(data)
        (dest / 'Packages.gz').write_bytes(gzip.compress(data, mtime=0))
        dep11_dir = tree / APT / 'main' / 'dep11'
        dep11_dir.mkdir(exist_ok=True)
        deb = tree / package_path(f'blanc-beta_{version}-1_{arch}.deb')
        (dep11_dir / f'Components-{arch}.yml.gz').write_bytes(gzip.compress(dep11(deb_appdata(deb)), mtime=0))
    release = subprocess.check_output([*apt, 'release', '.'], cwd=tree / APT)
    (tree / APT / 'Release').write_bytes(release)
    for p in [*(tree / APT).glob('main/binary-*/Packages*'), *(tree / APT).glob('main/dep11/Components-*')]:
        by_hash = p.parent / 'by-hash/SHA256'
        by_hash.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(p, by_hash / sha(p))
    for arch in ['x86_64', 'aarch64']:
        subprocess.run(['createrepo_c', '--no-database', '--unique-md-filenames', '--checksum', 'sha256',
                        '--compress-type', 'gz', '--general-compress-type', 'gz', '.'],
                       cwd=tree / RPM_BASE / arch, check=True)
    write_json(tree / 'tree.json', {'schema': 1, 'files': inventory(tree)})


def require_rpm_signature(output):
    # rpm 4 can exit zero for an unsigned package whose digests verify.
    require(re.search(r'^\s*(?:Header |Legacy )?[^\n]*\bsignature\b[^:\n]*(?::[^\n]*)?: OK\s*$',
                      output, re.I | re.M), 'no verified RPM signature')


def verify_rpm(path, db):
    result = subprocess.run(['rpmkeys', '--dbpath', str(db), '--define', '_pkgverify_level all',
                             '--checksig', '--verbose', str(path)], check=True, stdout=subprocess.PIPE,
                            env={**os.environ, 'LC_ALL': 'C'}, text=True)
    require_rpm_signature(result.stdout)


def only_child(element, ns, tag):
    children = element.findall(ns + tag)
    require(len(children) == 1, f'expected exactly one {tag}')
    return children[0]


def check_deb_header(file, fields):
    header = control(subprocess.check_output(['dpkg-deb', '--field', str(file)], text=True))
    package_fields = {k: v for k, v in fields.items() if k not in {'filename', 'size', 'sha256'}}
    require(package_fields == header, f'DEB index differs from approved control record: {file.name}')


def check_rpm_files(element, ns, files):
    indexed = [(e.get('type'), e.text) for e in element.findall(ns + 'file')]
    require(Counter(indexed) == Counter(files), 'RPM indexed files differ from package header')


def check_rpm_format(element, header):
    for group in ('requires', 'provides', 'conflicts', 'obsoletes', 'recommends', 'suggests', 'supplements', 'enhances'):
        indexed = []
        sections = element.findall(RPM_NS + group)
        require(len(sections) <= 1, f'duplicate RPM {group}')
        for section in sections:
            for dep in section:
                require(dep.tag == RPM_NS + 'entry' and dep.get('pre') in (None, '1') and
                        set(dep.attrib) <= {'name', 'flags', 'epoch', 'ver', 'rel', 'pre'}, f'invalid RPM {group} entry')
                indexed.append((dep.get('name'), dep.get('flags'), dep.get('epoch'), dep.get('ver'),
                                dep.get('rel'), dep.get('pre') == '1'))
        require(Counter(indexed) == Counter(getattr(header, group)), f'RPM {group} differs from package header')
    # createrepo_c includes these file provides in primary.xml and all files in filelists.xml.
    check_rpm_files(element, COMMON, [(kind, name) for kind, name in header.files
                                      if name.startswith('/etc/') or 'bin/' in name or name == '/usr/lib/sendmail'])


def check_primary(raw, base, rows):
    root = ET.fromstring(raw)
    require(root.tag == COMMON + 'metadata', 'invalid primary metadata')
    entries = root.findall(COMMON + 'package')
    require(root.get('packages') == '1' and len(entries) == 1, 'expected one indexed RPM')
    # An xml:base would redirect even a relative package location.
    require(not any('{http://www.w3.org/XML/1998/namespace}base' in x.attrib for x in root.iter()),
            'primary.xml supplies an alternate base URL')
    entry = entries[0]
    location = only_child(entry, COMMON, 'location').attrib['href']
    require(location in rows, f'unapproved RPM indexed: {location}')
    match = RPM.fullmatch(location)
    require(match and match[2] == base.name, 'wrong RPM architecture or package name')
    version = only_child(entry, COMMON, 'version')
    require(only_child(entry, COMMON, 'name').text == 'blanc-beta' and
            only_child(entry, COMMON, 'arch').text == match[2] and version.get('ver') == match[1] and
            version.get('rel') == '1' and version.get('epoch', '0') == '0', 'wrong RPM identity')
    checksum = only_child(entry, COMMON, 'checksum')
    require(checksum.get('type') == 'sha256', 'primary index must use SHA-256')
    check_package(base / location, rows, checksum.text, int(only_child(entry, COMMON, 'size').get('package')))
    from rpmrepo_metadata import Package
    header = Package.from_file(base / location)
    require((header.name, header.epoch, header.version, header.release, header.arch) ==
            ('blanc-beta', 0, match[1], '1', match[2]), 'RPM identity differs from approved package header')
    check_rpm_format(only_child(entry, COMMON, 'format'), header)
    return location, header


def check_dep11(tree, deb, arch):
    """Rebuild one architecture's DEP-11 catalog from the approved package and require the runner's bytes."""
    index = APT / 'main' / 'dep11' / f'Components-{arch}.yml.gz'
    require(read_index(tree / index) == dep11(deb_appdata(deb)), f'DEP-11 catalog differs for {arch}')
    digest = sha(tree / index)
    copy = index.parent / 'by-hash/SHA256' / digest
    require(sha(tree / copy) == digest, 'DEP-11 by-hash copy differs')
    return ([[digest, str((tree / index).stat().st_size), str(index.relative_to(APT))]],
            {str(index), str(copy)})


def check_indices(directory, tree, key, db, package_directory):
    version, rows = approved(directory)
    selected = {name: row for name, row in rows.items()
                if (DEB.fullmatch(name) or RPM.fullmatch(name))[1] == version}
    # Inventory the private snapshot first. This rejects symlinks before writing any local inputs.
    files = inventory(tree, ['tree.json'])
    received = {f['path'] for f in files}
    local = {package_path(name): package_directory / name for name in selected}
    local[Path('blanc-repository.asc')] = key
    for path, source in local.items():
        if str(path) not in received:
            require(source.is_file() and not source.is_symlink(), f'missing local input: {path.name}')
            dest = tree / path
            dest.parent.mkdir(exist_ok=True, parents=True)
            shutil.copyfile(source, dest)
            files.append({'path': str(path), 'sha256': sha(dest)})
    files.sort(key=lambda f: f['path'])
    require(json.loads(read_index(tree / 'tree.json')) == {'schema': 1, 'files': files},
            'unsigned tree inventory differs')
    expected = {'blanc-repository.asc', (APT / 'Release').as_posix()}
    require(sha(tree / 'blanc-repository.asc') == sha(key), 'repository key differs')
    expected.update(package_path(name).as_posix() for name in selected)
    release = control(read_index(tree / APT / 'Release').decode())
    headers = {'origin': 'Blanc', 'label': 'Blanc', 'suite': 'stable', 'codename': 'stable',
               'architectures': 'amd64 arm64', 'components': 'main', 'acquire-by-hash': 'yes'}
    require(all(release.get(k) == v for k, v in headers.items()) and
            set(release) == set(headers) | {'date', 'sha256'}, 'unexpected apt Release fields')
    sums = []
    for arch in ['amd64', 'arm64']:
        dest = APT / 'main' / ('binary-' + arch)
        plain = read_index(tree / dest / 'Packages')
        require(read_index(tree / dest / 'Packages.gz') == plain, 'Packages.gz differs')
        fields = control(plain.decode())
        name = f'blanc-beta_{version}-1_{arch}.deb'
        deb = package_path(name)
        require(fields['filename'] == str(deb.relative_to('deb')) and fields['package'] == 'blanc-beta'
                and fields['architecture'] == arch and fields['version'] == version + '-1',
                'unapproved apt index entry')
        require(not {'md5sum', 'sha1', 'sha512'} & fields.keys(), 'unexpected apt package checksum algorithm')
        check_package(tree / deb, selected, fields['sha256'], int(fields['size']))
        check_deb_header(tree / deb, fields)
        for filename in ['Packages', 'Packages.gz']:
            local = dest / filename
            digest = sha(tree / local)
            copy = dest / 'by-hash/SHA256' / digest
            require(sha(tree / copy) == digest, 'by-hash copy differs')
            expected.update([str(local), str(copy)])
            sums.append([digest, str((tree / local).stat().st_size), str(local.relative_to(APT))])
        dep11_sums, dep11_paths = check_dep11(tree, tree / deb, arch)
        sums += dep11_sums
        expected.update(dep11_paths)
    require(sorted(sums) == sorted(line.split() for line in release['sha256'].splitlines() if line.strip()),
            'apt Release checksums differ')

    subprocess.run(['rpmkeys', '--dbpath', str(db), '--import', str(key)], check=True)
    for arch in ['x86_64', 'aarch64']:
        base = RPM_BASE / arch
        repomd = base / 'repodata/repomd.xml'
        expected.add(str(repomd))
        xml = ET.fromstring(read_index(tree / repomd))
        require(xml.tag == REPO + 'repomd' and not any(
            '{http://www.w3.org/XML/1998/namespace}base' in e.attrib for e in xml.iter()), 'invalid repomd.xml')
        entries = xml.findall(REPO + 'data')
        require(sorted(x.get('type') for x in entries) == ['filelists', 'other', 'primary'],
                'unexpected repomd index set')
        for entry in entries:
            digest = only_child(entry, REPO, 'checksum')
            require(digest.get('type') == 'sha256' and HASH.fullmatch(digest.text), 'invalid repomd checksum')
            href = only_child(entry, REPO, 'location').get('href')
            require(href == f"repodata/{digest.text}-{entry.get('type')}.xml.gz", 'unexpected metadata path')
            local = tree / base / href
            require(sha(local) == digest.text and local.stat().st_size == int(only_child(entry, REPO, 'size').text),
                    'repomd digest or size differs')
            raw = read_index(local)
            opened = only_child(entry, REPO, 'open-checksum')
            require(opened.get('type') == 'sha256' and opened.text == hashlib.sha256(raw).hexdigest() and
                    int(only_child(entry, REPO, 'open-size').text) == len(raw), 'repomd open checksum differs')
            expected.add(str(base / href))
            if entry.get('type') == 'primary':
                name, header = check_primary(raw, tree / base, selected)
                verify_rpm(tree / base / name, db)
            else:
                kind = entry.get('type')
                ns = '{http://linux.duke.edu/metadata/' + kind + '}'
                secondary = ET.fromstring(raw)
                row = only_child(secondary, ns, 'package')
                name = f'blanc-beta-{version}-1.{arch}.rpm'
                require(secondary.get('packages') == '1' and row.get('pkgid') == selected[name]['sha256']
                        and row.get('name') == 'blanc-beta' and row.get('arch') == arch,
                        f'unapproved package in {kind}')
                if kind == 'filelists':
                    filelist = row
        check_rpm_files(filelist, '{http://linux.duke.edu/metadata/filelists}', header.files)
    require({f['path'] for f in files} == expected, 'unexpected or missing files in unsigned tree')


def seal(tree):
    files = inventory(tree)
    digest = hashlib.sha256(''.join(f"{r['sha256']}  {r['path']}\n" for r in files).encode()).hexdigest()
    write_json(tree / 'signed-tree.json', {'schema': 1, 'files': files, 'digest': digest})


if __name__ == '__main__':
    command, *args = sys.argv[1:]
    paths = [Path(arg).absolute() for arg in args]
    if command == 'unpack-candidate':
        unpack_candidate(args[0], args[1], *paths[2:])
    elif command == 'unpack-beta-candidate':
        arch, tar_sha, _, _, version = args
        manifest = unpack_candidate(arch, tar_sha, paths[2], paths[3], 'beta')
        require(manifest['version'] == version, 'archive version differs from selected beta')
        print(json.dumps(manifest))
    elif command == 'copy-packages':
        _, _, expected = args
        paths[1].mkdir()
        for package in package_files(paths[0]):
            shutil.copyfile(package, paths[1] / package.name)
        actual = [f'{sha(p)}  {p.name}' for p in package_files(paths[1])]
        require(sorted(expected.splitlines()) == sorted(actual), 'private package SHA-256 differs from build-check')
    elif command == 'names':
        for name in approved(paths[0])[1]:
            print(name)
    else:
        {'approve': write_approval, 'unpack-beta': unpack_beta, 'approve-candidate': approve_candidate, 'build': build, 'check': check_indices,
         'verify-rpm': verify_rpm, 'seal': seal, 'finish': finish_directory}[command](*paths)

