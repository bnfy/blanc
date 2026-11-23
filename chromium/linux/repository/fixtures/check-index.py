"""Exercise the same index parser and rpmkeys result check used by owner signing."""
import gzip
import hashlib
import shutil
from pathlib import Path
import sys
import tarfile
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import metadata


class IndexCheck(unittest.TestCase):
    APPDATA = b"""<?xml version="1.0" encoding="UTF-8"?>
<!-- Copyright 2024 The Chromium Authors -->
<component type="desktop">
  <id>blanc-beta.desktop</id>
  <update_contact>support@blanc.day</update_contact>
  <metadata_license>CC0-1.0</metadata_license>
  <project_license>BSD-3-Clause and LGPL-2.1+ and (MPL-1.1 or GPL-2.0)</project_license>
  <name>Blanc Beta</name>
  <summary>Blanc web browser</summary>
  <description>
    <p>
    Blanc is a Chromium-based web browser with built-in tracker blocking.
    </p>
  </description>
  <url type="homepage">https://blanc.day</url>
  <translation/>
  <developer_name>Bananify Creative</developer_name>
  <url type="bugtracker">https://github.com/bnfy/blanc/issues</url>
  <url type="help">https://blanc.day</url>
</component>
"""

    def test_dep11_names_the_package_for_the_desktop_component(self):
        self.assertEqual(metadata.dep11(self.APPDATA).decode(), '\n'.join([
            '---', 'File: DEP-11', "Version: '1.0'", 'Origin: blanc-stable-main', '---',
            'Type: desktop-application', 'ID: blanc-beta.desktop', 'Package: blanc-beta',
            'Name:', '  C: "Blanc Beta"', 'Summary:', '  C: "Blanc web browser"',
            'Description:', '  C: "<p>Blanc is a Chromium-based web browser with built-in tracker blocking.</p>"',
            'DeveloperName:', '  C: "Bananify Creative"',
            'ProjectLicense: "BSD-3-Clause and LGPL-2.1+ and (MPL-1.1 or GPL-2.0)"',
            'Url:', '  bugtracker: "https://github.com/bnfy/blanc/issues"', '  help: "https://blanc.day"',
            '  homepage: "https://blanc.day"',
            'Icon:', '  stock: blanc-beta', 'Launchable:', '  desktop-id:', '  - blanc-beta.desktop', '']))

    def test_dep11_quotes_text_and_refuses_another_component(self):
        quoted = self.APPDATA.replace(b'Blanc web browser', b'A "quoted" summary: \\ and \xc3\xa9')
        self.assertIn('  C: "A \\"quoted\\" summary: \\\\ and \\u00e9"', metadata.dep11(quoted).decode())
        for changed in [self.APPDATA.replace(b'<id>blanc-beta.desktop', b'<id>other.desktop'),
                        self.APPDATA.replace(b'<name>Blanc Beta</name>', b''),
                        self.APPDATA.replace(b'<p>', b'<script>').replace(b'</p>', b'</script>'),
                        self.APPDATA.replace(b'type="desktop"', b'type="addon"'),
                        b'<!DOCTYPE c [<!ENTITY x "y">]>' + self.APPDATA.split(b'?>', 1)[1]]:
            with self.subTest(changed=changed[:60]), self.assertRaises(ValueError):
                metadata.dep11(changed)

    def test_appdata_is_read_from_the_package_itself(self):
        import io
        with tempfile.TemporaryDirectory() as tmp:
            payload = io.BytesIO()
            with tarfile.open(fileobj=payload, mode='w') as tar:
                for name, data in [('./usr/share/doc/x', b'doc'), ('./usr/share/appdata/blanc-beta.appdata.xml', self.APPDATA)]:
                    info = tarfile.TarInfo(name); info.size = len(data)
                    tar.addfile(info, io.BytesIO(data))
            with patch('subprocess.Popen') as popen:
                popen.return_value.stdout = io.BytesIO(payload.getvalue())
                popen.return_value.wait.return_value = 0
                self.assertEqual(metadata.deb_appdata(Path(tmp) / 'p.deb'), self.APPDATA)
                self.assertEqual(popen.call_args.args[0][:2], ['dpkg-deb', '--fsys-tarfile'])
            empty = io.BytesIO()
            tarfile.open(fileobj=empty, mode='w').close()
            with patch('subprocess.Popen') as popen:
                popen.return_value.stdout = io.BytesIO(empty.getvalue())
                popen.return_value.wait.return_value = 0
                with self.assertRaisesRegex(ValueError, 'AppStream'):
                    metadata.deb_appdata(Path(tmp) / 'p.deb')

    def test_owner_check_rebuilds_dep11_from_the_approved_package(self):
        with tempfile.TemporaryDirectory() as tmp:
            tree = Path(tmp)
            deb = tree / 'pkg.deb'
            deb.write_bytes(b'deb')
            index = metadata.APT / 'main/dep11/Components-amd64.yml.gz'
            (tree / index).parent.mkdir(parents=True)

            def publish(data):
                (tree / index).write_bytes(gzip.compress(data, mtime=0))
                digest = metadata.sha(tree / index)
                by_hash = tree / index.parent / 'by-hash/SHA256'
                by_hash.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(tree / index, by_hash / digest)
                return digest
            with patch.object(metadata, 'deb_appdata', return_value=self.APPDATA):
                digest = publish(metadata.dep11(self.APPDATA))
                sums, paths = metadata.check_dep11(tree, deb, 'amd64')
                self.assertEqual(sums, [[digest, str((tree / index).stat().st_size), 'main/dep11/Components-amd64.yml.gz']])
                self.assertEqual(paths, {str(index), str(index.parent / 'by-hash/SHA256' / digest)})
                publish(metadata.dep11(self.APPDATA).replace(b'Package: blanc-beta', b'Package: other'))
                with self.assertRaisesRegex(ValueError, 'DEP-11'):
                    metadata.check_dep11(tree, deb, 'amd64')
                good = publish(metadata.dep11(self.APPDATA))
                (tree / index.parent / 'by-hash/SHA256' / good).write_bytes(b'changed')
                with self.assertRaisesRegex(ValueError, 'by-hash'):
                    metadata.check_dep11(tree, deb, 'amd64')

    def test_runner_hashes_the_bytes_it_will_index(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            packages = root / 'inputs'
            packages.mkdir()
            for n in (1, 2):
                for arch in ('amd64', 'arm64'):
                    (packages / f'blanc-beta_158.0.8127.{n}-1_{arch}.deb').write_bytes(b'deb')
                for arch in ('x86_64', 'aarch64'):
                    (packages / f'blanc-beta-158.0.8127.{n}-1.{arch}.rpm').write_bytes(b'rpm')
            metadata.write_approval(packages)
            key = root / 'fixture.asc'
            key.write_bytes(b'key')
            copyfile = shutil.copyfile

            def changed_during_copy(source, dest):
                copyfile(source, dest)
                if source.suffix == '.deb':
                    dest.write_bytes(b'new')

            with patch.object(shutil, 'copyfile', changed_during_copy), patch('subprocess.check_output') as apt:
                apt.side_effect = AssertionError('started indexing changed bytes')
                with self.assertRaisesRegex(ValueError, 'package bytes differ'):
                    metadata.build(packages, root / 'tree', key, packages)

    def test_deb_control_matches_the_approved_package(self):
        header = ("Package: blanc-beta\nVersion: 158.0.8127.2-1\nArchitecture: amd64\n"
                  "Depends: libc6 (>= 2.35),\n zlib1g\nProvides: www-browser\n")
        index = metadata.control(header)
        index.update(filename='pool/package.deb', size='3', sha256='a' * 64)
        file = Path('approved.deb')
        with patch('subprocess.check_output', return_value=header) as query:
            metadata.check_deb_header(file, index)
            self.assertIn(str(file), [str(arg) for arg in query.call_args.args[0]])
            for changed in [dict(index, depends='another'), dict(index, conflicts='other'),
                            dict(index, essential='yes'), {k: v for k, v in index.items() if k != 'provides'}]:
                with self.subTest(changed=changed), self.assertRaisesRegex(ValueError, 'control'):
                    metadata.check_deb_header(file, changed)

    def test_rpm_dependency_groups_match_the_approved_header(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp) / 'x86_64'
            base.mkdir()
            name = 'blanc-beta-158.0.8127.2-1.x86_64.rpm'
            (base / name).write_bytes(b'rpm')
            digest = metadata.sha(base / name)
            rows = {name: {'size': 3, 'sha256': digest}}
            fmt = ('<rpm:requires><rpm:entry name="libc" flags="GE" epoch="0" ver="2" pre="1"/>'
                   '</rpm:requires><rpm:provides><rpm:entry name="browser"/></rpm:provides>')
            xml = ('<metadata xmlns="http://linux.duke.edu/metadata/common" '
                   'xmlns:rpm="http://linux.duke.edu/metadata/rpm" packages="1"><package type="rpm">'
                   '<name>blanc-beta</name><arch>x86_64</arch><version epoch="0" ver="158.0.8127.2" rel="1"/>'
                   f'<size package="3"/><checksum type="sha256">{digest}</checksum><location href="{name}"/>'
                   '<format>{}</format></package></metadata>')
            pkg = SimpleNamespace(name='blanc-beta', epoch=0, version='158.0.8127.2', release='1', arch='x86_64',
                                  requires=[('libc', 'GE', '0', '2', None, True)], files=[],
                                  provides=[('browser', None, None, None, None, False)], conflicts=[],
                                  obsoletes=[], recommends=[], suggests=[], supplements=[], enhances=[])
            primary = base / 'primary.xml.gz'
            with patch.dict(sys.modules, {'rpmrepo_metadata': SimpleNamespace(
                    Package=SimpleNamespace(from_file=lambda file: pkg))}):
                primary.write_bytes(gzip.compress(xml.format(fmt).encode()))
                metadata.check_primary(metadata.read_index(primary), base, rows)
                for changed in [fmt.replace('libc', 'another'), fmt.replace('ver="2"', 'ver="3"'),
                                fmt.replace(' pre="1"', ''), fmt.split('<rpm:provides>')[0],
                                fmt + '<rpm:recommends><rpm:entry name="other"/></rpm:recommends>',
                                fmt + '<rpm:conflicts><rpm:entry name="other"/></rpm:conflicts>']:
                    primary.write_bytes(gzip.compress(xml.format(changed).encode()))
                    with self.subTest(changed=changed), self.assertRaisesRegex(ValueError, 'RPM'):
                        metadata.check_primary(metadata.read_index(primary), base, rows)

    def test_index_read_limits_the_expansion_of_every_gzip_member_and_plain_index(self):
        read = gzip.GzipFile.read

        def bounded_read(stream, size=-1):
            self.assertGreater(size, 0, 'gzip read must be bounded before allocation')
            self.assertLessEqual(size, 1025)
            return read(stream, size)

        with tempfile.TemporaryDirectory() as tmp, patch.object(metadata, 'MAX_INDEX_BYTES', 1024), \
                patch.object(gzip.GzipFile, 'read', bounded_read):
            for name in ['Packages', 'Packages.gz', 'primary.xml.gz', 'filelists.xml.gz', 'other.xml.gz']:
                with self.subTest(name=name):
                    file = Path(tmp) / name
                    block = b'x' * 1024
                    file.write_bytes(gzip.compress(block) if name.endswith('.gz') else block)
                    self.assertEqual(metadata.read_index(file), block)
                    with file.open('ab') as stream:
                        stream.write(gzip.compress(b'y') if name.endswith('.gz') else b'y')
                    with self.assertRaisesRegex(ValueError, 'size limit'):
                        metadata.read_index(file)

    def test_ambiguous_package_location(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp) / 'x86_64'
            base.mkdir()
            name = 'blanc-beta-158.0.8127.2-1.x86_64.rpm'
            digest = hashlib.sha256(b'rpm').hexdigest()
            (base / name).write_bytes(b'rpm')
            root = ET.fromstring(
                '<metadata xmlns="http://linux.duke.edu/metadata/common" packages="1">'
                '<package type="rpm"><name>blanc-beta</name><arch>x86_64</arch>'
                '<version epoch="0" ver="158.0.8127.2" rel="1"/>'
                f'<checksum type="sha256">{digest}</checksum><size package="3"/>'
                f'<location href="{name}"/><location href="another.rpm"/></package></metadata>')
            primary = base / 'primary.xml.gz'
            primary.write_bytes(gzip.compress(ET.tostring(root)))
            with self.assertRaisesRegex(ValueError, 'location'):
                metadata.check_primary(metadata.read_index(primary), base, {name: {'sha256': digest, 'size': 3}})

    def test_unapproved_rpm(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            name = 'blanc-beta-158.0.8127.2-1.x86_64.rpm'
            (base / name).write_bytes(b'rpm')
            index = ('<metadata xmlns="http://linux.duke.edu/metadata/common" packages="1">'
                     '<package type="rpm"><name>blanc-beta</name><arch>x86_64</arch>'
                     '<version epoch="0" ver="158.0.8127.2" rel="1"/>'
                     '<checksum type="sha256">' + hashlib.sha256(b'rpm').hexdigest() +
                     '</checksum><size package="3"/><location href="' + name + '"/></package></metadata>')
            primary = base / 'primary.xml.gz'
            primary.write_bytes(gzip.compress(index.encode()))
            with self.assertRaisesRegex(ValueError, 'unapproved'):
                metadata.check_primary(metadata.read_index(primary), base, {})

    def test_unsigned_rpm(self):
        with self.assertRaisesRegex(ValueError, 'signature'):
            metadata.require_rpm_signature('file.rpm:\n    Header SHA256 digest: OK\n    Payload SHA256 digest: OK\n')


unittest.main()

