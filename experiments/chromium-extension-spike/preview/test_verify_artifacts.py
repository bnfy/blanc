import json
import pathlib
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from verify_artifacts import IDENTITY, ISSUER, sha256, verify

class ArtifactTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='blanc-artifacts-');self.root=pathlib.Path(self.tmp.name)
        self.source='a'*40;self.version='157.0.8103.15';self.stem='Blanc-Chromium-Preview-'+self.version+'-'+self.source[:8]
        self.zip=self.root/(self.stem+'-arm64.zip');self.zip.write_bytes(b'test archive')
        self.provenance={'_type':'https://in-toto.io/Statement/v1','predicateType':'https://slsa.dev/provenance/v1',
            'subject':[{'name':self.zip.name,'digest':{'sha256':sha256(self.zip)}}],
            'predicate':{'buildDefinition':{'externalParameters':{'sourceRevision':self.source}}}}
        self.save('.provenance.json',self.provenance)
        self.save('.cdx.json',{'bomFormat':'CycloneDX','metadata':{'component':{'version':self.version},'properties':[{'name':'blanc:source-revision','value':self.source}]}})
        self.save('.files.json',{'sourceRevision':self.source,'archiveSha256':sha256(self.zip)})
        (self.root/'SHA256SUMS.sigstore.json').write_text('test-only mocked verification bundle');self.checksums()
    def tearDown(self):self.tmp.cleanup()
    def save(self,suffix,value):(self.root/(self.stem+suffix)).write_text(json.dumps(value))
    def checksums(self):
        (self.root/'SHA256SUMS').write_text(''.join(sha256(p)+'  '+p.name+'\n' for p in sorted(self.root.iterdir()) if p.name.startswith(self.stem)))
    def check(self):return verify(self.root,self.version,self.source,'test-cosign')
    @patch('verify_artifacts.subprocess.run')
    def test_authenticates_pinned_identity_then_all_four_files(self,run):
        self.assertEqual(self.check()['authenticatedFiles'],4)
        args=run.call_args.args[0];self.assertIn(IDENTITY,args);self.assertIn(ISSUER,args);self.assertEqual(args[1],'verify-blob')
    @patch('verify_artifacts.subprocess.run')
    def test_tamper_fails_after_authentication(self,run):
        self.zip.write_bytes(b'changed')
        with self.assertRaises(ValueError):self.check()
        run.assert_called_once()
    @patch('verify_artifacts.subprocess.run')
    def test_no_fallback_on_signature_failure(self,run):
        run.side_effect=subprocess.CalledProcessError(1,['test-cosign'])
        with self.assertRaises(subprocess.CalledProcessError):self.check()
    @patch('verify_artifacts.subprocess.run')
    def test_missing_extra_and_duplicate_manifest_rejected(self,run):
        p=self.root/'SHA256SUMS';original=p.read_text()
        for value in [original.splitlines()[0]+'\n',original+original.splitlines()[0]+'\n',original+'0'*64+'  unexpected.zip\n']:
            p.write_text(value)
            with self.assertRaises(ValueError):self.check()
        run.assert_not_called()
    @patch('verify_artifacts.subprocess.run')
    def test_symlink_rejected(self,run):
        p=self.root/(self.stem+'.cdx.json');data=p.read_bytes();p.unlink();other=self.root.parent/(self.root.name+'-outside');other.write_bytes(data)
        try:
            p.symlink_to(other)
            with self.assertRaises(ValueError):self.check()
            run.assert_not_called()
        finally:other.unlink()
    @patch('verify_artifacts.subprocess.run')
    def test_wrong_source_binding_rejected(self,run):
        self.provenance['predicate']['buildDefinition']['externalParameters']['sourceRevision']='b'*40
        self.save('.provenance.json',self.provenance);self.checksums()
        with self.assertRaises(ValueError):self.check()
    @patch('verify_artifacts.subprocess.run')
    def test_wrong_subject_binding_rejected(self,run):
        self.provenance['subject'][0]['digest']['sha256']='0'*64
        self.save('.provenance.json',self.provenance);self.checksums()
        with self.assertRaises(ValueError):self.check()

if __name__=='__main__':unittest.main()
