from pathlib import Path
import subprocess,os,json
src=Path('/Users/anthonyjloria/Projects/BlancChromium157/src');root=Path('/private/tmp/blanc-window-identity-plan');rows=[];patch=[]
paths=['chrome/browser/sessions/session_service_base.cc','chrome/browser/sessions/session_restore.cc','chrome/browser/ui/browser_live_tab_context.cc']
for i,path in enumerate(paths):
 old=(src/path).read_text();new=old
 pos=new.index('#include "chrome/')
 new=new[:pos]+'#include "chrome/browser/ui/blanc_prototype_ui.h"\n'+new[pos:]
 if i==0:
  anchor='  DCHECK(browser->GetSessionID().is_valid());'
  assert new.count(anchor)==1
  new=new.replace(anchor,anchor+'\n  const auto identity = blanc_prototype::WindowIdentity(browser);\n  if (!identity.empty()) {\n    command_storage_manager()->AppendRebuildCommand(\n        sessions::CreateAddWindowExtraDataCommand(browser->GetSessionID(),\n            blanc_prototype::kWindowIdentityKey, identity));\n  }')
 elif i==1:
  anchor='    BrowserWindowInterface* browser_window =\n        CreateBrowserWindow(std::move(params));'
  assert new.count(anchor)==1
  new=new.replace(anchor,anchor+'\n    blanc_prototype::RestoreWindowIdentity(browser_window, extra_data);')
 else:
  anchor='BrowserLiveTabContext::GetExtraDataForWindow() const {\n  std::map<std::string, std::string> data;'
  assert new.count(anchor)==1
  new=new.replace(anchor,anchor+'\n  const auto identity = blanc_prototype::WindowIdentity(&browser_.get());\n  if (!identity.empty()) data[blanc_prototype::kWindowIdentityKey] = identity;')
  anchor='  BrowserWindowInterface* browser =\n      CreateBrowserWindow(std::move(*create_params));'
  assert new.count(anchor)==1
  new=new.replace(anchor,anchor+'\n  blanc_prototype::RestoreWindowIdentity(browser, extra_data);')
 a=root/f'{i}.before';b=root/f'{i}.after';a.write_text(old);b.write_text(new)
 cmd=['git','diff','--no-index','--text','--unified=0','--inter-hunk-context=0','--diff-algorithm=myers','--no-indent-heuristic','--no-renames','--no-ext-diff','--no-textconv','--no-color',str(a),str(b)]
 out=subprocess.run(cmd,capture_output=True,text=True,env={**os.environ,'GIT_CONFIG_GLOBAL':'/dev/null','GIT_CONFIG_NOSYSTEM':'1'});assert out.returncode==1
 diff=out.stdout.replace(str(a),'a/'+path).replace(str(b),'b/'+path);patch.append(diff)
 rows.append({'path':path,'hunks':sum(x.startswith('@@ ')for x in diff.splitlines())})
(root/'candidate.patch').write_text(''.join(patch));(root/'cost.json').write_text(json.dumps({'status':'unapplied design sketch, not compiled','files':rows,'additional_files':3,'additional_hunks':sum(x['hunks']for x in rows),'base_files':41,'base_hunks':100},indent=2))
print((root/'cost.json').read_text())
