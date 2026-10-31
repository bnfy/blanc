import hashlib, importlib.util, os, pathlib, tempfile, time, unittest
p=pathlib.Path(__file__).with_name('stage-clone-transaction.py')
s=importlib.util.spec_from_file_location('txn',p); t=importlib.util.module_from_spec(s);s.loader.exec_module(t)
def h(s): return hashlib.sha256(s).hexdigest()
class Transaction(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory(); self.p=pathlib.Path(self.tmp.name);self.root=self.p/'src';self.root.mkdir();(self.root/'d').mkdir();self.j=self.p/'journal'
  self.before=b'old';self.after=b'new';self.mod=b'module';(self.root/'d/a').write_bytes(self.before)
  self.spec={'d/a':(h(self.before),h(self.after)),'d/b':(None,h(self.mod))};self.c={'d/a':self.after,'d/b':self.mod}
 def tearDown(self):self.tmp.cleanup()
 def test_stage_and_backup(self):
  t.stage(self.root,self.j,self.spec,self.c);self.assertEqual((self.root/'d/a').read_bytes(),self.after);self.assertEqual((self.root/'d/b').read_bytes(),self.mod)
  self.assertEqual((self.j/'backup-00').read_bytes(),self.before);self.assertNotEqual((self.j/'backup-00').stat().st_ino,(self.root/'d/a').stat().st_ino)
 def test_preexisting_module_refused(self):
  (self.root/'d/b').write_bytes(b'other')
  with self.assertRaises(ValueError):t.stage(self.root,self.j,self.spec,self.c)
  self.assertEqual((self.root/'d/a').read_bytes(),self.before)
 def test_wrong_candidate_refused(self):
  self.c['d/b']=b'foreign'
  with self.assertRaises(ValueError):t.stage(self.root,self.j,self.spec,self.c)
  self.assertEqual((self.root/'d/a').read_bytes(),self.before)
 def test_preexisting_temp_symlink_refused_without_following(self):
  victim=self.p/'victim';victim.write_bytes(b'untouched')
  (self.root/'d'/('.blanc-stage-00-%d'%os.getpid())).symlink_to(victim)
  with self.assertRaises(FileExistsError):t.stage(self.root,self.j,self.spec,self.c)
  self.assertEqual(victim.read_bytes(),b'untouched')
  self.assertEqual((self.root/'d/a').read_bytes(),self.before)
 def test_replacement_preserves_file_mode(self):
  (self.root/'d/a').chmod(0o640);t.stage(self.root,self.j,self.spec,self.c)
  self.assertEqual((self.root/'d/a').stat().st_mode & 0o777,0o640)
 def test_rollback_is_not_implemented(self):
  self.assertFalse(hasattr(t,'rollback'))
 def test_symlink_ancestor_refused(self):
  (self.root/'d/a').unlink();(self.root/'d').rmdir();(self.root/'d').symlink_to(self.p)
  with self.assertRaises(ValueError):t.stage(self.root,self.j,self.spec,self.c)
 def test_cache_floor_rejects_future_output(self):
  p=self.root/'out/BlancPrototype';p.mkdir(parents=True);f=p/'obj';f.write_bytes(b'output')
  future=time.time_ns()+10**10;os.utime(f,ns=(future,future))
  with self.assertRaises(ValueError):t.cache_floor(self.root)
 def test_replacement_is_newer_than_cached_output(self):
  p=self.root/'out/BlancPrototype';p.mkdir(parents=True);f=p/'obj';f.write_bytes(b'output')
  past=time.time_ns()-10**9;os.utime(f,ns=(past,past));floor=t.cache_floor(self.root)
  t.stage(self.root,self.j,self.spec,self.c,floor);self.assertGreater((self.root/'d/a').stat().st_mtime_ns,floor)
if __name__=='__main__':unittest.main()
