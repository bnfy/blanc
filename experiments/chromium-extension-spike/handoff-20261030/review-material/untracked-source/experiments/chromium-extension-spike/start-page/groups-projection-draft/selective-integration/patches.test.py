import hashlib, importlib.util, json, subprocess, tempfile, unittest
from pathlib import Path
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('generate',HERE/'generate.py');g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
class Tests(unittest.TestCase):
 def test_exact_reconstruction_in_disposable_tree(self):
  manifest=json.loads((HERE/'manifest.json').read_text())
  with tempfile.TemporaryDirectory(prefix='blanc-groups-patch-') as temp:
   root=Path(temp)
   for name,(base,candidate,target,old_hash,new_hash) in g.CASES.items():
    entry=manifest['files'][name];patch=HERE/(name+'.patch')
    self.assertEqual(g.digest(base.read_bytes()),old_hash);self.assertEqual(g.digest(patch.read_bytes()),entry['patch_sha256'])
    dest=root/target;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(base.read_bytes())
    result=subprocess.run(['/usr/bin/patch','-p1','--fuzz=0','-i',str(patch)],cwd=root,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=10)
    self.assertEqual(result.returncode,0,(name,result.stderr.decode(errors='replace')))
    self.assertEqual(g.digest(dest.read_bytes()),new_hash);self.assertEqual(dest.read_bytes(),candidate.read_bytes())
 def test_manifest_and_patch_generation_are_deterministic(self):
  generated=g.patches();manifest=json.loads((HERE/'manifest.json').read_text())
  for name,(data,entry) in generated.items():self.assertEqual(data,(HERE/(name+'.patch')).read_bytes());self.assertEqual(entry,manifest['files'][name])
if __name__=='__main__':unittest.main()
