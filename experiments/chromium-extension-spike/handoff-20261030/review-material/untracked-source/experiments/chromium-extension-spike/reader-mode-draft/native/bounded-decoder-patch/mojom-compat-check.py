#!/usr/bin/env python3
from pathlib import Path
from types import SimpleNamespace
from mojom.parse import parser,ast
from mojom.generate.translate import _AssignDefaultOrdinals
import hashlib,json
p=Path(__file__).resolve().parent
if (p/'mojom-compat-result.json').exists():raise SystemExit('existing result preserved')
def methods(root):
 f=p/root/'services/data_decoder/public/mojom/image_decoder.mojom';tree=parser.Parse(f.read_text(),str(f));interface=next(x for x in tree.definition_list if isinstance(x,ast.Interface));return [x for x in interface.body if isinstance(x,ast.Method)]
def names(x):return [str(m.mojom_name) for m in x]
def ordinals(x):
 items=[SimpleNamespace(ordinal=None if m.ordinal is None else m.ordinal.value) for m in x];_AssignDefaultOrdinals(items);return {str(m.mojom_name):n.ordinal for m,n in zip(x,items)}
old,new,prior=methods('preimage'),methods('candidate'),methods('applied-v3');assert names(old)==['DecodeImage','DecodeAnimation'];assert new[:2]==old;assert names(new)==['DecodeImage','DecodeAnimation','DecodeImageBounded'];assert ordinals(old)=={n:ordinals(new)[n] for n in names(old)}
attrs={str(a.key):str(a.value) for a in new[-1].attribute_list};assert attrs.get('MinVersion')=='1';assert ordinals(prior)['DecodeAnimation']!=ordinals(old)['DecodeAnimation']
sha=lambda b:hashlib.sha256(b).hexdigest()
result={'status':'passed','scope':'Chromium Mojom parser and default-ordinal assignment for this interface; not full compatibility, generated bindings or runtime','old':ordinals(old),'previousCandidate':ordinals(prior),'new':ordinals(new),'oldMethodASTUnchanged':True,'newMethodMinVersion':1,'candidatePatchSha256':sha((p/'candidate.patch').read_bytes())};(p/'mojom-compat-result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
