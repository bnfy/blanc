from pathlib import Path
import ast,hashlib,json,os,tempfile
p=Path(__file__).resolve().parent/'record-focus-failed-restore.py';tree=ast.parse(p.read_text());names={'sha','inventory','verify_partial_output'};fns=[x for x in tree.body if isinstance(x,ast.FunctionDef) and x.name in names];assert {f.name for f in fns}==names
env={'Path':Path,'hashlib':hashlib,'json':json,'os':os};exec(compile(ast.Module(body=fns,type_ignores=[]),str(p),'exec'),env)
with tempfile.TemporaryDirectory(prefix='focus-failed-restore-test-') as td:
 root=Path(td);stage=root/'stage'/'transaction.json';diagnostic=root/'build'/'receipt.json';audit=root/'audit'/'receipt.json';release=root/'release'/'receipt.json';manifest=root/'manifest';config=root/'config';app=root/'app';out=root/'out'
 for d in [stage.parent,diagnostic.parent,audit.parent,release.parent,app,out]:d.mkdir(parents=True,exist_ok=True)
 manifest.write_text('manifest');config.write_text('paused');(app/'partial').write_text('partial app')
 output=out/'Blanc Prototype Framework.framework';output.mkdir();(output/'partial').write_text('partial output')
 obj=out/'obj/chrome/browser/ui/views/frame/browser_view/blanc_prototype_ui.o';obj.parent.mkdir(parents=True);obj.write_text('partial object')
 backup=stage.parent/'verified-baseline.app';backup.mkdir();(backup/'original').write_text('baseline app')
 bout=stage.parent/'verified-baseline-output-framework';bout.mkdir();(bout/'original').write_text('baseline output')
 bobj=stage.parent/'verified-baseline-ui.o';bobj.write_text('baseline object');log=diagnostic.parent/'build.log';log.write_text('interrupted build')
 st={'stagedReceiptSha256':'staged-hash','baselineAppInventory':env['inventory'](backup),'baselineOutputFrameworkInventory':env['inventory'](bout),'baselineUiObjectSha256':env['sha'](bobj)};stage.write_text(json.dumps(st))
 d={'status':'failed','diagnosticOnly':True,'stageLabel':'stage-a','stageReceiptSha256':'staged-hash','overlayManifestSha256':env['sha'](manifest)};diagnostic.write_text(json.dumps(d))
 a={'status':'awaiting-review','stageLabel':'stage-a','buildLabel':'build-a','auditLabel':'audit-a','buildReceiptSha256':env['sha'](diagnostic),'buildLogSha256':env['sha'](log),'stageSha256':'staged-hash','manifestSha256':env['sha'](manifest),'monitorConfigSha256':env['sha'](config),'partialApp':env['inventory'](app),'partialOutputFramework':env['inventory'](output),'partialUiObjectSha256':env['sha'](obj)};audit.write_text(json.dumps(a))
 r={'status':'removed-owned-stale-locks','auditSha256':env['sha'](audit),'pending':None,'removed':['.blanc-sunrise-transaction.lock','.blanc-build-guard.lock']};release.write_text(json.dumps(r))
 env.update(stage=stage,diagnostic=diagnostic,audit=audit,release=release,manifest=manifest,monitor_config=config,app=app,out=out,stage_label='stage-a',diagnostic_label='build-a',audit_label='audit-a')
 result=env['verify_partial_output']();assert result['auditSha256']==env['sha'](audit)
 for file in [log,release,config,app/'partial',obj]:
  old=file.read_text();file.write_text('tampered')
  try:env['verify_partial_output']();raise AssertionError('tampering accepted: '+str(file))
  except (RuntimeError,json.JSONDecodeError):pass
  file.write_text(old)
 print('PASS audited partial output, log, monitor config and exact completed lock-release provenance; tampering refused')
