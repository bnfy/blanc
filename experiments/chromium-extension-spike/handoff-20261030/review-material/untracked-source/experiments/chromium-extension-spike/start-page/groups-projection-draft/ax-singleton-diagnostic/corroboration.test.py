import unittest
from corroboration import summarize_owned
class Tests(unittest.TestCase):
 def test_empty_distinct_and_incomplete(self):
  b=dict(left=22,top=52,width=1200,height=996)
  result=summarize_owned([],b);self.assertEqual((result['owned_count'],result['matching_count']), (0,0))
  result=summarize_owned([(0,(22,52,1200,996)),(0,(900,52,1200,996)),(3,None),(None,None),(0,None)],b)
  self.assertEqual((result['owned_count'],result['eligible_count'],result['unreadable_count'],result['matching_count']),(5,2,2,1))
 def test_truncation_is_preserved(self):
  r=summarize_owned([(0,(1,2,3,4))]*51,dict(left=1,top=2,width=3,height=4))
  self.assertEqual((r['owned_count'],r['matching_count'],r['list_truncated']),(50,50,True))
if __name__=='__main__':unittest.main()
