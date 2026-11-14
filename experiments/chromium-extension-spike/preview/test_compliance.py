import json
import pathlib
import tempfile
import unittest
from compliance import FONTS, digest, render_credits, validate, validate_renderer, write_json

class ComplianceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='blanc-compliance-')
        self.root = pathlib.Path(self.tmp.name)
        self.payload, self.assets, self.blocker = [self.root / n for n in ['payload', 'assets', 'blocker']]
        for p in [self.payload / 'licenses', self.assets / 'pages', self.blocker]:
            p.mkdir(parents=True)
        names = ['LICENSE', 'ASSET-LICENSE.md', 'LICENSE.chromium', 'chromium-credits.html',
                 'chromium.spdx.json', 'source-materials.json', 'THIRD-PARTY-NOTICES.txt']
        names += ['licenses/' + x[2] for x in FONTS.values()]
        for name in names:
            (self.payload / name).write_text('fixture ' + name)
        self.spdx = {'packages': [{'name': 'Chromium', 'licenseConcluded': 'LicenseRef-Test'}],
                     'hasExtractedLicensingInfos': [{'licenseId': 'LicenseRef-Test',
                                                    'extractedText': 'Copyright and full license terms'}]}
        write_json(self.payload / 'chromium.spdx.json', self.spdx)
        (self.payload / 'chromium-credits.html').write_text(render_credits(self.spdx))
        write_json(self.payload / 'runtime-sbom.cdx.json', {'bomFormat': 'CycloneDX', 'specVersion': '1.6',
            'metadata': {'component': {'version': '157.0.8103.15'}}, 'components': [{'name': 'fixture'}]})
        for _, filename, _ in FONTS.values():
            (self.assets / 'pages' / filename).write_bytes(filename.encode())
        (self.blocker / 'engine.js').write_text('fixture engine')
        self.manifest = {'version': '157.0.8103.15', 'sourceRevision': 'a' * 40, 'componentCount': 1,
            'files': {p.relative_to(self.payload).as_posix(): digest(p) for p in self.payload.rglob('*') if p.is_file()},
            'fontInputs': {x[1]: digest(self.assets / 'pages' / x[1]) for x in FONTS.values()},
            'blockerInput': digest(self.blocker / 'engine.js')}
        self.save()
    def tearDown(self): self.tmp.cleanup()
    def save(self): write_json(self.payload / 'manifest.json', self.manifest)
    def check(self, version='157.0.8103.15', revision='a' * 40):
        return validate(self.payload, self.assets, self.blocker, version, revision)
    def test_complete_payload(self): self.assertEqual(self.check()['componentCount'], 1)
    def test_other_version_and_revision_rejected(self):
        for args in [('157.0.8103.6', 'a' * 40), ('157.0.8103.15', 'b' * 40)]:
            with self.assertRaises(ValueError): self.check(*args)
    def test_changed_font_rejected(self):
        (self.assets / 'pages' / next(iter(FONTS.values()))[1]).write_bytes(b'changed')
        with self.assertRaises(ValueError): self.check()
    def test_changed_blocker_rejected(self):
        (self.blocker / 'engine.js').write_bytes(b'changed')
        with self.assertRaises(ValueError): self.check()
    def test_missing_notice_cannot_be_removed_from_manifest(self):
        (self.payload / 'LICENSE').unlink(); del self.manifest['files']['LICENSE']; self.save()
        with self.assertRaises(ValueError): self.check()
    def test_modified_notice_rejected(self):
        (self.payload / 'LICENSE').write_bytes(b'changed')
        with self.assertRaises(ValueError): self.check()
    def test_unexpected_file_and_symlink_rejected(self):
        p=self.payload / 'unexpected'; p.write_text('unexpected')
        with self.assertRaises(ValueError): self.check()
        p.unlink(); p.symlink_to(self.payload / 'LICENSE')
        with self.assertRaises(ValueError): self.check()
    def test_missing_font_inventory_rejected(self):
        self.manifest['fontInputs'].pop(next(iter(self.manifest['fontInputs']))); self.save()
        with self.assertRaises(ValueError): self.check()
    def test_parent_path_rejected(self):
        self.manifest['files']['../outside']='0' * 64; self.save()
        with self.assertRaises(ValueError): self.check()
    def test_placeholder_credits_rejected_even_with_matching_hash(self):
        (self.payload / 'chromium-credits.html').write_text('This is sample credits page.')
        self.manifest['files']['chromium-credits.html'] = digest(self.payload / 'chromium-credits.html')
        self.save()
        with self.assertRaises(ValueError): self.check()
    def test_missing_full_license_rejected(self):
        self.spdx['hasExtractedLicensingInfos'][0]['extractedText'] = ''
        with self.assertRaises(ValueError): render_credits(self.spdx)
    def test_credit_text_is_escaped(self):
        self.spdx['packages'][0]['name'] = '<script>package</script>'
        self.spdx['hasExtractedLicensingInfos'][0]['extractedText'] = '<img src=x onerror=alert(1)>'
        rendered = render_credits(self.spdx)
        self.assertIn('&lt;script&gt;package&lt;/script&gt;', rendered)
        self.assertIn('&lt;img src=x onerror=alert(1)&gt;', rendered)
        self.assertNotIn('<script>', rendered)

if __name__ == '__main__': unittest.main()

class RendererProvenanceTests(unittest.TestCase):
    def test_renderer_and_native_header_must_match(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            (root / 'procedural.js').write_text('isolated renderer')
            write_json(root / 'manifest.json', {'proceduralRenderer': {'bundleSha256': digest(root / 'procedural.js')}})
            header = root / 'chrome/services/blanc_blocker/procedural_renderer.h'
            header.parent.mkdir(parents=True)
            header.write_text('inline constexpr char kBlancProceduralRenderer[] = '+json.dumps('isolated renderer')+';\n')
            self.assertEqual(validate_renderer(root, root), digest(root / 'procedural.js'))
            header.write_text('inline constexpr char kBlancProceduralRenderer[] = "stale";\n')
            with self.assertRaisesRegex(ValueError, 'Native procedural'):
                validate_renderer(root, root)
            (root / 'procedural.js').write_text('changed')
            with self.assertRaisesRegex(ValueError, 'differs from manifest'):
                validate_renderer(root)
