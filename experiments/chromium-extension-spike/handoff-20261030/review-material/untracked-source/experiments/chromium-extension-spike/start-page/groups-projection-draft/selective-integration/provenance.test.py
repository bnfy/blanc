import importlib.util,json,tempfile,unittest
from pathlib import Path
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('provenance',HERE/'generate-provenance.py');g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
class Tests(unittest.TestCase):
 def test_bound_manifest_reconstructs_current_durable_evidence(self):
  d=json.loads((HERE/'provenance-manifest-v2.json').read_text());self.assertEqual(d,g.build());self.assertEqual(d['assets']['preimage_count'],78);self.assertEqual(len(d['assets']['preimage_inventory']),78);self.assertEqual(len(d['assets']['candidate_inventory']),78);self.assertEqual(d['assets']['non_group_changes'],['host.js','overlay.js']);self.assertEqual(len(d['assets']['changed_assets']),5)
  self.assertIn('Unverified candidate',d['assets']['preimage_scope']);self.assertIn('not clean shipping',d['scope']);self.assertIn('does not itself record HEAD',d['chromium']['checkout_note'])
  self.assertEqual(d['producer_sha256']['generate.py'],g.sha(HERE/'generate.py'));self.assertEqual(d['producer_sha256']['renderer-transform.mjs'],g.sha(HERE/'renderer-transform.mjs'))
 def test_drift_and_symlink_are_rejected(self):
  with tempfile.TemporaryDirectory(prefix='blanc-groups-provenance-') as t:
   d=Path(t);(d/'a').write_text('known');self.assertEqual(len(g.inventory(d)),1)
   with self.assertRaises(ValueError):g.checked(d/'a','0'*64)
   (d/'link').symlink_to(d/'a')
   with self.assertRaises(ValueError):g.inventory(d)
if __name__=='__main__':unittest.main()
