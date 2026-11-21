import fs from 'node:fs';import path from 'node:path';
export function prepareRendererTarget(edit,src){
 const target=path.join(src,'content/public/browser/blanc_document_token.h'),data=fs.readFileSync(new URL('./blanc-document-token.h',import.meta.url));
 let old;try{old=fs.readFileSync(target);}catch(e){if(e.code!=='ENOENT')throw e;}if(!old?.equals(data))fs.writeFileSync(target,data);
 edit('content/public/browser/BUILD.gn',[{anchor:'    "weak_document_ptr.h",',replacement:'    "weak_document_ptr.h",\n    "blanc_document_token.h",',present:'"blanc_document_token.h"'}]);
 edit('content/browser/renderer_host/render_frame_host_impl.cc',[
 {anchor:'#include "content/browser/renderer_host/render_frame_host_impl.h"',replacement:'#include "content/browser/renderer_host/render_frame_host_impl.h"\n#include "content/public/browser/blanc_document_token.h"',present:'#include "content/public/browser/blanc_document_token.h"'},
 {anchor:'namespace content {',replacement:`namespace content {
std::optional<std::string> BlancDocumentToken(RenderFrameHost* frame) {
  if (!frame || !frame->IsActive() || !frame->IsRenderFrameLive() || frame->IsErrorDocument()) return std::nullopt;
  return static_cast<RenderFrameHostImpl*>(frame)->GetDocumentToken().ToString();
}
`,present:'std::optional<std::string> BlancDocumentToken('}]);
 edit('extensions/browser/script_executor.h',[
 {anchor:'#include <map>',replacement:'#include <map>\n#include <optional>',present:'#include <optional>'},
 {anchor:'      ScriptFinishedCallback callback);',replacement:'      ScriptFinishedCallback callback,\n      std::optional<std::string> blanc_document_token = std::nullopt);',present:'std::optional<std::string> blanc_document_token ='},
 {anchor:'  bool MatchesDocument(int frame_id, const std::string& document_id) const;',replacement:'  std::optional<std::string> TargetDocumentToken(int frame_id, const std::string& document_id) const;',present:'TargetDocumentToken('}]);
 edit('extensions/browser/script_executor.cc',[
 {anchor:'#include "content/public/browser/render_frame_host.h"',replacement:'#include "content/public/browser/render_frame_host.h"\n#include "content/public/browser/blanc_document_token.h"',present:'#include "content/public/browser/blanc_document_token.h"'},
 {anchor:`bool ScriptExecutor::MatchesDocument(int frame_id, const std::string& document_id) const {
  auto* frame = ExtensionApiFrameIdMap::GetRenderFrameHostById(web_contents_, frame_id);
  const auto id = ExtensionApiFrameIdMap::DocumentIdFromString(document_id);
  return frame && !id.is_empty() &&
         ExtensionApiFrameIdMap::GetDocumentId(frame) == id;
}`,replacement:`std::optional<std::string> ScriptExecutor::TargetDocumentToken(int frame_id, const std::string& document_id) const {
  auto* frame = ExtensionApiFrameIdMap::GetRenderFrameHostById(web_contents_, frame_id);
  const auto id = ExtensionApiFrameIdMap::DocumentIdFromString(document_id);
  if (!frame || id.is_empty() || ExtensionApiFrameIdMap::GetDocumentId(frame) != id) return std::nullopt;
  return content::BlancDocumentToken(frame);
}`,present:'ScriptExecutor::TargetDocumentToken('},
 {anchor:'    ScriptFinishedCallback callback) {',replacement:'    ScriptFinishedCallback callback,\n    std::optional<std::string> blanc_document_token) {',present:'std::optional<std::string> blanc_document_token) {'},
 {anchor:'  params->webview_src = webview_src;',replacement:'  params->webview_src = webview_src;\n  params->blanc_document_token = std::move(blanc_document_token);',present:'params->blanc_document_token ='}]);
 edit('extensions/browser/api/execute_code_function.cc',[
 {anchor:'  // Blanc: Execute runs after asynchronous file loading.',replacement:'  std::optional<std::string> blanc_document_token;\n  // Blanc: Execute runs after asynchronous file loading.',present:'std::optional<std::string> blanc_document_token;'},
 {anchor:'  // documents before dispatch; this is not a renderer-side token guard.',replacement:'  // documents before dispatch and carry the exact Blink token to the renderer.',present:'// documents before dispatch and carry the exact Blink token'},
 {anchor:'!executor->MatchesDocument(root_frame_id_, *details_->blanc_document_id)',replacement:'!(blanc_document_token = executor->TargetDocumentToken(root_frame_id_, *details_->blanc_document_id))',present:'executor->TargetDocumentToken('},
 {anchor:'base::BindOnce(&ExecuteCodeFunction::OnExecuteCodeFinished, this));',replacement:'base::BindOnce(&ExecuteCodeFunction::OnExecuteCodeFinished, this),\n      std::move(blanc_document_token));',present:'std::move(blanc_document_token));'}]);
 edit('extensions/browser/script_executor.cc',[
 {anchor:'#include "extensions/browser/script_executor.h"',replacement:'#include "extensions/browser/script_executor.h"\n#include "base/command_line.h"',present:'#include "base/command_line.h"'},
 {anchor:'  params->blanc_document_token = std::move(blanc_document_token);',replacement:`  params->blanc_document_token = std::move(blanc_document_token);
  // Blanc diagnostic fault injection: opt-in switch, exact component and marker.
  // Deliberately invalidates the transported token, never relaxes the guard.
  if (params->blanc_document_token &&
      host_id.id == "oddhmofgkplblkmckempfepikkophank" &&
      base::CommandLine::ForCurrentProcess()->HasSwitch("blanc-renderer-token-mismatch-probe") &&
      params->injection->is_js() &&
      params->injection->get_js()->sources.size() == 1 &&
      params->injection->get_js()->sources[0]->code.starts_with("/*blanc-renderer-token-mismatch*/")) {
    *params->blanc_document_token += "-diagnostic-mismatch";
  }`,present:'// Blanc diagnostic fault injection: opt-in switch, exact component and marker.'}]);
 edit('extensions/common/mojom/frame.mojom',[{anchor:'  bool is_web_view;',replacement:'  bool is_web_view;\n  // Blanc opt-in document constraint; checked when deferred work becomes eligible.\n  string? blanc_document_token;',present:'string? blanc_document_token;'}]);
 edit('extensions/renderer/programmatic_script_injector.cc',[{anchor:'  // Note: we calculate url_ now and not in the constructor because we don\'t',replacement:`  // Blanc: the browser token is immutable across IPC and deferred runAt waits.
  if (params_->blanc_document_token &&
      *params_->blanc_document_token != frame->GetDocument().Token().ToString()) {
    return PermissionsData::PageAccess::kDenied;
  }
  // Note: we calculate url_ now and not in the constructor because we don't`,present:'// Blanc: the browser token is immutable across IPC'}]);
 edit('extensions/renderer/script_injection.cc',[{anchor:'  bool should_inject_js = injector_->ShouldInjectJs(',replacement:`  // Blanc: permission replies may arrive after navigation. Recheck a denial
  // immediately before execution; retain an already-granted withheld permission.
  if (host_id().id == "oddhmofgkplblkmckempfepikkophank" &&
      injector_->script_type() == mojom::InjectionType::kProgrammaticScript &&
      injector_->CanExecuteOnFrame(injection_host_.get(), render_frame_->GetWebFrame(),
          ExtensionFrameHelper::Get(render_frame_)->tab_id()) == PermissionsData::PageAccess::kDenied) {
    NotifyWillNotInject(ScriptInjector::InjectFailureReason::kNotAllowed);
    return InjectionResult::kFinished;
  }
  bool should_inject_js = injector_->ShouldInjectJs(`,present:'// Blanc: permission replies may arrive after navigation.'}]);
 edit('extensions/renderer/script_injection.cc',[{anchor:'if (injector_->script_type() == mojom::InjectionType::kProgrammaticScript &&\n      injector_->CanExecuteOnFrame',replacement:'if (host_id().id == "oddhmofgkplblkmckempfepikkophank" &&\n      injector_->script_type() == mojom::InjectionType::kProgrammaticScript &&\n      injector_->CanExecuteOnFrame',present:'if (host_id().id == "oddhmofgkplblkmckempfepikkophank" &&'}]);
}
