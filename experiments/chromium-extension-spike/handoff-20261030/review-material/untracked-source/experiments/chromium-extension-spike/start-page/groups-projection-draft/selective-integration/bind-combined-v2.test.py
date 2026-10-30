import importlib.util,json,unittest
from pathlib import Path
H=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('binding',H/'bind-combined-v2.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Test(unittest.TestCase):
 def test_binding_includes_exact_receipt_modules_and_gn_before_after(self):
  d=json.loads((H/'combined-manifest-v2.json').read_text());self.assertEqual(d,m.build());self.assertEqual(d['search_receipt_sha256_pinned'],m.m.SEARCH_RECEIPT_SHA);self.assertEqual(d['module_sha256'],dict(sorted(m.m.EXPECTED_MODULES.items())));self.assertEqual(d['gn_reference']['state'],'rolled-back');self.assertIn('not validated',d['gn_reference']['note'])
if __name__=='__main__':unittest.main()
