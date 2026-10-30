#!/usr/bin/env python3
"""Compile exact isolated candidate fragments with fake Chromium event delivery."""
import hashlib
import pathlib
import subprocess
import tempfile

root = pathlib.Path(__file__).resolve().parent
source = root / 'combined-native-v1/chrome/browser/ui/blanc_prototype_ui.cc'
data = source.read_bytes()
assert hashlib.sha256(data).hexdigest() == 'e8cd2e37af0aeaf73f55d2afeee5afc10344fbb170dd444d68238aadcd67a76e'
code = data.decode('utf-8')

def extract(first, last):
    begin = code.index(first)
    end = code.index(last, begin)
    assert code.count(first) == 1
    return code[begin:end]

observer = extract('  void OnTabStripModelChanged(TabStripModel*, const TabStripModelChange&,',
                   '  void WillCloseAllTabs(TabStripModel*) override')
guard = extract('bool BlancSearchIntentCurrent(bool active, bool pending_navigation,',
                '// These are the only virtual URL aliases')
activation = 'current_model->ActivateTabAt(static_cast<int>(current->ListTabs().start()));'
assert code.count(activation) == 1

harness = r'''
#include <cassert>
#include <cstdint>
#include <string_view>
struct TabStripModelChange {};
struct TabStripSelectionChange { bool changed; bool active_tab_changed() const { return changed; } };
struct GURL { explicit GURL(const char*) {} bool operator==(const GURL&) const { return true; } };
namespace base { struct NullCallback {}; }
struct Frame {
  bool IsRenderFrameLive() const { return true; }
  void ExecuteJavaScript(const char16_t*, base::NullCallback) { ++refreshes; }
  int refreshes = 0;
};
struct Contents {
  GURL GetLastCommittedURL() { return GURL("x"); }
  Frame* GetPrimaryMainFrame() { return &frame; }
  Frame frame;
};
struct View { Contents* GetWebContents() { return host; } Contents* host = nullptr; };
struct Observer;
struct TabStripModel {
  int count() const { return 0; }
  void* GetWebContentsAt(int) { return nullptr; }
  void ActivateTabAt(int i);
  int active = 0;
  Observer* owner = nullptr;
};
struct Browser { TabStripModel* GetTabStripModel() { return model; } TabStripModel* model; };
struct SiteMuteTab { static void Get(void*) {} };
void UpdatePersistentSplitFocus(Browser*) {}
struct BaseObserver {
  virtual void OnTabStripModelChanged(TabStripModel*, const TabStripModelChange&,
                                      const TabStripSelectionChange&) = 0;
};
struct Observer : BaseObserver {
  Browser* browser;
  View* view = nullptr;
  uint64_t search_selection_epoch = 1;
  void SyncActive() { ++syncs; }
  int syncs = 0;
/*OBSERVER*/
};
void TabStripModel::ActivateTabAt(int i) {
  const bool changed = i != active;
  active = i;
  owner->OnTabStripModelChanged(this, {}, {changed});
}
struct Range { int start() const { return first; } int first; };
struct Group { Range ListTabs() const { return range; } Range range; };
/*GUARD*/
bool accepted(uint64_t current, uint64_t submitted, bool active,
              bool pending, bool visible, std::string_view actual_doc,
              std::string_view expected_doc, std::string_view actual_url,
              std::string_view expected_url) {
  return current == submitted &&
      BlancSearchIntentCurrent(active, pending, visible, actual_doc, expected_doc,
                               actual_url, expected_url);
}
int main() {
  TabStripModel model;
  Browser browser{&model};
  Observer owner;
  owner.browser = &browser; model.owner = &owner;
  Group group{{1}};
  auto* current_model = &model;
  auto* current = &group;
  const uint64_t original = owner.search_selection_epoch;
  assert(accepted(original, original, true, false, true, "1", "1", "url", "url"));
  /*ACTIVATE*/
  assert(model.active == 1 && owner.search_selection_epoch == original + 1);
  assert(!accepted(owner.search_selection_epoch, original, false, false, true, "1", "1", "url", "url"));
  model.ActivateTabAt(0);
  assert(owner.search_selection_epoch == original + 2);
  assert(!accepted(owner.search_selection_epoch, original, true, false, true, "1", "1", "url", "url"));
  const auto after = owner.search_selection_epoch;
  model.ActivateTabAt(0);
  assert(owner.search_selection_epoch == after);
  assert(!accepted(after, after, true, true, true, "1", "1", "url", "url"));
  assert(!accepted(after, after, true, false, false, "1", "1", "url", "url"));
  assert(!accepted(after, after, true, false, true, "2", "1", "url", "url"));
  assert(!accepted(after, after, true, false, true, "1", "1", "other", "url"));
  assert(accepted(after, after, true, false, true, "1", "1", "url", "url"));
}
'''
harness = harness.replace('/*OBSERVER*/', observer).replace('/*GUARD*/', guard).replace('/*ACTIVATE*/', activation)
with tempfile.TemporaryDirectory(prefix='blanc-combined-selection-test-') as tmp:
    cpp = pathlib.Path(tmp) / 'check.cc'
    binary = pathlib.Path(tmp) / 'check'
    cpp.write_text(harness, encoding='utf-8')
    subprocess.run(['clang++', '-std=c++17', '-Wall', '-Wextra', '-Werror',
                    str(cpp), '-o', str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
print('PASS: exact observer, group activation call and intent guard under fake event delivery')
