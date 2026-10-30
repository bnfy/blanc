import importlib.util,os,pathlib,tempfile,unittest
H=pathlib.Path(__file__).parent;s=importlib.util.spec_from_file_location('core',H/'clone-fixture-core.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Tests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory(dir=H);self.p=pathlib.Path(self.tmp.name);self.src=self.p/'src';self.dst=self.p/'dst';self.db=self.p/'journal';self.src.mkdir();(self.src/'.fixture-only').write_text('fixture');(self.src/'sub').mkdir();(self.src/'sub/file').write_text('original');os.symlink('sub/file',self.src/'link')
 def tearDown(self):self.tmp.cleanup()
 def test_interrupt_resume_and_cow(self):
  with self.assertRaisesRegex(RuntimeError,'interruption'):m.run(self.src,self.dst,self.db,fail_after=2)
  self.assertEqual(m.run(self.src,self.dst,self.db),4);self.assertTrue((self.dst/'link').is_symlink());(self.dst/'sub/file').write_text('changed');self.assertEqual((self.src/'sub/file').read_text(),'original')
 def test_source_drift_aborts_resume(self):
  with self.assertRaises(RuntimeError):m.run(self.src,self.dst,self.db,fail_after=2)
  (self.src/'sub/file').write_text('changed')
  with self.assertRaisesRegex(ValueError,'source drift'):m.run(self.src,self.dst,self.db)
 def test_unsafe_symlink_and_unmarked_rejected(self):
  os.symlink('/tmp',self.src/'escape')
  with self.assertRaisesRegex(ValueError,'external'):m.run(self.src,self.dst,self.db)
  (self.src/'escape').unlink();(self.src/'.fixture-only').unlink()
  with self.assertRaisesRegex(ValueError,'marker'):m.run(self.src,self.dst,self.db)
 def test_preexisting_target_not_overwritten(self):
  self.dst.mkdir();(self.dst/'other').write_text('keep')
  with self.assertRaisesRegex(ValueError,'unowned'):m.run(self.src,self.dst,self.db)
  self.assertEqual((self.dst/'other').read_text(),'keep')
 def test_journal_cannot_be_reused_for_another_destination(self):
  with self.assertRaises(RuntimeError):m.run(self.src,self.dst,self.db,fail_after=1)
  other=self.p/'other';other.mkdir()
  with self.assertRaisesRegex(ValueError,'identity mismatch'):m.run(self.src,other,self.db)
 def test_unexpected_destination_file_rejected(self):
  with self.assertRaises(RuntimeError):m.run(self.src,self.dst,self.db,fail_after=1)
  (self.dst/'unexpected').write_text('keep')
  with self.assertRaisesRegex(ValueError,'inventory drift'):m.run(self.src,self.dst,self.db)
  self.assertEqual((self.dst/'unexpected').read_text(),'keep')
 def test_symlink_journal_rejected_before_write(self):
  target=self.p/'sentinel';target.write_text('keep');os.symlink(target,self.db)
  with self.assertRaisesRegex(ValueError,'unsafe'):m.run(self.src,self.dst,self.db)
  self.assertEqual(target.read_text(),'keep')
 def test_special_file_rejected(self):
  os.mkfifo(self.src/'pipe')
  with self.assertRaisesRegex(ValueError,'special'):m.run(self.src,self.dst,self.db)
if __name__=='__main__':unittest.main()
