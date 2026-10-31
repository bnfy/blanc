"""Actual recovery/baseline validators on fake fixture data; no real locks."""
from pathlib import Path
import ast,hashlib,json,re,tempfile
h=Path(__file__).resolve().parent;text=(h/'record-groups-resume.py').read_text();tree=ast.parse(text);names={'verify_recovery','verify_baseline','normalized_plan'};functions=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names];assert {n.name for n in functions}==names
with tempfile.TemporaryDirectory(prefix='groups-resume-test-') as tmp:
 root=Path(tmp);out=root/'out';out.mkdir();app=out/'app';app.mkdir();framework=out/'Blanc Prototype Framework.framework';framework.mkdir();obj=out/'obj/chrome/browser/ui/views/frame/browser_view/blanc_prototype_ui.o';obj.parent.mkdir(parents=True);obj.write_text('base');stage=root/'stage.json';trusted=root/'trusted.json';recovery=root/'recovery.json'
 objhash=hashlib.sha256(obj.read_bytes()).hexdigest();stage.write_text(json.dumps({'baselineUiObjectSha256':objhash}));prefix='Contents/Frameworks/Blanc Prototype Framework.framework/';expected={prefix+'inner':{'sha256':'framework'}};expected.update({f'entry{i}':{'sha256':'x'} for i in range(352)});trusted.write_text(json.dumps({'baselineAppInventory':expected}));actual={app:expected,framework:{'inner':{'sha256':'framework'}}}
 original={'receipt':'a','log':'b','stage':'c','trusted':'628bd51e633ecfa23f21fdd147df30c168175e71597f55ddba468dad713a0383'}
 valid={'status':'removed-owned-stale-locks','pending':None,'removed':['.blanc-sunrise-transaction.lock','.blanc-build-guard.lock'],'originalEvidence':original,'baselineObjectSha256':objhash,'lockIdentities':{'.blanc-build-guard.lock':{'ownerSha256':'93282145a7d63837695f189bd137013a9768fea95854a64798f2354f60475973'},'.blanc-sunrise-transaction.lock':{'ownerSha256':'0850a768d67102bbab8ae019d7563d1a25e805aafc28dedc4400a0c917f61cc6'}}};recovery.write_text(json.dumps(valid))
 def sha(p):return original['trusted'] if p==trusted else hashlib.sha256(p.read_bytes()).hexdigest()
 env={'recovery':recovery,'trusted':trusted,'stage':stage,'out':out,'app':app,'inventory':lambda p:actual[p],'sha':sha,'json':json,'hashlib':hashlib,'re':re,'original_receipt_sha':'a','original_log_sha':'b','original_stage_sha':'c'}
 exec(compile(ast.Module(body=functions,type_ignores=[]),'resume-functions','exec'),env)
 env['verify_baseline']();assert env['verify_recovery']()==sha(recovery)
 valid['pending']='lock';recovery.write_text(json.dumps(valid))
 try:env['verify_recovery']();raise AssertionError('pending recovery accepted')
 except RuntimeError:pass
 valid['pending']=None;valid['lockIdentities']['.blanc-build-guard.lock']['ownerSha256']='wrong';recovery.write_text(json.dumps(valid))
 try:env['verify_recovery']();raise AssertionError('wrong owner accepted')
 except RuntimeError:pass
 actual[app]={}
 try:env['verify_baseline']();raise AssertionError('changed app accepted')
 except RuntimeError:pass
 actual[app]=expected;obj.write_text('changed')
 try:env['verify_baseline']();raise AssertionError('changed object accepted')
 except RuntimeError:pass
 assert "verify_recovery()!=receipt['lockRecoveryReceiptSha256']" in text
 assert "digest!=receipt['normalizedPlanSha256']" in text and "digest!=original_plan_sha" in text
 print('PASS completed recovery identity, baseline inventory/object refusal, recovery hash and original/rechecked digest gates')
