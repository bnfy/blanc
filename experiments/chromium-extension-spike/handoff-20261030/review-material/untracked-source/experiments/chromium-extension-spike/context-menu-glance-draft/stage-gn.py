from pathlib import Path
import json,hashlib,shutil
root=Path('<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview');source=Path('<local-home>/Projects/BlancChromium158/src');out=root/'evidence/context-glance-gn-draft-20261030';out.mkdir(exist_ok=False);stage=out/'staged';menu=root/'evidence/context-glance-menu-20261030';m=json.loads((menu/'manifest.json').read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for rel,v in m['files'].items():
 p=menu/'staged'/rel;assert sha(p)==v['stagedSha256'];live=source/rel
 if v['activeSha256'] is None:assert not live.exists()
 else:assert sha(live)==v['activeSha256']
 dest=stage/rel;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,dest)
framebase=root/'evidence/bangs-glance-native-reconcile-20261030/staged/chrome/browser/ui/views/frame/BUILD.gn';frame=stage/'chrome/browser/ui/views/frame/BUILD.gn';frame.parent.mkdir(parents=True,exist_ok=True);s=framebase.read_text();anchor='source_set("browser_view") {';assert s.count(anchor)==1
new='''# Shared context-link ownership avoids placing the link helpers in both the
# renderer menu and BrowserView source sets.
source_set("blanc_context_glance") {
  public = [
    "//chrome/browser/ui/blanc_glance/context_link_navigation.h",
    "//chrome/browser/ui/blanc_glance/context_link_origin.h",
  ]
  sources = [
    "//chrome/browser/ui/blanc_glance/context_link_navigation.cc",
    "//chrome/browser/ui/blanc_glance/context_link_origin.cc",
  ]
  public_deps = [
    "//base",
    "//content/public/browser",
    "//url",
  ]
  deps = [
    "//chrome/browser/profiles:profile",
    "//chrome/browser/ui:browser_window_header",
    "//chrome/browser/ui/tabs:tab_strip",
    "//ui/base",
  ]
}

''';s=s.replace(anchor,new+anchor,1);needle='  public_deps = [ ":browser_view_header" ]\n  deps = [\n';assert s.count(needle)==1;s=s.replace(needle,'  public_deps = [ ":browser_view_header" ]\n  deps = [\n    ":blanc_context_glance",\n',1);frame.write_text(s)
menuBuild=stage/'chrome/browser/renderer_context_menu/BUILD.gn';menuBuild.parent.mkdir(parents=True,exist_ok=True);s=(source/'chrome/browser/renderer_context_menu/BUILD.gn').read_text();needle='''    deps += [
      "//chrome/app:command_ids",
''';assert s.count(needle)==1;s=s.replace(needle,'''    deps += [
      "//chrome/browser/ui/views/frame:blanc_context_glance",
      "//chrome/browser/ui/views/frame:browser_view",
      "//chrome/app:command_ids",
''',1);menuBuild.write_text(s)
print('staged',len(m['files']),'source files plus two GN files')
