"""Real plan parser against disposable logs; does not invoke Siso."""
from pathlib import Path
import ast,hashlib,json,re,tempfile
h=Path(__file__).resolve().parent;tree=ast.parse((h/'record-groups-build.py').read_text());func=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='normalized_plan');env={'hashlib':hashlib,'json':json,'re':re};exec(compile(ast.Module(body=[func],type_ignores=[]),'parser','exec'),env);parse=env['normalized_plan']
with tempfile.TemporaryDirectory(prefix='groups-plan-test-') as t:
 p=Path(t)/'plan.log'
 def plan(lines,count=2):return 'loading 2ms\nbuild start: Ready 2 Pending 0\n'+'\n'.join(lines)+'\nbuild finished\n2s Build Succeeded: '+str(count)+' steps\n'
 p.write_text(plan(['compile A','link A']));n,digest=parse(p);assert n==2
 p.write_text(plan(['link A','compile A']));assert parse(p)==(2,digest)
 p.write_text(plan(['compile B','link A']));assert parse(p)[1]!=digest
 p.write_text(plan(['compile A'],2))
 try:parse(p);raise AssertionError('missing action accepted')
 except RuntimeError:pass
 p.write_text(plan(['write_buildflag_header.py x','link A']))
 try:parse(p);raise AssertionError('generator accepted')
 except RuntimeError:pass
 p.write_text('ninja: no work to do.\nBuild Succeeded: 0 steps\n');assert parse(p)[0]==0
 print('PASS normalized action multiset, changed command, missing action, generator and zero guard')
