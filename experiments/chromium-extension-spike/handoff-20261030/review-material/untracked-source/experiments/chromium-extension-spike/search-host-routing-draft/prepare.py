from pathlib import Path
import hashlib, json
root = Path('<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview')
ex = root/'repo/experiments/chromium-extension-spike'
here = Path(__file__).resolve().parent
ref = ex/'evidence/settings-search-route-20261028'
source = Path('<local-home>/Projects/BlancChromium158/src/chrome/browser/ui/blanc_prototype_ui.cc')
host = root/'evidence/topsites-partial-delete-20261029/assets-v1/host.js'
cc = source.read_text(); js = host.read_text()
def replace_once(text, old, new):
    assert text.count(old) == 1, f'anchor count {text.count(old)}: {old[:100]!r}'
    return text.replace(old, new, 1)

def build_cc(cc):
    cc = replace_once(cc, 'namespace blanc_prototype {',
        '#include "modules/custom_template.cc"\n#include "modules/selected_custom.cc"\n#include "modules/selected_shipping.cc"\n#include "modules/selected_shipping_browser.cc"\n\nnamespace blanc_prototype {')
    cc = replace_once(cc, '.Set("committedUrl", committed.spec())',
        '.Set("committedUrl", committed.spec())\n                    .Set("searchDocumentId", base::NumberToString(contents->GetPrimaryMainFrame()->GetNavigationId()))')
    cc = replace_once(cc, '  bool identity_registered = false;', '  uint64_t search_selection_epoch = 1;\n  bool identity_registered = false;')
    cc = replace_once(cc, '    if (!selection.active_tab_changed()) return;\n    UpdatePersistentSplitFocus(browser);',
        '    if (!selection.active_tab_changed()) return;\n    ++search_selection_epoch;\n    UpdatePersistentSplitFocus(browser);')
    cc = replace_once(cc, '      .Set("activeTabId", std::move(active_id))',
        '      .Set("activeTabId", std::move(active_id))\n      .Set("searchSelectionEpoch", base::NumberToString(owner->search_selection_epoch))')
    capture = '''class CreatedSearchTabCapture : public TabStripModelObserver {
 public:
  CreatedSearchTabCapture(TabStripModel* model, content::WebContents* original)
      : model_(model), original_(original ? original->GetWeakPtr() : nullptr) {
    model_->AddObserver(this);
  }
  ~CreatedSearchTabCapture() override { if (model_) model_->RemoveObserver(this); }
  void OnTabStripModelChanged(TabStripModel* model, const TabStripModelChange& change,
                              const TabStripSelectionChange& selection) override {
    if (model != model_ || invalid_) return;
    if (const auto* insert = change.GetInsert()) {
      if (seen_ || insert->contents.size() != 1 || !original_ ||
          selection.old_contents != original_.get()) { invalid_ = true; return; }
      auto* candidate = insert->contents[0].contents.get();
      if (!candidate || selection.new_contents != candidate ||
          model_->GetIndexOfWebContents(candidate) == TabStripModel::kNoTab) {
        invalid_ = true; return;
      }
      seen_ = true; created_ = candidate->GetWeakPtr();
    } else if (selection.active_tab_changed() || change.type() != TabStripModelChange::kSelectionOnly) {
      invalid_ = true;
    }
  }
  void OnTabStripModelDestroyed(TabStripModel*) override { model_ = nullptr; invalid_ = true; }
  base::WeakPtr<content::WebContents> Match(content::WebContents* returned) const {
    if (invalid_ || !seen_ || !model_ || !created_ || created_.get() != returned ||
        model_->GetActiveWebContents() != created_.get() ||
        model_->GetIndexOfWebContents(created_.get()) == TabStripModel::kNoTab) return {};
    return created_;
  }
 private:
  raw_ptr<TabStripModel> model_;
  base::WeakPtr<content::WebContents> original_;
  base::WeakPtr<content::WebContents> created_;
  bool seen_ = false;
  bool invalid_ = false;
};
'''
    cc = replace_once(cc, 'class Handler : public content::WebUIMessageHandler, public extensions::ExtensionUninstallDialog::Delegate {',
        (ref/'navigation_outcome_state.inc').read_text() + '\n' + (ref/'search_intent_guard.inc').read_text() + '\n' + capture + '\nclass Handler : public content::WebUIMessageHandler, public extensions::ExtensionUninstallDialog::Delegate {')
    cc = replace_once(cc, '    split_closes_.clear();', '    split_closes_.clear();\n    pending_navigations_.clear();')
    observer = (ref/'navigation_observer_members.inc').read_text()
    observer = replace_once(observer, '    uint64_t generation;\n    std::unique_ptr<NavigationWatch> watch;',
        '    uint64_t generation;\n    std::unique_ptr<NavigationWatch> watch;\n    bool created;\n    int target_tab_id;\n    uint64_t creation_epoch;')
    observer = replace_once(observer, '    if (*result == Result::kCommitted) Reply(id, true, base::Value(true));',
        '    if (created) {\n      base::DictValue value;\n      value.Set("status", *result == Result::kCommitted ? "committed" : *result == Result::kSameDocument ? "same-document" : *result == Result::kNotCommitted ? "failed" : "unknown");\n      value.Set("tabId", tab_id); value.Set("selectionEpoch", base::NumberToString(epoch));\n      Reply(id, true, base::Value(std::move(value)));\n    } else if (*result == Result::kCommitted) Reply(id, true, base::Value(true));')
    observer = replace_once(observer, '    pending_navigations_.erase(it);\n    using Result =',
        '    const bool created = it->second.created;\n    const int tab_id = it->second.target_tab_id;\n    const uint64_t epoch = it->second.creation_epoch;\n    pending_navigations_.erase(it);\n    using Result =')
    observer = replace_once(observer, '                               const GURL& url, ui::PageTransition transition) {',
        '                               const GURL& url, ui::PageTransition transition, bool created = false, uint64_t epoch = 0) {')
    observer = replace_once(observer, 'pending_navigations_.emplace(id, PendingNavigation{generation, std::move(watch)});',
        'pending_navigations_.emplace(id, PendingNavigation{generation, std::move(watch), created, sessions::SessionTabHelper::IdForTab(tab).id(), epoch});')
    cc = replace_once(cc, ' private:\n  std::unique_ptr<extensions::ExtensionUninstallDialog> theme_uninstall_;',
        ' private:\n' + observer + '\n  std::unique_ptr<extensions::ExtensionUninstallDialog> theme_uninstall_;')
    anchor = '    } else if (method == "navigate" && args.size() == 2 && args[1].is_string()) {'
    branch = '''    } else if ((method == "searchTab" || method == "createSearchTab" || method == "externalTab" || method == "navigateTab") && args.size() == 5 && args[1].is_string() &&
               args[2].is_string() && args[3].is_string() && args[4].is_string()) {
      auto* frame = tab->GetPrimaryMainFrame();
      const GURL committed = frame ? frame->GetLastCommittedURL() : GURL();
      const bool visible = BlancSearchVisibleMatches(tab->GetVisibleURL(), committed,
          !profile->IsOffTheRecord(), profile->IsIncognitoProfile() && profile->IsPrimaryOTRProfile());
      if (!frame || args[4].GetString() != base::NumberToString(owner->search_selection_epoch) || !BlancSearchIntentCurrent(index == model->active_index(),
              tab->GetController().GetPendingEntry() != nullptr, visible,
              base::NumberToString(frame->GetNavigationId()), args[2].GetString(),
              committed.spec(), args[3].GetString())) {
        reply(false, base::Value("The page changed before the search could start.")); return;
      }
      if (method == "navigateTab") {
        const GURL direct(args[1].GetString());
        if (!direct.is_valid() || !direct.SchemeIsHTTPOrHTTPS()) {
          reply(false, base::Value("This address cannot be opened.")); return;
        }
        StartObservedNavigation(id, tab, direct, ui::PAGE_TRANSITION_TYPED); return;
      }
      if (method == "externalTab") {
        const std::string& raw = args[1].GetString();
        const GURL external(raw);
        if (raw.empty() || raw.size() > 8192 ||
            std::ranges::any_of(raw, [](unsigned char c) {
              return c <= 0x20 || c == 0x7f || c == '\\\\' || c == '\\"' || c == '`';
            }) || !external.is_valid() || !(external.SchemeIs("mailto") ||
              external.SchemeIs("tel") || external.SchemeIs("facetime") || external.SchemeIs("sms"))) {
          reply(false, base::Value("This address cannot be opened.")); return;
        }
        const auto weak_self = weak_factory_.GetWeakPtr();
        tab->GetController().LoadURL(external, content::Referrer(), ui::PAGE_TRANSITION_TYPED, std::string());
        if (!weak_self) return;
        base::DictValue outcome; outcome.Set("status", "handoff-requested");
        reply(true, base::Value(std::move(outcome))); return;
      }
      std::u16string query16;
      if (!base::UTF8ToUTF16(args[1].GetString().data(), args[1].GetString().size(), &query16) ||
          base::TrimWhitespace(query16, base::TRIM_ALL).empty()) {
        reply(false, base::Value("Enter a search or address.")); return;
      }
      const auto weak_tab = tab->GetWeakPtr();
      const auto weak_self = weak_factory_.GetWeakPtr();
      const auto weak_browser = browser->GetWeakPtr();
      const auto weak_owner = owner->GetWeakPtr();
      const auto resolution = blanc::custom_search::ResolveCurrentSelectedShipping(profile, args[1].GetString());
      if (!weak_self || !weak_tab || !weak_browser || !weak_owner) return;
      auto* current_model = weak_browser->GetTabStripModel();
      frame = weak_tab->GetPrimaryMainFrame();
      if (!frame || !current_model || args[4].GetString() != base::NumberToString(weak_owner->search_selection_epoch) || current_model->GetActiveWebContents() != weak_tab.get() ||
          weak_tab->GetController().GetPendingEntry() ||
          base::NumberToString(frame->GetNavigationId()) != args[2].GetString() ||
          frame->GetLastCommittedURL().spec() != args[3].GetString()) {
        reply(false, base::Value("The page changed before the search could start.")); return;
      }
      if (resolution.status != blanc::custom_search::ShippingStatus::kReady || !resolution.url) {
        reply(false, base::Value("The selected search provider is loading or unavailable.")); return;
      }
      if (method == "createSearchTab") {
        const uint64_t start_epoch = weak_owner->search_selection_epoch;
        CreatedSearchTabCapture capture(current_model, weak_tab.get());
        auto* returned = chrome::AddAndReturnTabAt(weak_browser.get(), GURL("about:blank"), -1, true);
        if (!weak_self || !weak_browser || !weak_tab || !weak_owner) return;
        auto new_tab = capture.Match(returned);
        if (!new_tab || weak_owner->search_selection_epoch != start_epoch + 1) {
          reply(false, base::Value("The new search tab could not be opened.")); return;
        }
        StartObservedNavigation(id, new_tab.get(), GURL(*resolution.url), ui::PAGE_TRANSITION_GENERATED, true, weak_owner->search_selection_epoch);
        return;
      }
      StartObservedNavigation(id, weak_tab.get(), GURL(*resolution.url), ui::PAGE_TRANSITION_GENERATED);
      return;
'''
    cc = replace_once(cc, anchor, branch + anchor)
    cc = replace_once(cc, '''      chrome::AddTabAt(browser, url, -1, true);
      reply(true, base::Value());
      return;
    }
    // Group-level commands''', '''      const uint64_t start_epoch = owner->search_selection_epoch;
      const auto weak_owner = owner->GetWeakPtr();
      const auto weak_self = weak_factory_.GetWeakPtr();
      const auto weak_browser = browser->GetWeakPtr();
      CreatedSearchTabCapture capture(model, model->GetActiveWebContents());
      auto* returned = chrome::AddAndReturnTabAt(browser, url, -1, true);
      if (!weak_self || !weak_browser || !weak_owner) return;
      auto created = capture.Match(returned);
      if (!created || weak_owner->search_selection_epoch != start_epoch + 1) {
        reply(false, base::Value("The new tab could not be opened.")); return;
      }
      base::DictValue result; result.Set("status", "created");
      result.Set("tabId", sessions::SessionTabHelper::IdForTab(created.get()).id());
      result.Set("selectionEpoch", base::NumberToString(weak_owner->search_selection_epoch));
      reply(true, base::Value(std::move(result)));
      return;
    }
    // Group-level commands''')
    return cc

canonical = ex/'native/blanc_prototype_ui.cc'
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert digest(source)=='75a8c1f7dd6f7488b35350628883a022424dd46b5ea462670dd9265127626070', '158 source changed; review before regenerating'
assert digest(canonical)=='5dcf4c8046f748f3325f536c9ab4b8ff0a9a6e0d9033f8ecbc00be410e2ae697', 'canonical source changed; review before regenerating'
assert digest(host)=='e14ec051f395e3f1189ab8a637d01988b90fb88260cb7e6f8593091d734a167e', 'host changed; review before regenerating'
cc158 = build_cc(source.read_text())
cc_canonical = build_cc(canonical.read_text())
(here/'blanc_prototype_ui.candidate.cc').write_text(cc158)
(here/'blanc_prototype_ui.canonical-candidate.cc').write_text(cc_canonical)
start = js.index('  function destination(value) {')
end = js.index('\n  const implemented = {', start)
js = js[:start] + '''  function destination(value) {
    const text = String(value ?? '').trim();
    if (!text) throw new Error('Enter a search or address.');
    if (/^(?:mailto|tel|facetime|sms):/i.test(text)) {
      if (/[\\\\\\x00-\\x20\\x7f"`]/.test(text)) throw new Error('This address cannot be opened.');
      return { external: text };
    }
    if (/^(?:file:|[\\\\/]|\\.{1,2}[\\\\/]|~[\\\\/]|[a-z]:[\\\\/])/i.test(text))
      throw new Error('Local file addresses are not available yet.');
    if (/^https?:\\/\\//i.test(text)) return { url: text };
    if (/^[a-z][a-z0-9+.-]*:\\/\\//i.test(text))
      throw new Error('This address type is not available yet.');
    if (/^(?:localhost|(?:\\d{1,3}\\.){3}\\d{1,3})(?::\\d+)?(?:[/?#]|$)/i.test(text))
      return { url: `http://${text}` };
    if (/^\\[[0-9a-f:.%_-]+\\](?::\\d+)?(?:[/?#]|$)/i.test(text))
      return { url: `http://${text}` };
    if (/^(?:[0-9a-f]*:){2,}[0-9a-f:.%_-]*(?:[/?#]|$)/i.test(text))
      throw new Error('This address type is not available yet.');
    if (/^(?!\\.)[^\\s./?#:]+(?:\\.[^\\s./?#:]+)+(?::\\d+)?(?:[/?#][^\\s]*)?$/u.test(text))
      return { url: `https://${text}` };
    return { query: text };
  }
  async function searchCurrent(id, query, method = 'searchTab') {
    const tab = snapshot?.tabs.find(t => String(t.id) === String(id));
    if (!tab || String(snapshot.activeTabId) !== String(id) ||
        typeof tab.searchDocumentId !== 'string' || typeof tab.committedUrl !== 'string' || typeof snapshot.searchSelectionEpoch !== 'string')
      throw new Error('The page changed before the search could start.');
    return request(method, [nativeId(id), query, tab.searchDocumentId, tab.committedUrl, snapshot.searchSelectionEpoch]);
  }
''' + js[end:]
js = replace_once(js, "      await request('createTab', [url ? destination(url) : 'chrome://newtab/']);",
    "      const target = url ? destination(url) : { url: 'chrome://newtab/' };\n      const outcome = target.query ? await searchCurrent(snapshot?.activeTabId, target.query, 'createSearchTab') : target.external ? await searchCurrent(snapshot?.activeTabId, target.external, 'externalTab') : await request('createTab', [target.url]);")
js = replace_once(js, "      await refresh();\n      if (options?.focusAddress) await show('');\n    },\n    navigate:",
    "      try { await refresh(); } catch {}\n      if (options?.focusAddress) { try { await show(''); } catch {} }\n      return outcome;\n    },\n    navigate:")
js = replace_once(js, "    navigate: async (id, value) => { await request('navigate', [nativeId(id), destination(value)]); await refresh(); },\n    search: async (id, query) => {\n      await request('navigate', [nativeId(id), `https://www.google.com/search?q=${encodeURIComponent(query)}`]);\n      await refresh();\n    },",
    "    navigate: async (id, value) => { const target = destination(value); const outcome = target.query ? await searchCurrent(id, target.query) : target.external ? await searchCurrent(id, target.external, 'externalTab') : await searchCurrent(id, target.url, 'navigateTab'); try { await refresh(); } catch {} return outcome; },\n    search: async (id, query) => { const outcome = await searchCurrent(id, String(query ?? '').trim()); try { await refresh(); } catch {} return outcome; },")
(here/'host.candidate.js').write_text(js)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
(here/'preparation.json').write_text(json.dumps({'inputs':{str(source):sha(source),str(canonical):sha(canonical),str(host):sha(host)},'outputs':{str(here/'blanc_prototype_ui.candidate.cc'):sha(here/'blanc_prototype_ui.candidate.cc'),str(here/'blanc_prototype_ui.canonical-candidate.cc'):sha(here/'blanc_prototype_ui.canonical-candidate.cc'),str(here/'host.candidate.js'):sha(here/'host.candidate.js')}},indent=2)+'\n')
print('Prepared isolated native and host routing candidate; no production source staged')
