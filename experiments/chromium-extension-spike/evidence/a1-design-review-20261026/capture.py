from pathlib import Path
import json,hashlib,subprocess,os
repo=Path('/private/tmp/blanc-chromium157-work');src=Path('/private/tmp/blanc-chromium157-update/src');out=Path('/private/tmp/blanc-a1-review-20261026')
d=json.loads((repo/'experiments/chromium-extension-spike/evidence/f12-redirect-repair-20261025/patch-budget.json').read_text())
env=dict(os.environ,GIT_CONFIG_GLOBAL='/dev/null',GIT_CONFIG_NOSYSTEM='1',GIT_OPTIONAL_LOCKS='0',LC_ALL='C')
for k in list(env):
 if k in ('GIT_CONFIG_PARAMETERS','GIT_CONFIG_COUNT') or k.startswith(('GIT_CONFIG_KEY_','GIT_CONFIG_VALUE_')):del env[k]
def git(*args):return subprocess.check_output(['git','-C',str(src),*args],env=env)
assert git('rev-parse','HEAD').decode().strip()==d['upstream_commit']
actual=sorted(x for x in git('diff','--name-only','--no-renames','--no-ext-diff','--no-textconv',d['upstream_commit'],'--').decode().splitlines() if x)
expected=sorted(x['path'] for x in d['files']);assert actual==expected,(set(actual)-set(expected),set(expected)-set(actual))
rows=[]
for x in d['files']:
 p=git('diff',*d['diff_options'],*([] if x['binary'] else ['--text']),d['upstream_commit'],'--',x['path'])
 h=hashlib.sha256(p).hexdigest();assert h==x['patch_sha256'],x['path']
 row=dict(x,working_sha256=hashlib.sha256((src/x['path']).read_bytes()).hexdigest());rows.append(row)
(out/'source-binding.json').write_text(json.dumps({'reviewedSourceCommit':'1523375af5b93cf910d9cca82f522155ef525adf','upstreamCommit':d['upstream_commit'],'scope':'Exact 75 recorded upstream patches match current working tree; no dependency audit/build/runtime rerun','files':rows,'upstreamFiles':75,'hunks':184,'dependencyStatus':'151 clean Git dependencies is the recorded October25 observation, not newly rerun'},indent=2)+'\n')
text=git('diff','--unified=3','--no-renames','--no-ext-diff','--no-textconv',d['upstream_commit'],'--').decode()
(out/'review.patch').write_text(text)
print('75 patch digests match recorded inventory; 184 recorded hunks; review diff bytes',len(text))
