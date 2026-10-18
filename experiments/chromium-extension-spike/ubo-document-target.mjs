// Scoped legacy API extension for the opt-in uBO component experiment.
export function prepareDocumentTarget(edit){
 const anchor='"description": "Details of the script or CSS to inject. Either the code or the file property must be set, but both may not be set at the same time.",\n        "properties": {';
 edit('extensions/common/api/extension_types.json',[{anchor,replacement:anchor+'\n          "blancDocumentId": {"type": "string", "optional": true, "description": "Blanc component exact pre-dispatch document constraint."},',present:'blancDocumentId'}]);
 edit('extensions/browser/script_executor.h',[{anchor:'  // Set the observer for ScriptsExecutedNotification callbacks.',replacement:'  // Blanc: compare within this executor\'s tab, never by frame ID alone.\n  bool MatchesDocument(int frame_id, const std::string& document_id) const;\n\n  // Set the observer for ScriptsExecutedNotification callbacks.',present:'bool MatchesDocument('}]);
 edit('extensions/browser/script_executor.cc',[{anchor:'void ScriptExecutor::ExecuteScript(',replacement:`bool ScriptExecutor::MatchesDocument(int frame_id, const std::string& document_id) const {
  auto* frame = ExtensionApiFrameIdMap::GetRenderFrameHostById(web_contents_, frame_id);
  const auto id = ExtensionApiFrameIdMap::DocumentIdFromString(document_id);
  return frame && !id.is_empty() &&
         ExtensionApiFrameIdMap::GetDocumentId(frame) == id;
}

void ScriptExecutor::ExecuteScript(`,present:'bool ScriptExecutor::MatchesDocument('}]);
 edit('extensions/browser/api/execute_code_function.cc',[
 {anchor:'#include "base/functional/bind.h"',replacement:'#include "base/functional/bind.h"\n#include "base/command_line.h"',present:'#include "base/command_line.h"'},
 {anchor:'  root_frame_id_ = details_->frame_id.value_or(GetRootFrameId());',replacement:`  root_frame_id_ = details_->frame_id.value_or(GetRootFrameId());
  // Blanc: Execute runs after asynchronous file loading. Reject replaced
  // documents before dispatch; this is not a renderer-side token guard.
  if (details_->blanc_document_id.has_value()) {
    if (!extension() || extension_id() != "oddhmofgkplblkmckempfepikkophank" ||
        !base::CommandLine::ForCurrentProcess()->HasSwitch("blanc-ubo-component-probe") ||
        IsWebView() || ShouldInsertCSS() || ShouldRemoveCSS() ||
        details_->all_frames.value_or(false) ||
        !executor->MatchesDocument(root_frame_id_, *details_->blanc_document_id)) {
      *error = "Blanc document target changed or is not permitted.";
      return false;
    }
  }`,present:'// Blanc: Execute runs after asynchronous file loading.'}]);
}
