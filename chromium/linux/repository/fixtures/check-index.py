"""Exercise the same index parser and rpmkeys result check used by owner signing."""
import gzip
import hashlib
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import metadata


class IndexCheck(unittest.TestCase):
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

