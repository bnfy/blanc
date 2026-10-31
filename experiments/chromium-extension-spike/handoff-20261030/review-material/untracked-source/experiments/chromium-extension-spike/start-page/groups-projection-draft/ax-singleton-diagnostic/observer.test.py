import contextlib, ctypes, importlib.util, io, json, pathlib, sys, unittest
from unittest import mock
sys.path.insert(0,str(pathlib.Path(__file__).parent))
p=pathlib.Path(__file__).with_name('observer.py')
spec=importlib.util.spec_from_file_location('observer',p); m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Tests(unittest.TestCase):
 def test_matching_is_unique_and_tolerant(self):
  bounds=dict(left=10,top=20,width=400,height=300)
  self.assertEqual(m.match_rects([(11,21,400,301),(90,20,400,300),None],bounds),[0])
  self.assertEqual(m.match_rects([(10,20,400,300),(10,20,400,300)],bounds),[0,1])
  self.assertEqual(m.match_rects([],dict(bounds,left=float('nan'))),[])
  self.assertEqual(m.match_rects([(10,20,400,300)],dict(bounds,private='x')),[])
 def test_no_trust_never_looks_up_a_process(self):
  output=io.StringIO()
  with mock.patch.object(m,'bind',return_value={'trusted':lambda:False}),mock.patch.object(m,'parent_of',side_effect=AssertionError()),contextlib.redirect_stdout(output):
   self.assertEqual(m.run(),2)
  self.assertEqual(json.loads(output.getvalue()),{'event':'unavailable','reason':'accessibility_not_trusted'})
 def test_unowned_pid_never_opens_ax_element(self):
  output=io.StringIO(); request=io.StringIO(json.dumps({'pid':123,'bounds':dict(left=1,top=2,width=3,height=4)})+'\n')
  with mock.patch.object(m,'bind',return_value={'trusted':lambda:True,'app':mock.Mock(side_effect=AssertionError())}),mock.patch.object(m,'parent_of',return_value=-1),mock.patch.object(sys,'stdin',request),mock.patch.object(sys,'argv',['observer','--observe']),contextlib.redirect_stdout(output):
   self.assertEqual(m.run(),2)
  self.assertEqual(json.loads(output.getvalue())['reason'],'unowned_process')
 def test_ownership_query_failure_is_explicit_without_process_contents(self):
  output=io.StringIO();request=io.StringIO(json.dumps({'pid':123,'bounds':dict(left=1,top=2,width=3,height=4)})+'\n')
  with mock.patch.object(m,'bind',return_value={'trusted':lambda:True}),mock.patch.object(m,'parent_of',side_effect=PermissionError('SECRET')),mock.patch.object(sys,'stdin',request),mock.patch.object(sys,'argv',['observer','--observe']),contextlib.redirect_stdout(output):
   self.assertEqual(m.run(),2)
  self.assertEqual(json.loads(output.getvalue()),{'event':'unavailable','reason':'ownership_query_failed'})
 def test_synthetic_window_geometry_cases(self):
  for mode in ('unique','ambiguous','empty','mismatch','unreadable'):
   duplicate=mode=='ambiguous'
   values={10:{'AXWindows':30,'AXFocusedWindow':20},11:{'AXFocusedApplication':10},20:{'AXPosition':40,'AXSize':41,'AXMinimized':42},21:{'AXPosition':40,'AXSize':41,'AXMinimized':42}}
   keys={}; sequence=[200]
   def string(_,name,encoding): sequence[0]+=1;keys[sequence[0]]=name.decode();return sequence[0]
   def copy(element,key,out):
    value=values.get(element,{}).get(keys[key]);
    if mode=='unreadable' and keys[key]=='AXPosition':return -25204
    if not value:return -1
    ctypes.cast(out,ctypes.POINTER(ctypes.c_void_p))[0]=value;return 0
   def getvalue(ref,kind,out):
    point=ctypes.cast(out,ctypes.POINTER(m.Pair));point[0]=m.Pair(*( (200,2) if ref==40 and mode=='mismatch' else (1,2) if ref==40 else (300,400) ));return True
   api={'trusted':lambda:True,'app':lambda pid:10,'system':lambda:11,'timeout':lambda *a:0,'string':string,'copy':copy,'release':lambda *a:None,'equal':lambda x,y:x==y,'type':lambda v:1 if v==30 else 2 if v in (40,41) else 3,'arrayid':lambda:1,'vtypeid':lambda:2,'boolid':lambda:3,'stringid':lambda:4,'count':lambda x:0 if mode=='empty' else 2 if duplicate else 1,'item':lambda x,i:20+i,'vtype':lambda v:1 if v==40 else 2,'value':getvalue,'bool':lambda v:False}
   request=io.StringIO(json.dumps({'pid':123,'bounds':dict(left=1,top=2,width=300,height=400)})+'\nstop\n');output=io.StringIO()
   with mock.patch.object(m,'frontmost_is_pid',return_value={'status':'ok','matches':True}),mock.patch.object(m,'owned_cg_counts',return_value={'status':'ok','owned_count':1,'matching_count':1,'list_truncated':False}),mock.patch.object(m,'bind',return_value=api),mock.patch.object(m,'parent_of',return_value=m.os.getppid()),mock.patch.object(m.select,'select',return_value=([request],[],[])),mock.patch.object(sys,'stdin',request),mock.patch.object(sys,'argv',['observer','--observe']),contextlib.redirect_stdout(output):
    self.assertEqual(m.run(),0 if mode=='unique' else 2)
   lines=[json.loads(x) for x in output.getvalue().splitlines()];sample=lines[0];geo=sample['geometry']
   self.assertEqual(geo['expected'],[1,2,300,400]);self.assertEqual(geo['window_count'],0 if mode=='empty' else 2 if duplicate else 1)
   self.assertEqual(sample['window_match'],'unique' if mode=='unique' else 'ambiguous' if duplicate else 'none')
   if mode=='unique':self.assertTrue(sample['app_frontmost'] and sample['window_focused']);self.assertFalse(sample['minimized'])
   elif duplicate:self.assertEqual(lines[1]['reason'],'window_ambiguous')
   else:self.assertEqual(lines[1]['reason'],'window_not_found')
   if mode=='mismatch':self.assertEqual(geo['windows'][0]['rect'],[200,2,300,400])
   if mode=='unreadable':self.assertEqual(geo['singleton']['focused_window_equal'],True);self.assertEqual(geo['singleton']['minimized'],False);self.assertEqual(geo['singleton']['minimized_status'],'ok');self.assertEqual(geo['cg']['matching_count'],1)
   if mode=='unreadable':self.assertEqual(geo['windows'][0]['position_status'],'cannot_complete');self.assertIsNone(geo['windows'][0]['rect'])
if __name__=='__main__':unittest.main()
