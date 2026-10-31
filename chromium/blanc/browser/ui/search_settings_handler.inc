// Settings → Search (S1.1). Only the bundled top-level settings document can
// read or change the search engine or suggestions. The engine lives in
// Chromium's search engine store, so chrome://settings/search and Blanc agree;
// this handler maps it to shipping's five engines and one Blanc-owned custom
// address, and validates every change as shipping's main process does
// (modules/custom_template.cc Apply).
class SearchSettingsHandler final : public content::WebUIMessageHandler {
 public:
  SearchSettingsHandler() = default;
  ~SearchSettingsHandler() override = default;
  void RegisterMessages() override;
 private:
  bool IsSettingsPage();
  void Handle(const base::ListValue& message);
  void Reply(const std::string& id, bool ok, base::Value value);
};
void SearchSettingsHandler::RegisterMessages() {
  web_ui()->RegisterMessageCallback("blancSearchSettings",
      base::BindRepeating(&SearchSettingsHandler::Handle, base::Unretained(this)));
}
bool SearchSettingsHandler::IsSettingsPage() {
  auto* frame = web_ui()->GetRenderFrameHost();
  return frame && frame == web_ui()->GetWebContents()->GetPrimaryMainFrame() &&
      frame->GetLastCommittedURL() ==
          GURL("chrome://blanc-prototype/blocking-settings.html");
}
void SearchSettingsHandler::Reply(const std::string& id, bool ok, base::Value value) {
  if (!IsSettingsPage() || !IsJavascriptAllowed()) return;
  web_ui()->CallJavascriptFunctionUnsafe("blancSearchSettingsReply", base::Value(id), base::Value(ok), value);
}
namespace {
TemplateURL* BlancCustomEngine(TemplateURLService* service) {
  return service->GetTemplateURLForKeyword(blanc::browser_api::kCustomKeyword);
}
// The shipping view of Chromium's selection: a stock engine, "custom" for
// Blanc's own entry, or "" for anything shipping has no name for.
blanc::custom_search::Settings CurrentSearch(TemplateURLService* service) {
  blanc::custom_search::Settings current;
  if (auto* custom = BlancCustomEngine(service))
    current.custom_template = blanc::browser_api::FromChromiumPattern(custom->url()).value_or("");
  const TemplateURL* selected = service->GetDefaultSearchProvider();
  if (!selected || service->IsExtensionControlledDefaultSearch()) return current;
  if (selected == BlancCustomEngine(service)) current.engine = "custom";
  else if (auto name = blanc::browser_api::StockName(selected->prepopulate_id()))
    current.engine = std::string(*name);
  return current;
}
}  // namespace
void SearchSettingsHandler::Handle(const base::ListValue& message) {
  if (!IsSettingsPage() || message.size() != 3 || !message[0].is_string() ||
      !message[1].is_string() || !message[2].is_list()) return;
  AllowJavascript();
  const std::string id = message[0].GetString();
  const std::string method = message[1].GetString();
  const auto& args = message[2].GetList();
  Profile* profile = Profile::FromWebUI(web_ui())->GetOriginalProfile();
  auto* service = TemplateURLServiceFactory::GetForProfile(profile);
  if (!service) { Reply(id, false, base::Value("Search settings are unavailable.")); return; }
  if (!service->loaded()) {
    service->Load();
    Reply(id, false, base::Value("Search settings are loading.")); return;
  }
  auto* prefs = profile->GetPrefs();
  const bool editable = !service->is_default_search_managed() &&
                        !service->IsExtensionControlledDefaultSearch();
  if (method == "set" && args.size() == 1 && args[0].is_dict()) {
    const auto& partial = args[0].GetDict();
    if (auto suggestions = partial.FindBool("searchSuggestions"))
      prefs->SetBoolean(prefs::kSearchSuggestEnabled, *suggestions);
    blanc::custom_search::Patch patch;
    if (const auto* engine = partial.FindString("searchEngine")) patch.engine = *engine;
    if (const auto* address = partial.FindString("searchEngineTemplate")) patch.custom_template = *address;
    const auto previous = CurrentSearch(service);
    const auto next = (patch.engine || patch.custom_template) && editable
        ? blanc::custom_search::Apply(previous, patch) : std::nullopt;
    if (next && next->custom_template != previous.custom_template && !next->custom_template.empty()) {
      // Representable addresses only; a refused one leaves the store as it was.
      auto pattern = blanc::browser_api::ToChromiumPattern(next->custom_template);
      auto checked = blanc::custom_search::Validate(next->custom_template);
      if (pattern && checked) {
        const std::u16string title = base::UTF8ToUTF16(checked->display_host);
        if (auto* custom = BlancCustomEngine(service)) {
          service->ResetTemplateURL(custom, title, blanc::browser_api::kCustomKeyword, *pattern);
        } else {
          TemplateURLData data;
          data.SetShortName(title);
          data.SetKeyword(blanc::browser_api::kCustomKeyword);
          data.SetURL(*pattern);
          service->Add(std::make_unique<TemplateURL>(data));
        }
      }
    }
    if (next) {
      if (next->engine == "custom") {
        if (auto* custom = BlancCustomEngine(service);
            custom && blanc::browser_api::FromChromiumPattern(custom->url()) == next->custom_template)
          service->SetUserSelectedDefaultSearchProvider(custom);
      } else if (auto stock = blanc::browser_api::StockPrepopulateId(next->engine)) {
        service->SetUserSelectedDefaultSearchProviderByPrepopulateId(*stock);
      }
    }
    prefs->CommitPendingWrite();
  } else if (method != "get" || !args.empty()) {
    Reply(id, false, base::Value("Invalid search setting.")); return;
  }
  const auto current = CurrentSearch(service);
  base::DictValue state;
  state.Set("searchEngine", current.engine);
  state.Set("searchEngineTemplate", current.custom_template);
  state.Set("searchSuggestions", prefs->GetBoolean(prefs::kSearchSuggestEnabled));
  state.Set("editable", editable);
  Reply(id, true, base::Value(std::move(state)));
}
