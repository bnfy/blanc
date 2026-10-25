"""Source-container safety and completeness, without network access."""
import hashlib
import importlib.util
import io
import pathlib
import sys
import tarfile
import unittest
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.dont_write_bytecode = True
SPEC = importlib.util.spec_from_file_location('repack', ROOT / 'ublock/repack-preferred-sources.py')
REPACK = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(REPACK)


def fixture(names):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode='w:gz') as archive:
        for name, content, mode, kind in names:
            member = tarfile.TarInfo(name)
            member.mode, member.type, member.size = mode, kind, len(content)
            archive.addfile(member, io.BytesIO(content))
    return output.getvalue()


class SourceConversion(unittest.TestCase):
    def test_all_files_directories_bytes_and_permissions_survive(self):
        entries = [('root', b'', 0o755, tarfile.DIRTYPE),
                   ('root/LICENSE', b'license\n', 0o644, tarfile.REGTYPE),
                   ('root/build.sh', b'#!/bin/sh\nexit 0\n', 0o755, tarfile.REGTYPE),
                   ('root/binary', bytes(range(256)), 0o644, tarfile.REGTYPE)]
        data = fixture(entries)
        digest = hashlib.sha256(data).hexdigest()
        result = REPACK.repack(data, digest)
        self.assertEqual(result, REPACK.repack(data, digest))
        with zipfile.ZipFile(io.BytesIO(result)) as archive:
            self.assertEqual(len(archive.infolist()), len(entries))
            for name, contents, mode, kind in entries:
                item = archive.getinfo(name + ('/' if kind == tarfile.DIRTYPE else ''))
                self.assertEqual(archive.read(item), contents)
                self.assertEqual((item.external_attr >> 16) & 0o7777, mode)

    def test_wrong_upstream_digest_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'digest mismatch'):
            REPACK.repack(b'wrong source')

    def test_traversal_duplicates_and_links_are_rejected(self):
        for entries in [[('../escape', b'', 0o644, tarfile.REGTYPE)],
                        [('/escape', b'', 0o644, tarfile.REGTYPE)],
                        [('root/x', b'', 0o644, tarfile.SYMTYPE)],
                        [('root/x', b'', 0o644, tarfile.REGTYPE)] * 2]:
            data = fixture(entries)
            with self.assertRaisesRegex(ValueError, 'unsafe or duplicate'):
                REPACK.repack(data, hashlib.sha256(data).hexdigest())


if __name__ == '__main__':
    unittest.main()
