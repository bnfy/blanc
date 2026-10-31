from pathlib import Path
import ast,os,tempfile
from unittest.mock import patch
h=Path(__file__).resolve().parent;tree=ast.parse((h/'record-groups-build.py').read_text());fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='sync_lineage');env={'os':os};exec(compile(ast.Module(body=[fn],type_ignores=[]),'sync_lineage','exec'),env)
with tempfile.TemporaryDirectory(prefix='groups-lineage-') as tmp:
 parent=Path(tmp);stop=parent/'preview';target=stop/'evidence'/'groups';target.mkdir(parents=True)
 orig=os.open;seen=[]
 def observe(path,flags,*args):seen.append(Path(path));return orig(path,flags,*args)
 with patch.object(os,'open',observe):env['sync_lineage'](target,stop)
 assert seen==[target,stop/'evidence',stop,parent]
 print('PASS recorder evidence lineage flush')
