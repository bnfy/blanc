from pathlib import Path
import hashlib,shutil
root=Path('<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview');src=Path('<local-home>/Projects/BlancChromium158/src');draft=root/'repo/experiments/chromium-extension-spike/context-menu-glance-draft';out=root/'evidence/context-glance-menu-20261030';out.mkdir(exist_ok=False);stage=out/'staged'
paths=['chrome/app/chrome_command_ids.h','chrome/browser/renderer_context_menu/render_view_context_menu.h','chrome/browser/renderer_context_menu/render_view_context_menu.cc','chrome/browser/ui/blanc_prototype_ui.h']
for rel in paths:
 p=stage/rel;p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src/rel,p)
p=stage/'chrome/browser/ui/blanc_prototype_ui.cc';p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(root/'evidence/context-glance-owner-20261030/staged/chrome/browser/ui/blanc_prototype_ui.cc',p)
for name in ['context_link_origin.h','context_link_origin.cc','context_link_navigation.h','context_link_navigation.cc']:
 p=stage/'chrome/browser/ui/blanc_glance'/name;p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(draft/name,p)
def repl(p,old,new):
 s=p.read_text();assert s.count(old)==1,(str(p),old[:100],s.count(old));p.write_text(s.replace(old,new,1))
p=stage/'chrome/app/chrome_command_ids.h';assert ' 50114' not in p.read_text();repl(p,'#define IDC_CONTENT_CONTEXT_OPENLINK_ISOLATED 50113','#define IDC_CONTENT_CONTEXT_OPENLINK_ISOLATED 50113\n#define IDC_CONTENT_CONTEXT_OPENLINKGLANCE 50114')
p=stage/'chrome/browser/ui/blanc_prototype_ui.h';repl(p,'#include "base/functional/callback.h"','#include "base/functional/callback.h"\n#include "base/memory/weak_ptr.h"');repl(p,'namespace blanc_prototype {','namespace blanc::glance::draft { class ContextLinkOrigin; }\nnamespace blanc_prototype {\nstd::u16string ContextLinkGlanceLabel();\nbool PresentContextLinkForGlance(BrowserWindowInterface* browser,\n    blanc::glance::draft::ContextLinkOrigin origin,\n    base::WeakPtr<content::WebContents> reference);')
p=stage/'chrome/browser/ui/blanc_prototype_ui.cc';anchor='bool PresentContextLinkForGlance(\n';label='''std::u16string ContextLinkGlanceLabel() {
  std::string lang = ActiveInterfaceLanguageSetting();
  if (lang == "system")
    lang = g_browser_process ? g_browser_process->GetApplicationLocale() : "en";
  lang = base::ToLowerASCII(lang);
  if (lang == "de" || lang.starts_with("de-")) return u"Link in Glance öffnen";
  if (lang == "es" || lang.starts_with("es-")) return u"Abrir enlace en Glance";
  if (lang == "fr" || lang.starts_with("fr-")) return u"Ouvrir le lien dans Glance";
  if (lang == "it" || lang.starts_with("it-")) return u"Apri link in Glance";
  if (lang == "pt" || lang.starts_with("pt-")) return u"Abrir link no Glance";
  return u"Open Link in Glance";
}
''';repl(p,anchor,label+anchor)
p=stage/'chrome/browser/renderer_context_menu/render_view_context_menu.h';repl(p,'class AccessibilityLabelsMenuObserver;','namespace blanc::glance::draft { class ContextLinkOrigin; }\nclass AccessibilityLabelsMenuObserver;');repl(p,' private:\n  std::u16string GetElidedSelectionText',' private:\n  std::unique_ptr<blanc::glance::draft::ContextLinkOrigin> context_glance_origin_;\n  std::u16string GetElidedSelectionText')
p=stage/'chrome/browser/renderer_context_menu/render_view_context_menu.cc';repl(p,'#include "chrome/browser/renderer_context_menu/render_view_context_menu.h"','#include "chrome/browser/renderer_context_menu/render_view_context_menu.h"\n#include "chrome/browser/ui/blanc_prototype_ui.h"\n#include "chrome/browser/ui/blanc_glance/context_link_origin.h"\n#include "chrome/browser/ui/blanc_glance/context_link_navigation.h"')
anchor='''    if (show_open_in_new_window) {
      AddItemWithOptionalIcon(IDC_CONTENT_CONTEXT_OPENLINKNEWWINDOW,'''
insert='''    // The complete shipping protocol handoff is still under development.
    // Keep unsupported schemes disabled until it is integrated and tested.
    if (show_open_in_new_tab && GetBrowser() &&
        blanc_prototype::IsIslandWindow(GetBrowser())) {
      auto origin = blanc::glance::draft::ContextLinkOrigin::Capture(
          GetBrowser(), source_web_contents_, GetRenderFrameHost());
      if (origin) {
        context_glance_origin_ = std::make_unique<blanc::glance::draft::ContextLinkOrigin>(*origin);
        menu_model_.AddItem(IDC_CONTENT_CONTEXT_OPENLINKGLANCE,
                            blanc_prototype::ContextLinkGlanceLabel());
      }
    }

''';repl(p,anchor,insert+anchor)
repl(p,'void RenderViewContextMenu::RecordUsedItem(int id) {\n','void RenderViewContextMenu::RecordUsedItem(int id) {\n  if (id == IDC_CONTENT_CONTEXT_OPENLINKGLANCE) return;\n')
repl(p,'void RenderViewContextMenu::RecordShownItem(int id, bool is_submenu) {\n','void RenderViewContextMenu::RecordShownItem(int id, bool is_submenu) {\n  if (id == IDC_CONTENT_CONTEXT_OPENLINKGLANCE) return;\n')
anchor='''    case IDC_CONTENT_CONTEXT_OPENLINKSPLITVIEW:
      return navigation_allowed''';insert='''    case IDC_CONTENT_CONTEXT_OPENLINKGLANCE:
      return navigation_allowed && context_glance_origin_ &&
             context_glance_origin_->IsCurrent() && params_.link_url.is_valid() &&
             params_.link_url.SchemeIsHTTPOrHTTPS() &&
             IsOpenLinkAllowedByDlp(params_.link_url);

''';repl(p,anchor,insert+anchor)
anchor='''    case IDC_CONTENT_CONTEXT_OPENLINKNEWWINDOW:
      DCHECK(!IsInProgressiveWebApp());''';insert='''    case IDC_CONTENT_CONTEXT_OPENLINKGLANCE: {
      if (!IsCommandIdEnabled(id) || !GetBrowser()) return;
      auto origin = *context_glance_origin_;
      auto browser = GetBrowser()->GetWeakPtr();
      OpenURLParams open_params = GetOpenURLParamsWithExtraHeaders(
          params_.link_url, params_.frame_url, params_.frame_origin,
          WindowOpenDisposition::kNewBackgroundTab, ui::PAGE_TRANSITION_LINK,
          /*extra_headers=*/std::string(), /*started_from_context_menu=*/true);
      blanc::glance::draft::OpenContextLinkForGlance(
          origin, open_params,
          page_load_metrics::NavigationInitiatorHolder::AttacherCallback(
              chrome_navigation_initiator::kContextMenuOpenLink),
          base::BindOnce([](base::WeakPtr<BrowserWindowInterface> browser,
                            blanc::glance::draft::ContextLinkOrigin origin,
                            base::WeakPtr<content::WebContents> reference) {
            if (browser) blanc_prototype::PresentContextLinkForGlance(
                browser.get(), std::move(origin), std::move(reference));
          }, browser));
      return;
    }

''';repl(p,anchor,insert+anchor)
for p in stage.rglob('*'):
 if p.is_file(): print(str(p.relative_to(stage)),hashlib.sha256(p.read_bytes()).hexdigest())
