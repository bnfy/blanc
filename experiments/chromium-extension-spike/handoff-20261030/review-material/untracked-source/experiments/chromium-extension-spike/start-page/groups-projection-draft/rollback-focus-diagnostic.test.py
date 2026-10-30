from pathlib import Path
import ast
p=Path(__file__).resolve().parent/'stage-focus-branch-diagnostic.py'
tree=ast.parse(p.read_text());f=next(x for x in tree.body if isinstance(x,ast.FunctionDef) and x.name=='rollback_if_safe')
for reason in ['monitor','build',None]:
 calls=[]
 def monitor():
  calls.append('monitor')
  if reason=='monitor':raise RuntimeError('uncertain monitor')
 def build():
  calls.append('build')
  if reason=='build':raise RuntimeError('active build')
 def restore(_):calls.append('restore')
 env={'monitor_excluded':monitor,'no_build':build,'restored':restore}
 exec(compile(ast.Module(body=[f],type_ignores=[]),str(p),'exec'),env)
 try:env['rollback_if_safe']({})
 except RuntimeError:pass
 if reason=='monitor':assert calls==['monitor']
 elif reason=='build':assert calls==['monitor','build']
 else:assert calls==['monitor','build','restore']
print('PASS rollback is refused before mutation if monitor or build checks fail')
