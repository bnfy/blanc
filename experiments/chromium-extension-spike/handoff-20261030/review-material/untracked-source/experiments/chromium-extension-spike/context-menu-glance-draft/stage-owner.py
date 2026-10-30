from pathlib import Path
import hashlib,shutil
root=Path('<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview');draft=root/'repo/experiments/chromium-extension-spike/context-menu-glance-draft';out=root/'evidence/context-glance-owner-20261030';out.mkdir(exist_ok=False);stage=out/'staged';ui=stage/'chrome/browser/ui/blanc_prototype_ui.cc';ui.parent.mkdir(parents=True);base=root/'evidence/bangs-glance-native-reconcile-20261030/staged/chrome/browser/ui/blanc_prototype_ui.cc';header=root/'repo/experiments/chromium-extension-spike/context-menu-glance-draft/context_link_origin.h';target=stage/'chrome/browser/ui/blanc_glance/context_link_origin.h';target.parent.mkdir(parents=True);shutil.copyfile(header,target)
s=base.read_text()
def replace(old,new):
 global s
 if s.count(old)!=1:raise RuntimeError('anchor count '+str(s.count(old))+' '+old[:100])
 s=s.replace(old,new,1)
replace('#include "chrome/browser/ui/blanc_glance/glance_card_handler.h"','#include "chrome/browser/ui/blanc_glance/context_link_origin.h"\n#include "chrome/browser/ui/blanc_glance/glance_card_handler.h"')
replace('  bool glance_waiting_window_close = false;','  std::optional<blanc::glance::draft::ContextLinkOrigin> context_origin;\n  base::WeakPtr<content::WebContents> context_reference;\n  int context_epoch = 0;\n  bool glance_waiting_window_close = false;')
replace('  void CancelFloatingOpen() {\n', '  void CancelFloatingOpen() {\n    context_origin.reset();\n    context_reference.reset();\n    context_epoch = 0;\n')
replace('  bool EnsureFloatingGlance();','  bool StartContextGlance(blanc::glance::draft::ContextLinkOrigin origin,\n                          base::WeakPtr<content::WebContents> reference);\n  void ContinueContextGlance();\n  bool ContextGlanceCurrent(int expected_epoch) const;\n  bool EnsureFloatingGlance();')
replace('  const bool replacing = expected_action == "replace" || expected_action == "restore";','  const bool replacing = expected_action == "replace" || expected_action == "restore";\n  const bool context_bound = context_origin && context_epoch == expected_epoch;')
replace('    if (glance_pending_epoch != glance_open_epoch ||\n        !CanOpenFloatingGlance(glance_pending_main, glance_pending_reference)) {','    if (glance_pending_epoch != glance_open_epoch ||\n        (context_bound && !ContextGlanceCurrent(expected_epoch)) ||\n        !CanOpenFloatingGlance(glance_pending_main, glance_pending_reference)) {')
replace('        !weak->CanOpenFloatingGlance(expected_main, expected_reference)) return false;','        (context_bound && !weak->ContextGlanceCurrent(expected_epoch)) ||\n        !weak->CanOpenFloatingGlance(expected_main, expected_reference)) return false;')
replace('      weak->glance_open_epoch != expected_epoch)) {','      weak->glance_open_epoch != expected_epoch ||\n      (context_bound && !weak->ContextGlanceCurrent(expected_epoch)))) {')
replace('    owner->glance_waiting_window_close = false;\n    owner->glance_pending_action.clear();\n    base::SingleThreadTaskRunner', '    owner->glance_waiting_window_close = false;\n    owner->CancelFloatingOpen();\n    owner->glance_pending_action.clear();\n    base::SingleThreadTaskRunner')
replace('  auto weak = GetWeakPtr();\n  // A user may have dismissed the error dialog', '  auto weak = GetWeakPtr();\n  if (context_origin) {\n    ContinueContextGlance();\n    if (!weak) return;\n  }\n  // A user may have dismissed the error dialog')
anchor='void Owner::FloatingStoreChanged() {'
methods='''bool Owner::ContextGlanceCurrent(int expected_epoch) const {
  return context_origin && context_epoch == expected_epoch &&
      glance_open_epoch == expected_epoch && context_reference &&
      context_origin->IsCurrent() &&
      context_origin->AcceptsReference(context_reference.get());
}
bool Owner::StartContextGlance(
    blanc::glance::draft::ContextLinkOrigin origin,
    base::WeakPtr<content::WebContents> reference) {
  if (!reference || !origin.IsCurrent() ||
      !origin.AcceptsReference(reference.get()) || !glance_pending_action.empty())
    return false;
  CancelFloatingOpen();
  if (!glance_open_epoch) return false;
  context_origin = std::move(origin);
  context_reference = std::move(reference);
  context_epoch = glance_open_epoch;
  glance_waiting_window_close = false;
  ContinueContextGlance();
  return true;  // Accepted for processing; not a presentation result.
}
void Owner::ContinueContextGlance() {
  const int epoch = context_epoch;
  if (!ContextGlanceCurrent(epoch)) {
    if (glance_pending_action == "replace" && glance_pending_epoch == epoch)
      glance_pending_action.clear();
    context_origin.reset(); context_reference.reset(); context_epoch = 0;
    return;
  }
  auto weak = GetWeakPtr();
  if (!EnsureFloatingGlance()) {
    if (!weak) return;
    if (weak->glance_store && (weak->glance_store->state() ==
        blanc::glance::draft::GlanceFrameStore::State::kReadFailed ||
        weak->glance_store->state() == blanc::glance::draft::GlanceFrameStore::State::kWriteFailed))
      weak->ShowGlanceRecovery();
    if (!weak->glance_store) {
      weak->context_origin.reset(); weak->context_reference.reset(); weak->context_epoch = 0;
    }
    return;
  }
  if (!weak || !weak->ContextGlanceCurrent(epoch)) return;
  auto* main = weak->context_origin->opener();
  auto* reference = weak->context_reference.get();
  if (!main || !reference) return;
  const int main_id = sessions::SessionTabHelper::IdForTab(main).id();
  const int ref_id = sessions::SessionTabHelper::IdForTab(reference).id();
  if (!weak->CanOpenFloatingGlance(main_id, ref_id)) {
    weak->context_origin.reset(); weak->context_reference.reset(); weak->context_epoch = 0;
    return;
  }
  if (weak->glance_window->HasSession()) {
    if (weak->glance_pending_action.empty()) {
      if (weak->glance_main != main_id || weak->glance_reference == ref_id) {
        weak->context_origin.reset(); weak->context_reference.reset(); weak->context_epoch = 0;
        return;
      }
      weak->glance_pending_action = "replace";
      weak->glance_pending_main = main_id;
      weak->glance_pending_reference = ref_id;
      weak->glance_pending_epoch = epoch;
    } else if (weak->glance_pending_action != "replace" || weak->glance_pending_epoch != epoch) {
      return;
    }
    const bool done = weak->FinishFloatingGlance();
    if (!weak) return;
    if (!done && weak->glance_store && weak->glance_store->state() ==
        blanc::glance::draft::GlanceFrameStore::State::kWriting) return;
    if (!done && weak->glance_store && weak->glance_store->state() ==
        blanc::glance::draft::GlanceFrameStore::State::kWriteFailed) {
      weak->ShowGlanceRecovery(); return;
    }
    if (!done && weak->glance_pending_epoch == epoch) weak->glance_pending_action.clear();
  } else {
    const bool opened = weak->OpenFloatingGlance(main_id, ref_id);
    if (!weak) return;
    if (opened) weak->glance_owned_epoch = epoch;
  }
  if (weak->context_epoch == epoch) {
    weak->context_origin.reset(); weak->context_reference.reset(); weak->context_epoch = 0;
  }
}
'''
replace(anchor,methods+anchor)
anchor='blanc::glance::draft::GlanceWindowOwner* GlanceOwnerForBrowser('
method='''bool PresentContextLinkForGlance(
    BrowserWindowInterface* browser,
    blanc::glance::draft::ContextLinkOrigin origin,
    base::WeakPtr<content::WebContents> reference) {
  auto* owner = IslandOwnerForBrowser(browser);
  return owner && owner->StartContextGlance(std::move(origin), std::move(reference));
}
'''
replace(anchor,method+anchor)
ui.write_text(s);print('staged UI',hashlib.sha256(ui.read_bytes()).hexdigest())
