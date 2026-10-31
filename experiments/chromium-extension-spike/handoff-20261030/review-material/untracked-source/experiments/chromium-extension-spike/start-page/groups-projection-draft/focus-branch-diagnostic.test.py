import hashlib, json, re, unittest
from pathlib import Path
P=Path(__file__).resolve().parent
class DiagnosticOverlay(unittest.TestCase):
    def test_only_instrumentation_is_added_and_no_secrets_are_logged(self):
        original=(P/'ui-candidate.cc').read_text()
        instrumented=(P/'ui-focus-branch-diagnostic.cc').read_text()
        blocks=re.findall(r'      // FOCUS_DIAGNOSTIC_BEGIN\n(.*?)      // FOCUS_DIAGNOSTIC_END\n',instrumented,re.S)
        self.assertEqual(len(blocks),10)
        for block in blocks:
            self.assertIn('if (base::CommandLine::ForCurrentProcess()->HasSwitch("blanc-test-group-focus-branches")) {',block)
            self.assertTrue(block.lstrip().startswith('if (base::CommandLine::ForCurrentProcess()->HasSwitch('))
            self.assertTrue(block.rstrip().endswith('}'))
        self.assertEqual(re.sub(r'      // FOCUS_DIAGNOSTIC_BEGIN\n.*?      // FOCUS_DIAGNOSTIC_END\n','',instrumented,flags=re.S),original)
        logs='\n'.join(blocks)
        self.assertNotIn('group_id',logs)
        for name in ['private_denied','owner_unavailable','initial_authority_denied','invalid_id','initial_group_denied','destroyed_after_unfold','owner_changed','recheck_authority_denied','recheck_group_denied','activating']:
            self.assertIn('BLANC_GROUP_DIAG '+name,logs)
    def test_manifest_binds_diagnostic_and_preserved_assets(self):
        manifest=json.loads((P/'manifest-focus-branch-diagnostic.json').read_text())
        visible=json.loads((P/'manifest-visible-v2.json').read_text())
        sha=lambda name:hashlib.sha256((P/name).read_bytes()).hexdigest()
        self.assertTrue(manifest['diagnosticOnly'])
        self.assertEqual(manifest['overlay']['chrome/browser/ui/blanc_prototype_ui.cc'],sha('ui-focus-branch-diagnostic.cc'))
        self.assertEqual(manifest['baselineOverlaySha256'],sha('ui-candidate.cc'))
        self.assertEqual(manifest['assets'],visible['assets'])
    def test_fixture_fails_closed_without_diagnostic_receipt(self):
        fixture=(P/'browser-check-groups-branch-diagnostic.mjs').read_text()
        self.assertIn('receipt.diagnosticOnly!==true',fixture)
        self.assertIn('receipt.overlayManifestSha256!==sha(manifestPath)',fixture)
        self.assertIn('expected exactly one recognized diagnostic branch line',fixture)
        self.assertIn('DIAGNOSTIC-ONLY native output: never promote',fixture)
if __name__=='__main__': unittest.main()
