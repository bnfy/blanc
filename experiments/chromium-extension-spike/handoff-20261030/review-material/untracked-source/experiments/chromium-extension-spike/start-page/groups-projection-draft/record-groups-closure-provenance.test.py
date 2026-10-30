"""Replay retained receipt provenance against temporary copies, never real locks."""
from pathlib import Path
import ast,hashlib,json,re,shutil,tempfile
h=Path(__file__).resolve().parent;text=(h/'record-groups-closure-draft.py').read_text();tree=ast.parse(text);names={'sha','normalized_plan','previous_stopped','verify_recovery'};functions=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names];assert {n.name for n in functions}==names
base=Path('<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview/evidence/start-page-groups-20261029')
class Gone:
 @staticmethod
 def kill(*_):raise ProcessLookupError()
 @staticmethod
 def killpg(*_):raise ProcessLookupError()
with tempfile.TemporaryDirectory(prefix='groups-closure-provenance-') as tmp:
 root=Path(tmp);original=root/'resume1';previous1=root/'groups1';original.mkdir();previous1.mkdir()
 for name in ('receipt.json','build.log','preflight.log','recheck.log'):shutil.copyfile(base/'build-resume1'/name,original/name)
 for name in ('receipt.json','build.log','preflight.log','recheck.log'):shutil.copyfile(base/'build-groups1'/name,previous1/name)
 prior_recovery=root/'prior-recovery.json';shutil.copyfile(base/'lock-recovery-recovery1/receipt.json',prior_recovery)
 stage=root/'stage.json';shutil.copyfile(base/'stage-groups1/transaction.json',stage);recovery=root/'recovery.json'
 values={'receipt':'9caadd6d0fb358244382a4ffff0b7509204daa5dca95d97fabc7ee866b5824c3','log':'c0ebec09953b68d0997ddf7e03807655ce732bb3100925d2c4f76e7569e05cb6','stage':'94547d6a0072858aad43a87411f2e728b94857bcae5fc2ada742514ce973cf9e','trusted':'628bd51e633ecfa23f21fdd147df30c168175e71597f55ddba468dad713a0383'}
 valid={'status':'removed-owned-stale-locks','pending':None,'removed':['.blanc-sunrise-transaction.lock','.blanc-build-guard.lock'],'originalEvidence':values,'priorRecoverySha256':'a3505de36787aa6ca00d6d72eddd0498f2e9ce5588742afc0dd054ea9be8c7e8','priorFailedReceiptSha256':'5c1500b1c282cf00ac0fbd36a914ffabff6bae6a98f6346cb3df18caa3397e59','baselineObjectSha256':json.loads(stage.read_text())['baselineUiObjectSha256'],'lockIdentities':{'.blanc-build-guard.lock':{'ownerSha256':'c361bf4041ab3e50dd37503e25af0224ed980f9ec69a3c073a08273ef33cd738'},'.blanc-sunrise-transaction.lock':{'ownerSha256':'3ee27e3885d8ea16f40deea939ea9cade298ceb05655a4b9f5f6c91fb4cbb868'}}};recovery.write_text(json.dumps(valid))
 env={'Path':Path,'hashlib':hashlib,'json':json,'re':re,'os':Gone,'original':original,'previous1':previous1,'prior_recovery':prior_recovery,'stage':stage,'recovery':recovery,'original_receipt_sha':values['receipt'],'original_log_sha':values['log'],'original_stage_sha':values['stage'],'original_plan_sha':'0a808d6e07c47d527e7f97fe4f0906011ff8355a82b8ffb35c178fd39a2d279e','original_plan_logs':{'preflight.log':'53989d642f0c4115e5ab626a9248bacaeba44d72e695aa5034f494640fa2495b','recheck.log':'62a92ee3103bb415cf99e05eb2851e1b8081d0f7b76d648eaed8d43796a40dc9'},'previous1_plan_logs':{'preflight.log':'c6250f930883ec269634f35e67f396b733a9e1c36b4d7c59cd40708ba75eb4a9','recheck.log':'604e5d1d37158706d2f36d96d4a5994244c90b06145c84c1ba6144b80981b4ab'}}
 exec(compile(ast.Module(body=functions,type_ignores=[]),'provenance','exec'),env)
 # Simulate the pinned receipt digest to exercise the actual field validation.
 actual_sha=env['sha'];env['sha']=lambda path:'b3755942838bfbe0adc958723bffe36f198e1fd50fa1ade0d601c4c066c0498e' if path==recovery else actual_sha(path)
 env['previous_stopped']();assert env['verify_recovery']()=='b3755942838bfbe0adc958723bffe36f198e1fd50fa1ade0d601c4c066c0498e'
 valid['pending']='guard';recovery.write_text(json.dumps(valid))
 try:env['verify_recovery']();raise AssertionError('pending second recovery accepted')
 except RuntimeError:pass
 (original/'build.log').write_text('changed')
 try:env['previous_stopped']();raise AssertionError('changed second failure accepted')
 except RuntimeError:pass
 assert "digest!=original_plan_sha" in text and "digest!=receipt['normalizedPlanSha256']" in text
 main=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='main');branch=next(n for n in main.body if isinstance(n,ast.If) and isinstance(n.test,ast.Compare) and any(isinstance(x,ast.Constant) and x.value=='plan' for x in n.test.comparators));assert any(isinstance(n,ast.Return) for n in ast.walk(branch));assert "run(receipt,'preflight',True,env)" in text and "run(receipt,'build',False,env)" in text
 print('PASS both stopped receipts/logs and plan digest, exact second recovery fields, tamper refusal and separate plan branch')
