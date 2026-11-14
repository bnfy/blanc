// Authorized only for this exact top-level bundled Settings document.
class BangSettingsHandler final : public content::WebUIMessageHandler {
 public:
  BangSettingsHandler();
  ~BangSettingsHandler() override;
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
    ++change_epoch_;
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
      base::DictValue result;result.Set("enabled",state->enabled);result.Set("custom",std::move(custom));result.Set("language",ActiveInterfaceLanguageSetting());
      Reply(id,true,base::Value(std::move(result)));return;
    }
    if (write_pending_) { Reply(id,false,base::Value("A Bang change is still being checked.")); return; }
    // Share the lease across Settings windows and hold it until the disk
    // callback is completed or discarded, including when this view closes.
    static base::NoDestructor<blanc::bangs::draft::BangWriteGate<base::FilePath>> write_gate;
    auto lease=write_gate->Acquire(profile->GetOriginalProfile()->GetPath());
    if (!lease) { Reply(id,false,base::Value("A Bang change is still being checked.")); return; }
    write_pending_ = true;
    const char* prior_key = method=="setEnabled" ? blanc::bangs::draft::kBangEnabled : blanc::bangs::draft::kBangCustom;
    std::optional<base::Value> previous;
    if (const auto* prior=prefs->GetUserPrefValue(prior_key)) previous.emplace(prior->Clone());
    auto owner = profile->GetOriginalProfile()->GetWeakPtr();
    auto self = weak_factory_.GetWeakPtr();
    const uint64_t begin_epoch=change_epoch_;
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
    if (!self || !owner) return;
    if(status!=CustomMutation::kChanged){
      write_pending_ = false;
      const char* reason=status==CustomMutation::kDuplicate ? "duplicate" : status==CustomMutation::kLimit ? "limit" : status==CustomMutation::kUnavailable ? "unavailable" : status==CustomMutation::kNotFound ? "not-found" : "invalid";
      Reply(id,false,base::Value(reason));return;
    }
    // More than one notification during a mutation means another writer may
    // have reentered; neither confirmation nor rollback can claim ownership.
    if (change_epoch_ - begin_epoch > 1) {
      write_pending_ = false;
      Reply(id,false,base::Value("Could not confirm this Bang change. Check the saved value before retrying."));
      return;
    }
    const auto key = method=="setEnabled" ? blanc::bangs::draft::SavedBangPref::kEnabled : blanc::bangs::draft::SavedBangPref::kCustom;
    const char* pref_key = key==blanc::bangs::draft::SavedBangPref::kEnabled ? blanc::bangs::draft::kBangEnabled : blanc::bangs::draft::kBangCustom;
    const auto* expected = owner->GetPrefs()->GetUserPrefValue(pref_key);
    if (!expected) { write_pending_ = false; Reply(id,false,base::Value("Could not confirm this Bang change. Check the saved value before retrying.")); return; }
    owner->GetPrefs()->CommitPendingWrite(base::BindOnce(&BangSettingsHandler::WriteBarrier,
        weak_factory_.GetWeakPtr(), id, owner, key, std::move(lease), expected->Clone(), std::move(previous), change_epoch_));
  }
  void WriteBarrier(std::string id, base::WeakPtr<Profile> owner,
                    blanc::bangs::draft::SavedBangPref key,
                    std::shared_ptr<blanc::bangs::draft::BangWriteGate<base::FilePath>::Lease> lease, base::Value expected,
                    std::optional<base::Value> previous, uint64_t expected_epoch) {
    if (!owner) { write_pending_ = false; Reply(id,false,base::Value("Could not confirm this Bang change. Check the saved value before retrying.")); return; }
    const auto path=owner->GetPath().AppendASCII("Preferences");
    std::optional<base::Value> callback_previous;
    if (previous) callback_previous.emplace(previous->Clone());
    const bool posted=base::ThreadPool::PostTaskAndReplyWithResult(FROM_HERE, {base::MayBlock()},
        base::BindOnce(&blanc::bangs::draft::ConfirmBangPrefOnDisk, path, key, expected.Clone()),
        base::BindOnce(&BangSettingsHandler::WriteChecked, weak_factory_.GetWeakPtr(), id, owner, key, lease, expected.Clone(), std::move(callback_previous), expected_epoch));
    if (!posted) {
      auto self=weak_factory_.GetWeakPtr();
      blanc::bangs::draft::RestoreBangPrefIfUnchanged(owner->GetPrefs(), key, expected, previous, expected_epoch, change_epoch_);
      if (self) { write_pending_ = false; Reply(id,false,base::Value("Could not confirm this Bang change. Check the saved value before retrying.")); }
    }
  }
  void WriteChecked(std::string id, base::WeakPtr<Profile> owner,
                    blanc::bangs::draft::SavedBangPref key,
                    std::shared_ptr<blanc::bangs::draft::BangWriteGate<base::FilePath>::Lease> lease, base::Value expected,
                    std::optional<base::Value> previous, uint64_t expected_epoch, bool on_disk) {
    const char* pref_key=key==blanc::bangs::draft::SavedBangPref::kEnabled ? blanc::bangs::draft::kBangEnabled : blanc::bangs::draft::kBangCustom;
    const auto* current=owner ? owner->GetPrefs()->GetUserPrefValue(pref_key) : nullptr;
    const bool confirmed=on_disk && current && *current==expected && expected_epoch==change_epoch_;
    auto self=weak_factory_.GetWeakPtr();
    if (!confirmed && owner)
      blanc::bangs::draft::RestoreBangPrefIfUnchanged(owner->GetPrefs(), key, expected, previous, expected_epoch, change_epoch_);
    if (!self) return;
    write_pending_ = false;
    Reply(id,confirmed,confirmed ? base::Value(true) : base::Value("Could not confirm this Bang change. Check the saved value before retrying."));
  }
  PrefChangeRegistrar observer_;
  bool write_pending_ = false;
  uint64_t change_epoch_ = 0;
  base::WeakPtrFactory<BangSettingsHandler> weak_factory_{this};
};

BangSettingsHandler::BangSettingsHandler() = default;
BangSettingsHandler::~BangSettingsHandler() = default;
void BangSettingsHandler::RegisterMessages() {
  web_ui()->RegisterMessageCallback("blancBangSettings", base::BindRepeating(&BangSettingsHandler::Handle, base::Unretained(this)));
}
void BangSettingsHandler::OnJavascriptDisallowed() { weak_factory_.InvalidateWeakPtrs(); write_pending_ = false; observer_.Reset(); }
