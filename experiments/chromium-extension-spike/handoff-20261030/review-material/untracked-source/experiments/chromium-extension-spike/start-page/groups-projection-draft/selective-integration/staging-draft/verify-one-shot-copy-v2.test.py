import ctypes,importlib.util,os,pathlib,subprocess,tempfile,unittest
H=pathlib.Path(__file__).parent;spec=importlib.util.spec_from_file_location('verify',H/'verify-one-shot-copy-v2.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Tests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory(dir=H);self.p=pathlib.Path(self.tmp.name);self.src=self.p/'src';self.dst=self.p/'dst';self.src.mkdir();(self.src/'sub').mkdir();(self.src/'sub/a').write_text('abc');os.symlink('sub/a',self.src/'link');subprocess.run(['/bin/cp','-cRp',str(self.src),str(self.dst)],check=True)
 def tearDown(self):self.tmp.cleanup()
 def test_valid(self):self.assertEqual(m.verify(self.src,self.dst)['status'],'passed')
 def test_content_mismatch(self):
  p=self.dst/'sub/a';t=p.stat().st_mtime_ns;p.write_text('abd');os.utime(p,ns=(t,t))
  with self.assertRaisesRegex(ValueError,'content mismatch'):m.verify(self.src,self.dst)
 def test_hardlink_to_source_rejected(self):
  p=self.dst/'sub/a';p.unlink();os.link(self.src/'sub/a',p);t=(self.src/'sub').stat().st_mtime_ns;os.utime(self.dst/'sub',ns=(t,t))
  with self.assertRaisesRegex(ValueError,'inode isolation'):m.verify(self.src,self.dst)
 def test_extra_entry_rejected(self):
  (self.dst/'extra').write_text('x')
  with self.assertRaises(ValueError):m.verify(self.src,self.dst)
 def test_symlink_change_rejected(self):
  p=self.dst/'link';p.unlink();p.symlink_to('/tmp')
  with self.assertRaises(ValueError):m.verify(self.src,self.dst)
 def test_mode_mismatch(self):
  os.chmod(self.dst/'sub/a',0o600)
  with self.assertRaisesRegex(ValueError,'metadata mismatch'):m.verify(self.src,self.dst)
 def test_xattr_mismatch_rejected(self):
  fn=m.lib.setxattr;fn.argtypes=[ctypes.c_char_p,ctypes.c_char_p,ctypes.c_void_p,ctypes.c_size_t,ctypes.c_uint32,ctypes.c_int];fn.restype=ctypes.c_int
  value=ctypes.create_string_buffer(b'value');path=os.fsencode(self.dst/'sub/a')
  if fn(path,b'com.blanc.fixture',value,5,0,0):raise OSError(ctypes.get_errno(),os.strerror(ctypes.get_errno()))
  with self.assertRaisesRegex(ValueError,'xattr mismatch'):m.verify(self.src,self.dst)
 def test_copy_receipt_schema_and_live_pid(self):
  names=['.cipd','.gclient','.gclient_entries','.gclient_previous_sync_commits','.gcs_entries','depot_tools','src']
  r={'status':'copied-unverified','exitCode':0,'lowSpaceStopped':False,'source':str(self.src),'destination':str(self.dst),'entries':names,'pid':os.getpid(),'command':['/bin/cp','-cRp','-n',*[str(self.src/n) for n in names],str(self.dst)]}
  with self.assertRaisesRegex(ValueError,'still exists'):m.validate_copy_info(r,self.src,self.dst,names)
  original=m.copy_process_exited;m.copy_process_exited=lambda pid:None
  try:
   m.validate_copy_info(r,self.src,self.dst,names)
   for key,val in [('status','completed'),('exitCode',1),('lowSpaceStopped',True),('command',[])]:
    wrong=r.copy();wrong[key]=val
    with self.subTest(key=key),self.assertRaises(ValueError):m.validate_copy_info(wrong,self.src,self.dst,names)
  finally:m.copy_process_exited=original
 def test_entry_subset_excludes_records(self):
  (self.src/'records').mkdir();(self.src/'records'/'only-source').write_text('x')
  q=m.verify(self.src,self.dst,['sub','link']);self.assertEqual(q['included_entries'],['link','sub'])
  (self.dst/'unexpected').write_text('x')
  with self.assertRaisesRegex(ValueError,'top-level entries'):m.verify(self.src,self.dst,['sub','link'])
 def test_tracked_allowance_and_all_other_flags(self):
  from types import SimpleNamespace
  import stat
  def f(flags,mode=stat.S_IFREG|0o644):return SimpleNamespace(st_mode=mode,st_uid=1,st_gid=1,st_flags=flags,st_mtime_ns=42)
  self.assertTrue(m.tracked_only_loss(f(0x40),f(0)))
  self.assertTrue(m.tracked_only_loss(f(0x42),f(0x02)))
  for a,b in [(f(0x40),f(0x02)),(f(0),f(0x40)),(f(0x40),f(0x20)),(f(0x40,stat.S_IFDIR|0o755),f(0,stat.S_IFDIR|0o755)),(f(0x40,stat.S_IFLNK|0o777),f(0,stat.S_IFLNK|0o777))]:
   self.assertFalse(m.tracked_only_loss(a,b))
  self.assertNotEqual(m.metadata(f(0x40)),m.metadata(f(0))) # raw per-tree stability remains strict
 def test_external_link_reported(self):
  os.symlink('/tmp',self.src/'outer');os.symlink('/tmp',self.dst/'outer');t=(self.src/'outer').lstat().st_mtime_ns;os.utime(self.dst/'outer',ns=(t,t),follow_symlinks=False);t=self.src.stat().st_mtime_ns;os.utime(self.dst,ns=(t,t))
  q=m.verify(self.src,self.dst);self.assertEqual(q['external_links_pending_review'],[{'path':'outer','target':'/tmp'}])
if __name__=='__main__':unittest.main()
