import importlib.util,json,os,pathlib,tempfile,unittest
H=pathlib.Path(__file__).parent;spec=importlib.util.spec_from_file_location('treatment',H/'remove-cloned-siso-logs.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Tests(unittest.TestCase):
 def setUp(self):
  self.t=tempfile.TemporaryDirectory(dir=H);self.p=pathlib.Path(self.t.name);self.out=self.p/'output';self.out.mkdir();self.journal=self.p/'journal';self.fd=os.open(self.out,os.O_RDONLY|os.O_DIRECTORY)
  for name,target in m.EXPECTED.items():os.symlink(target,self.out/name)
  (self.out/'keep').write_text('untouched')
 def tearDown(self):os.close(self.fd);self.t.cleanup()
 def test_only_links_removed_and_journaled(self):
  with self.journal.open('x') as f:m.apply(self.fd,f,m.EXPECTED)
  self.assertEqual(os.listdir(self.out),['keep']);self.assertEqual((self.out/'keep').read_text(),'untouched')
  rows=[json.loads(x) for x in self.journal.read_text().splitlines()];self.assertEqual(rows[-1]['count'],11);self.assertEqual(len([x for x in rows if x['event']=='unlinked']),11)
 def test_wrong_target_stops_before_deletion(self):
  name=next(iter(m.EXPECTED));(self.out/name).unlink();os.symlink('/tmp/unexpected',self.out/name)
  with self.journal.open('x') as f:
   with self.assertRaisesRegex(ValueError,'target changed'):m.apply(self.fd,f,m.EXPECTED)
  self.assertEqual(len(list(self.out.iterdir())),12)
 def test_extra_log_name_stops_before_deletion(self):
  os.symlink('/tmp/other',self.out/'siso.88.INFO')
  with self.journal.open('x') as f:
   with self.assertRaisesRegex(ValueError,'names changed'):m.apply(self.fd,f,m.EXPECTED)
  self.assertEqual(len(list(self.out.iterdir())),13)
 def test_replaced_link_is_not_unlinked(self):
  old=m.append;name=sorted(m.EXPECTED)[0]
  def hooked(f,row):
   old(f,row)
   if row['event']=='pending_unlink' and row['name']==name:
    (self.out/name).unlink();(self.out/name).write_text('protected')
  m.append=hooked
  try:
   with self.journal.open('x') as f:
    with self.assertRaisesRegex(ValueError,'changed before unlink'):m.apply(self.fd,f,m.EXPECTED)
   self.assertEqual((self.out/name).read_text(),'protected')
  finally:m.append=old
 def test_process_guard_recognizes_actual_and_alternate_writers(self):
  for command in ('../../buildtools/mac/gn --root=../.. -q --regeneration gen .','/opt/siso --offline ninja -C output','/bin/cp -cRp -n source target','python3 verify-one-shot-copy-v2.py','/opt/autoninja -C out target'):
   with self.subTest(command=command):self.assertTrue(m.is_writer_command(command))
  for command in ('/usr/bin/python3 some_engine.py','/opt/design-tool --mode=running','/usr/bin/echo singer'):
   with self.subTest(command=command):self.assertFalse(m.is_writer_command(command))
 def test_directory_open_refuses_symlink(self):
  link=self.p/'link';os.symlink(self.out,link)
  with self.assertRaises(OSError):m.open_directory(link)
if __name__=='__main__':unittest.main()
