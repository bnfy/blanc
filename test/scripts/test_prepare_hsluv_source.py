"""Check the single publisher-only omission without running upstream scripts."""
import gzip
import hashlib
import importlib.util
import io
import pathlib
import sys
import tarfile
import unittest

sys.dont_write_bytecode = True
ROOT = pathlib.Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('prepare', ROOT / 'ublock/prepare-hsluv-source.py')
PREPARE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PREPARE)


class PreferredSource(unittest.TestCase):
    def fixture(self):
        entries = [('root/LICENSE', b'license\n', 0o644),
                   ('root/build.sh', b'build source\n', 0o755),
                   ('root/source.hx', b'library source\n', 0o644),
                   ('root/tests/data', bytes(range(256)), 0o644),
                   ('root/publisher.sh', b'unrelated publisher helper\n', 0o755)]
        output = io.BytesIO()
        with tarfile.open(fileobj=output, mode='w') as archive:
            for name, content, mode in entries:
                member = tarfile.TarInfo(name)
                member.size, member.mode = len(content), mode
                archive.addfile(member, io.BytesIO(content))
        data = gzip.compress(output.getvalue(), mtime=0)
        return entries, data, hashlib.sha256(data).hexdigest(), hashlib.sha256(entries[-1][1]).hexdigest()

    def test_only_selected_helper_is_omitted_and_all_build_material_is_unchanged(self):
        entries, data, upstream_sha, helper_sha = self.fixture()
        output = PREPARE.prepare(data, upstream_sha, 'root/publisher.sh', helper_sha)
        self.assertEqual(output, PREPARE.prepare(data, upstream_sha, 'root/publisher.sh', helper_sha))
        with tarfile.open(fileobj=io.BytesIO(output)) as archive:
            self.assertEqual(archive.getnames(), [entry[0] for entry in entries[:-1]])
            for name, content, mode in entries[:-1]:
                self.assertEqual(archive.extractfile(name).read(), content)
                self.assertEqual(archive.getmember(name).mode, mode)

    def test_wrong_upstream_or_helper_digest_and_missing_helper_are_rejected(self):
        _, data, upstream_sha, helper_sha = self.fixture()
        with self.assertRaisesRegex(ValueError, 'upstream source digest'):
            PREPARE.prepare(data)
        with self.assertRaisesRegex(ValueError, 'publisher helper digest'):
            PREPARE.prepare(data, upstream_sha, 'root/publisher.sh', '0' * 64)
        with self.assertRaisesRegex(ValueError, 'unexpected source inventory'):
            PREPARE.prepare(data, upstream_sha, 'missing', helper_sha)


if __name__ == '__main__':
    unittest.main()
