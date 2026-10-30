import hashlib,json,unittest
from pathlib import Path
H=Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
class Test(unittest.TestCase):
 def test_receipt_binding_and_scope(self):
  d=json.loads((H/'combined-manifest-v3.json').read_text());r=json.loads((H/'syntax-combined-20261029-v2/result.json').read_text())
  self.assertEqual(d['previous_combined_manifest_v2_sha256'],sha(H/'combined-manifest-v2.json'));self.assertEqual(d['syntax_result_sha256'],sha(H/'syntax-combined-20261029-v2/result.json'));self.assertEqual(d['syntax_runner_sha256'],sha(H/'syntax-check-combined.py'))
  self.assertEqual((r['status'],r['exitCode'],r['inputsUnchanged']),('passed',0,True));self.assertEqual(r['moduleSha256'],d['module_sha256']);self.assertEqual(r['candidateSha256'],d['combined_native_sha256']);self.assertIn('no GN graph',d['syntax_check']['note']);self.assertEqual(d['gn_reference']['state'],'rolled-back')
if __name__=='__main__':unittest.main()
