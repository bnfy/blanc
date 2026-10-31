import unittest
from unittest import mock
import handoff_guard as g
B={'left':22,'top':52,'width':1200,'height':996}
T={'pid':42,'layer':0,'alpha':1.0,'rect':(22,52,1200,996)}
class Tests(unittest.TestCase):
 def test_stack_clear_occluded_and_unknown(self):
  top={'pid':99,'layer':0,'alpha':1.0,'rect':(0,0,100,100)}
  self.assertEqual(g.classify_stack([top,T],42,B,[400,400])['status'],'point_clear')
  self.assertEqual(g.classify_stack([top,T],42,B,[60,150])['status'],'point_clear')
  self.assertEqual(g.classify_stack([dict(top,rect=(0,100,200,200)),T],42,B,[60,150])['status'],'point_obscured')
  self.assertEqual(g.classify_stack([dict(top,alpha=None),T],42,B,[400,400])['status'],'stack_incomplete')
  self.assertEqual(g.classify_stack([dict(top,alpha=0),T],42,B,[60,150])['status'],'point_clear')
 def test_no_duplicate_transparent_or_frame_click(self):
  self.assertEqual(g.classify_stack([T,T],42,B)['status'],'window_not_unique')
  self.assertEqual(g.classify_stack([dict(T,alpha=0.5)],42,B)['status'],'window_not_visible')
  self.assertEqual(g.classify_stack([T],42,B,[30,60])['status'],'point_outside_safe_region')
  self.assertEqual(g.classify_stack([T],42,B,[60,150],truncated=True)['status'],'stack_incomplete')
 def test_process_birth_mismatch_prevents_stack_access(self):
  data={'pid':42,'bounds':B,'mode':'point','birth':[1,2],'point':[400,400]}
  with mock.patch.object(g,'process_identity',return_value={'pid':42,'ppid':7,'birth':[1,3]}),mock.patch.object(g,'snapshot',side_effect=AssertionError('must not inspect')):
   self.assertEqual(g.run(data,7)['status'],'identity_unverified')
 def test_matching_birth_must_survive_snapshot(self):
  data={'pid':42,'bounds':B,'mode':'point','birth':[1,2],'point':[400,400]}
  before={'pid':42,'ppid':7,'birth':[1,2]};after={'pid':42,'ppid':7,'birth':[1,3]}
  with mock.patch.object(g,'process_identity',side_effect=[before,after]),mock.patch.object(g,'snapshot',return_value={'status':'point_clear','owned_matches':1,'obscurers':0}),mock.patch.object(g,'frontmost_is_pid',return_value={'status':'ok','matches':True}):
   out=g.run(data,7);self.assertEqual(out['status'],'identity_unverified');self.assertNotIn('birth',out)
 def test_bsd_layout_is_expected_size(self):
  import ctypes;self.assertEqual(ctypes.sizeof(g.BSDInfo),136)
if __name__=='__main__':unittest.main()
