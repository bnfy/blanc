from pathlib import Path
import ast,types
p=Path(__file__).resolve().parent/'audit-focus-failed-recovery.py';tree=ast.parse(p.read_text());fn=next(x for x in tree.body if isinstance(x,ast.FunctionDef) and x.name=='quiet')
class OS:
 def __init__(self,alive=()):self.alive=set(alive);self.calls=[]
 def getpid(self):return 9000
 def kill(self,p,sig):self.calls.append(('pid',p,sig));assert sig==0;self._check(('pid',p))
 def killpg(self,p,sig):self.calls.append(('group',p,sig));assert sig==0;self._check(('group',p))
 def _check(self,k):
  if k not in self.alive:raise ProcessLookupError()
for rows,alive,allowed in [(' 15 1 15 S /bin/zsh\n',(),True),(' 100 1 15 S /bin/zsh\n',(),False),(' 15 1 200 S /bin/zsh\n',(),False),(' 15 1 15 S /usr/bin/siso\n',(),False),(' 15 1 15 S /bin/zsh\n',(('group',200),),False)]:
 o=OS(alive);env={'Path':Path,'os':o,'subprocess':types.SimpleNamespace(check_output=lambda *a,**k:rows)};exec(compile(ast.Module(body=[fn],type_ignores=[]),str(p),'exec'),env)
 try:env['quiet'](100,200);result=True
 except RuntimeError:result=False
 assert result==allowed
 assert all(call[2]==0 for call in o.calls)
print('PASS active owner/group/build refuses audit; process checks use signal 0 only')
