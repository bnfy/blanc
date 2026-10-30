import hashlib
import importlib.util
import json
import pathlib
import tempfile
import unittest

here = pathlib.Path(__file__).resolve().parent
loader = importlib.util.spec_from_file_location('clone_stage_preflight', here / 'clone-stage-preflight.py')
module = importlib.util.module_from_spec(loader)
loader.loader.exec_module(module)

def digest(text):
    return hashlib.sha256(text.encode()).hexdigest()

class PreflightTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='clone-stage-preflight-')
        self.addCleanup(self.tmp.cleanup)
        self.root = pathlib.Path(self.tmp.name)
        (self.root / 'ui').mkdir()
        (self.root / 'ui/source').write_text('old')
        (self.root / 'ui/BUILD.gn').write_text('old gn')
        self.spec = {
            'ui/source': (digest('old'), digest('new')),
            'ui/BUILD.gn': (digest('old gn'), digest('new gn')),
            'ui/modules/one.cc': (None, digest('module')),
        }

    def test_complete_preimage_and_partial_transaction(self):
        before = module.classify(self.root, self.spec)
        self.assertTrue(module.all_preimages_present(before, self.spec))
        self.assertFalse(module.all_preimages_present({k: v for k, v in before.items() if k != 'ui/source'}, self.spec))
        self.assertFalse(module.all_preimages_present({**before, 'ui/extra': {'state': 'before'}}, self.spec))
        (self.root / 'ui/source').write_text('new')
        (self.root / 'ui/modules').mkdir()
        (self.root / 'ui/modules/one.cc').write_text('module')
        partial = module.classify(self.root, self.spec)
        self.assertFalse(module.all_preimages_present(partial, self.spec))
        self.assertEqual([partial[k]['state'] for k in self.spec], ['after', 'before', 'after'])

    def test_unknown_content_missing_preimage_and_wrong_module_rejected(self):
        (self.root / 'ui/source').write_text('other')
        with self.assertRaisesRegex(ValueError, 'foreign state'):
            module.classify(self.root, self.spec)
        (self.root / 'ui/source').unlink()
        with self.assertRaisesRegex(ValueError, 'foreign state'):
            module.classify(self.root, self.spec)
        (self.root / 'ui/source').write_text('old')
        (self.root / 'ui/modules').mkdir()
        (self.root / 'ui/modules/one.cc').write_text('unexpected')
        with self.assertRaisesRegex(ValueError, 'foreign state'):
            module.classify(self.root, self.spec)

    def test_symlink_ancestor_or_file_rejected(self):
        (self.root / 'ui/modules').symlink_to(self.root / 'ui')
        with self.assertRaisesRegex(ValueError, 'unsafe ancestor'):
            module.classify(self.root, self.spec)
        (self.root / 'ui/modules').unlink()
        (self.root / 'ui/source').unlink()
        (self.root / 'ui/source').symlink_to(self.root / 'ui/BUILD.gn')
        with self.assertRaisesRegex(ValueError, 'unsafe file type'):
            module.classify(self.root, self.spec)

    def test_read_only_and_invalid_paths(self):
        baseline = {p: p.read_bytes() for p in (self.root / 'ui').iterdir()}
        module.classify(self.root, self.spec)
        self.assertEqual(baseline, {p: p.read_bytes() for p in (self.root / 'ui').iterdir()})
        with self.assertRaisesRegex(ValueError, 'invalid relative path'):
            module.classify(self.root, {'../escape': (None, digest('new'))})
        self.assertFalse(module.all_preimages_present({}))

    def test_fixed_candidate_identities_match_pinned_manifest(self):
        data = (here.parent / 'combined-manifest-v3.json').read_bytes()
        self.assertEqual(hashlib.sha256(data).hexdigest(), '88dd903ff2e1328366fb9b689af674443f4db503138525cb8c6b5a26d8f1858d')
        manifest = json.loads(data)
        self.assertEqual(module.MODULES, manifest['module_sha256'])
        self.assertEqual(module.SPEC[module.UI][0], manifest['groups_native_sha256'])
        self.assertEqual(module.SPEC[module.UI][1], manifest['combined_native_sha256'])
        self.assertEqual(module.SPEC[module.GN][0], manifest['gn_reference']['preimage_sha256'])
        self.assertEqual(module.SPEC[module.GN][1], manifest['gn_reference']['candidate_sha256'])

    def test_preserved_candidate_files_match_expected_postimages(self):
        native = here.parent / 'combined-native-v1'
        gn = here.parent.parent.parent.parent / 'search-host-routing-draft/BUILD.158-candidate.gn'
        for rel, (_, expected) in module.SPEC.items():
            candidate = gn if rel == module.GN else native / rel
            self.assertTrue(candidate.is_file())
            self.assertEqual(hashlib.sha256(candidate.read_bytes()).hexdigest(), expected, rel)

if __name__ == '__main__':
    unittest.main()
