from pathlib import Path
import ast,hashlib,json,os,tempfile
p=Path(__file__).resolve().parent/'record-focus-restore.py';tree=ast.parse(p.read_text())
names={'sha','inventory','verify_diagnostic_output'};fns=[x for x in tree.body if isinstance(x,ast.FunctionDef) and x.name in names];assert {f.name for f in fns}==names
env={'Path':Path,'hashlib':hashlib,'json':json,'os':os};exec(compile(ast.Module(body=fns,type_ignores=[]),str(p),'exec'),env)
with tempfile.TemporaryDirectory(prefix='focus-restore-provenance-') as td:
 r=Path(td);stage=r/'stage'/'transaction.json';diagnostic=r/'build'/'receipt.json';manifest=r/'manifest.json';app=r/'app';out=r/'out'
 for d in [stage.parent,diagnostic.parent,app,out]:d.mkdir(parents=True,exist_ok=True)
 rel=Path('Contents/Frameworks/Blanc Prototype Framework.framework/Versions/158.0.8127.2/Blanc Prototype Framework')
 framework=app/rel;framework.parent.mkdir(parents=True);framework.write_text('diagnostic framework')
 obj=out/'obj/chrome/browser/ui/views/frame/browser_view/blanc_prototype_ui.o';obj.parent.mkdir(parents=True);obj.write_text('diagnostic object')
 output=out/'Blanc Prototype Framework.framework/Versions/158.0.8127.2/Blanc Prototype Framework';output.parent.mkdir(parents=True);output.write_text('diagnostic framework')
 backup=stage.parent/'verified-baseline.app';backup.mkdir();(backup/'baseline').write_text('baseline')
 bout=stage.parent/'verified-baseline-output-framework';bout.mkdir();(bout/'baseline').write_text('baseline framework')
 bobj=stage.parent/'verified-baseline-ui.o';bobj.write_text('baseline object')
 manifest.write_text('manifest');inv=diagnostic.parent/'app-inventory.json';inv.write_text(json.dumps(env['inventory'](app)))
 guard=diagnostic.parent/'guard.log';guard.write_text('verified guard')
 st={'stagedReceiptSha256':'original-stage-hash','baselineAppInventory':env['inventory'](backup),'baselineOutputFrameworkInventory':env['inventory'](bout),'baselineUiObjectSha256':env['sha'](bobj)};stage.write_text(json.dumps(st))
 d={'status':'verified','diagnosticOnly':True,'stageLabel':'stage-a','stageReceiptSha256':'original-stage-hash','overlayManifestSha256':env['sha'](manifest),'baseBuildReceiptSha256':'a67d16ce283ea4eeaf81533a8b891838b25d6052944ec946885621f50285dc23','guardActions':0,'guardExit':0,'buildExit':0,'appInventorySha256':env['sha'](inv),'guardPlanSha256':env['sha'](guard),'frameworkSha256':env['sha'](framework),'uiObjectSha256':env['sha'](obj)};diagnostic.write_text(json.dumps(d))
 env.update(stage=stage,diagnostic=diagnostic,stage_label='stage-a',manifest=manifest,app=app,out=out,framework=framework)
 assert env['verify_diagnostic_output']()==env['sha'](diagnostic)
 for change in ['stage','app','object','guard']:
  original_stage=stage.read_text();original_app=framework.read_text();original_obj=obj.read_text();original_guard=guard.read_text()
  if change=='stage':st['stagedReceiptSha256']='other';stage.write_text(json.dumps(st))
  elif change=='app':framework.write_text('tampered')
  elif change=='object':obj.write_text('tampered')
  else:guard.write_text('tampered')
  try:env['verify_diagnostic_output']();raise AssertionError(change+' was accepted')
  except RuntimeError:pass
  stage.write_text(original_stage);st=json.loads(original_stage);framework.write_text(original_app);obj.write_text(original_obj);guard.write_text(original_guard)
 print('PASS exact diagnostic stage, app, UI object and zero-guard provenance; tampering refused')
