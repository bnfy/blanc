import importlib.util,pathlib,unittest
p=pathlib.Path(__file__).with_name('capture-quiescence.py')
s=importlib.util.spec_from_file_location('quiescence',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class ProcessDetection(unittest.TestCase):
 def test_matches_realistic_writer_commands(self):
  writers=['siso ninja -n chrome','/path/siso ninja -C out','ninja -C out chrome','/path/autoninja -C out','/path/gn --root=../.. gen .','/bin/cp -cRp source target',"/bin/sh -c 'siso ninja -n chrome'",'python3 /path/verify-one-shot-copy-v2.py','/path/clang++ -c input.cc','/path/clang -c input.c','/path/ld64.lld -o output']
  for cmd in writers:
   with self.subTest(cmd=cmd):self.assertTrue(m.is_writer_command(cmd))
 def test_does_not_match_related_names(self):
  for cmd in ['/Applications/Blanc.app/Contents/MacOS/Blanc','/usr/bin/sync','python3 shopping.py','siso-helper --test','/path/gnome-shell','/usr/bin/grep clang']:
   with self.subTest(cmd=cmd):
    # clang as a distinct argument is deliberately conservative.
    if cmd=='/usr/bin/grep clang':self.assertTrue(m.is_writer_command(cmd))
    else:self.assertFalse(m.is_writer_command(cmd))
 def test_parse_snapshot_and_skip_self(self):
  self.assertFalse(m.contains_writer('  42 python3 capture-quiescence.py\n  43 /Applications/Blanc.app/Contents/MacOS/Blanc\n',42))
  self.assertTrue(m.contains_writer('  42 python3 capture-quiescence.py\n  123 /path/siso ninja -C out\n',42))
  self.assertTrue(m.contains_writer('  42 python3 capture-quiescence.py\n  123 /bin/sh -c \'gn gen out\'\n',42))
if __name__=='__main__':unittest.main()
