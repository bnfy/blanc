import importlib.util, json, pathlib, unittest
H=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('pinned',H/'syntax-check-combined-pinned.py'); m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Pinning(unittest.TestCase):
 def setUp(self): self.raw=(H.parent/'syntax-command.json').read_bytes()
 def test_exact(self): self.assertTrue(m.validate_command(self.raw)['argv'])
 def test_command_and_forwarded_flag_tampering(self):
  for suffix in (['-Xclang','-load','-Xclang','evil.dylib'],['@/tmp/evil.rsp'],['-o/tmp/evil'],['-MF/tmp/evil']):
   d=json.loads(self.raw);d['argv'][-1:-1]=suffix
   with self.subTest(suffix=suffix),self.assertRaisesRegex(ValueError,'drift'):m.validate_command(json.dumps(d).encode())
 def test_metadata_tamper(self):
  d=json.loads(self.raw);d['cwd']='/tmp'
  with self.assertRaisesRegex(ValueError,'drift'):m.validate_command(json.dumps(d).encode())
 def test_recorded_input_identities(self):
  prior=json.loads((H/'syntax-combined-20261029-v2/result.json').read_text())
  self.assertEqual(m.COMPILER_SHA,prior['compilerSha256']);self.assertEqual(m.INCLUDE_SHA,prior['directIncludesSha256']);self.assertEqual(m.PCM_SHA,prior['pcmSha256'])
if __name__=='__main__':unittest.main()
