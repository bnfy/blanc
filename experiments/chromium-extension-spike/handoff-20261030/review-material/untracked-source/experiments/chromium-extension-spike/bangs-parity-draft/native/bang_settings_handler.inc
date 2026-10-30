// Authorized only for this exact top-level bundled Settings document.
// Freeze the approved Local State choice for this browser process. If the
// language feature is not registered, retain system-language behavior.
std::string ActiveBangInterfaceLanguage() {
  static base::NoDestructor<std::optional<std::string>> active;
  if (!*active) {
    auto* prefs = g_browser_process ? g_browser_process->local_state() : nullptr;
    if (!prefs || !prefs->FindPreference("blanc.prototype.ui_language")) return "system";
    const auto value = prefs->GetString("blanc.prototype.ui_language");
    *active = (value=="en" || value=="de" || value=="es" || value=="fr" || value=="it" || value=="pt-BR") ? value : "system";
  }
  return **active;
}
class BangSettingsHandler final : public content::WebUIMessageHandler {
 public:
  void RegisterMessages() override;
  void OnJavascriptDisallowed() override;
 private:
  bool IsSettingsPage() {
    auto* frame=web_ui()->GetRenderFrameHost();
    return frame && frame==web_ui()->GetWebContents()->GetPrimaryMainFrame() &&
      frame->GetLastCommittedURL()==GURL("chrome://blanc-prototype/bang-settings.html");
  }
  void Reply(const std::string& id,bool ok,base::Value value) {
    if(IsSettingsPage() && IsJavascriptAllowed())
      web_ui()->CallJavascriptFunctionUnsafe("blancBangSettingsReply",base::Value(id),base::Value(ok),value);
  }
  void Changed() {
    if(IsSettingsPage() && IsJavascriptAllowed())
      web_ui()->CallJavascriptFunctionUnsafe("blancBangSettingsChanged");
  }
  static std::optional<std::u16string> Units(const base::Value& value,size_t limit) {
    const auto* values=value.GetIfList(); if(!values || values->size()>limit)return std::nullopt;
    std::u16string out; out.reserve(values->size());
    for(const auto& unit:*values){auto n=unit.GetIfInt();if(!n||*n<0||*n>65535)return std::nullopt;out.push_back(static_cast<char16_t>(*n));}
    return out;
  }
  static base::ListValue ToUnits(std::u16string_view text) {
    base::ListValue out;for(char16_t c:text)out.Append(static_cast<int>(c));return out;
  }
  void Handle(const base::ListValue& message) {
    if(!IsSettingsPage() || message.size()!=3 || !message[0].is_string() ||
       !message[1].is_string() || !message[2].is_list())return;
    const std::string id=message[0].GetString(), method=message[1].GetString();
    const auto& args=message[2].GetList();auto* profile=Profile::FromWebUI(web_ui());
    auto state=blanc::bangs::draft::ReadProfileBangPrefs(profile);AllowJavascript();
    if(!state){Reply(id,false,base::Value("Bang settings are unavailable."));return;}
    auto* prefs=profile->GetOriginalProfile()->GetPrefs();
    if(!observer_.prefs()) {
      observer_.Init(prefs);
      for(const char* key:{blanc::bangs::draft::kBangEnabled,blanc::bangs::draft::kBangCustom})
        observer_.Add(key,base::BindRepeating(&BangSettingsHandler::Changed,base::Unretained(this)));
    }
    if(method=="get" && args.empty()) {
      base::ListValue custom;for(const auto& row:state->custom){base::DictValue value;
        value.Set("code",row.code);value.Set("nameUnits",ToUnits(row.name));value.Set("templateUnits",ToUnits(row.template_url));custom.Append(std::move(value));}
      base::DictValue result;result.Set("enabled",state->enabled);result.Set("custom",std::move(custom));result.Set("language",ActiveBangInterfaceLanguage());
      Reply(id,true,base::Value(std::move(result)));return;
    }
    using blanc::bangs::draft::CustomMutation;
    CustomMutation status=CustomMutation::kInvalid;
    if(method=="setEnabled" && args.size()==1 && args[0].is_bool()) {
      if(blanc::bangs::draft::SetProfileBangEnabled(profile,args[0].GetBool())) status=CustomMutation::kChanged;
      else status=CustomMutation::kUnavailable;
    } else if(method=="add" && args.size()==3) {
      auto code=Units(args[0],32),name=Units(args[1],60),templ=Units(args[2],2048);
      if(code && name && templ)status=blanc::bangs::draft::AddProfileCustomBang(profile,{std::move(*code),std::move(*name),std::move(*templ)});
    } else if(method=="remove" && args.size()==1 && args[0].is_string()) {
      status=blanc::bangs::draft::RemoveProfileCustomBang(profile,args[0].GetString());
    }
    if(status!=CustomMutation::kChanged){
      const char* reason=status==CustomMutation::kDuplicate ? "duplicate" : status==CustomMutation::kLimit ? "limit" : status==CustomMutation::kUnavailable ? "unavailable" : status==CustomMutation::kNotFound ? "not-found" : "invalid";
      Reply(id,false,base::Value(reason));return;
    }
    prefs->CommitPendingWrite();Reply(id,true,base::Value(true));
  }
  PrefChangeRegistrar observer_;
};

void BangSettingsHandler::RegisterMessages() {
  web_ui()->RegisterMessageCallback("blancBangSettings", base::BindRepeating(&BangSettingsHandler::Handle, base::Unretained(this)));
}
void BangSettingsHandler::OnJavascriptDisallowed() { observer_.Reset(); }
