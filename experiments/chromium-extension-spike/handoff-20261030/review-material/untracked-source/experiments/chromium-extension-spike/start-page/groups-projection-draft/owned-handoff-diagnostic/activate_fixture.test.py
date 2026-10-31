import unittest
from activate_fixture import perform
B=dict(left=22,top=52,width=1200,height=996)
G={'status':'ok','owned_count':1,'eligible_count':1,'unreadable_count':0,'matching_count':1,'list_truncated':False}
def yes(_):return {'status':'ok','matches':True}
def no(_):return {'status':'ok','matches':False}
class Tests(unittest.TestCase):
 def invoke(self,**kw):return perform(42,B,parent=7,query_parent=lambda _:7,cg=lambda *_:G,**kw)
 def test_wrong_parent_never_calls_window_or_activation(self):
  r=perform(42,B,parent=7,query_parent=lambda _:8,cg=lambda *_:self.fail('CG queried'),activate=lambda *_:self.fail('activation'))
  self.assertEqual(r['status'],'ownership_unverified')
 def test_ambiguous_owned_cg_never_activates(self):
  bad=dict(G,owned_count=2)
  r=perform(42,B,parent=7,query_parent=lambda _:7,cg=lambda *_:bad,activate=lambda *_:self.fail('activation'))
  self.assertEqual(r['status'],'window_identity_unverified')
 def test_already_frontmost_does_not_activate(self):
  r=self.invoke(front=yes,activate=lambda *_:self.fail('activation'))
  self.assertEqual((r['status'],r['frontmost_before'],r['frontmost_after'],r['activation_requested']),('already_frontmost',True,True,False))
 def test_activation_requires_confirmed_frontmost(self):
  states=iter([False,False,True]);front=lambda _:{'status':'ok','matches':next(states)}
  r=self.invoke(front=front,activate=lambda _,owned:owned(),sleep=lambda _:None,now=lambda:0)
  self.assertEqual((r['status'],r['frontmost_before'],r['activation_accepted'],r['frontmost_after']),('activated',False,True,True))
 def test_probe_reads_state_without_activation(self):
  r=self.invoke(mode='probe',front=no,activate=lambda *_:self.fail('activation'))
  self.assertEqual((r['status'],r['frontmost_after'],r['activation_requested']),('observed',False,False))
 def test_rejected_activation_fails_closed(self):
  r=self.invoke(front=no,activate=lambda *_:False)
  self.assertEqual((r['status'],r['activation_accepted'],r['frontmost_after']),('activation_request_failed',False,None))
 def test_owner_lost_before_request_fails_closed(self):
  checks=iter([7,8]);r=perform(42,B,parent=7,query_parent=lambda _:next(checks),cg=lambda *_:G,front=no,activate=lambda *_:self.fail('activation'))
  self.assertEqual(r['status'],'ownership_unverified')
 def test_request_without_foreground_success_fails_closed(self):
  ticks=iter([0,1,2,4]);r=self.invoke(front=no,activate=lambda *_:True,sleep=lambda _:None,now=lambda:next(ticks))
  self.assertEqual((r['status'],r['frontmost_after']),('activation_not_observed',False))
if __name__=='__main__':unittest.main()
