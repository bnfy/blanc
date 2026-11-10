// Native default-profile Spaces adapter. Included after SpaceDisk, where the
// checked store, stable window identities and native tab operations are visible.
class SharedNavigation final : public content::WebContentsObserver {
 public:
  SharedNavigation(content::WebContents* tab, GURL target, base::OnceCallback<void(bool)> done);
  ~SharedNavigation() override;
 private:
  void DidStopLoading() override;
  void WebContentsDestroyed() override;
  void Finish(bool ok);
  GURL target_;
  base::OnceCallback<void(bool)> done_;
  base::OneShotTimer timer_;
};
SharedNavigation::SharedNavigation(content::WebContents* tab, GURL target, base::OnceCallback<void(bool)> done)
    : content::WebContentsObserver(tab), target_(std::move(target)), done_(std::move(done)) {
  timer_.Start(FROM_HERE, base::Seconds(10), base::BindOnce(&SharedNavigation::Finish, base::Unretained(this), false));
}
SharedNavigation::~SharedNavigation() = default;
void SharedNavigation::Finish(bool ok) {
  timer_.Stop();
  if (done_) base::SingleThreadTaskRunner::GetCurrentDefault()->PostTask(FROM_HERE, base::BindOnce(std::move(done_), ok));
}
void SharedNavigation::DidStopLoading() {
  Finish(web_contents() && web_contents()->GetLastCommittedURL() == target_ &&
         web_contents()->GetController().GetLastCommittedEntry() &&
         web_contents()->GetController().GetLastCommittedEntry()->GetPageType() != content::PAGE_TYPE_ERROR);
}
void SharedNavigation::WebContentsDestroyed() {Finish(false);}

class DesktopSpaces final : public base::SupportsUserData::Data,
                            public blanc::DesktopSyncService::Observer {
 public:
  static DesktopSpaces* Get(Profile* profile) {
    static constexpr char key[] = "blanc.desktop.shared-spaces";
    auto* service = blanc::DesktopSyncService::ForProfile(profile);
    if (!service) return nullptr;
    if (!profile->GetUserData(key)) profile->SetUserData(key, std::make_unique<DesktopSpaces>(profile, service));
    return static_cast<DesktopSpaces*>(profile->GetUserData(key));
  }
  DesktopSpaces(Profile* profile, blanc::DesktopSyncService* service);
  ~DesktopSpaces() override;
  void Refresh() {
    if (pending_ || SessionRestore::IsRestoring(profile_) ||
        base::TimeTicks::Now() - refreshed_ < base::Seconds(1)) return;
    for (auto* owner : Owner::Live()) if (owner->browser->GetProfile() == profile_ &&
        (owner->space_busy || owner->space_expected)) return;
    pending_ = true; refreshed_ = base::TimeTicks::Now();
    SpaceRunner()->PostTaskAndReplyWithResult(FROM_HERE,
        base::BindOnce(&SpaceDisk, Path(), "sharedRecords", "", base::DictValue()),
        base::BindOnce(&DesktopSpaces::Loaded, weak_.GetWeakPtr()));
  }
  void Call(std::string method, std::string args, blanc::SyncCallback callback) {
    service_->Call("desktop.spaces." + method, std::move(args), std::move(callback));
  }
  // Called before the native metadata list changes. No renderer capture enters
  // Sync; metadata is limited to shipping's editable fields.
  void Metadata(const base::DictValue& next) {
    const auto& before = profile_->GetPrefs()->GetDict(kSpacesMetaPref);
    const auto* old_items = before.FindDict("items");
    const auto* items = next.FindDict("items");
    if (!old_items || !items) return;
    const auto* deleted = next.FindList("deleted");
    const auto* old_deleted = before.FindList("deleted");
    for (auto [id, value] : *items) {
      if (!value.is_dict() || !old_items->FindDict(id)) continue;
      base::DictValue patch;
      for (const char* key : {"name", "color", "symbol"}) {
        const auto* entry = value.GetDict().FindString(key);
        if (entry && entry->size() <= 120) patch.Set(key, *entry);
      }
      const bool removed = deleted && std::ranges::any_of(*deleted, [&](const auto& v) {return v.is_string() && v.GetString() == id;});
      const bool was_removed = old_deleted && std::ranges::any_of(*old_deleted, [&](const auto& v) {return v.is_string() && v.GetString() == id;});
      if (removed && !was_removed) {restoring_.erase(std::string(id)); patch.Set("deleted", true);}
      if (!removed && was_removed) restoring_.insert(std::string(id));
      if (!patch.empty()) Call("metadata", base::WriteJson(base::ListValue().Append(std::string(id)).Append(std::move(patch))).value(), base::DoNothing());
    }
    refreshed_ = base::TimeTicks();
  }
 private:
  base::FilePath Path() const {return profile_->GetPath().AppendASCII("BlancPrototypeSpaces.json");}
  Owner* Window(const std::string& id, const std::string& space) const {
    for (auto* owner : Owner::Live()) if (owner->browser->GetProfile() == profile_ &&
        WindowIdentity(owner->browser) == id && owner->space_name == space &&
        !owner->space_busy && !owner->space_expected) return owner;
    return nullptr;
  }
  static const base::Value* At(const base::DictValue& row, const char* key, size_t i) {
    const auto* list = row.FindList(key); return list && i < list->size() ? &(*list)[i] : nullptr;
  }
  base::DictValue Capture(Owner* owner, const base::DictValue& record) {
    base::ListValue urls, local_ids, tab_ids, meta, pins, group_ids, groups, policies, files;
    auto* model = owner ? owner->browser->GetTabStripModel() : nullptr;
    const auto* old = record.FindDict("sharedCapture");
    const auto* native_groups = record.FindList("groups");
    const auto native_order = model ? GroupsInOrder(model) : std::vector<tab_groups::TabGroupId>();
    for (size_t i = 0; native_groups && i < native_groups->size(); ++i) {
      const auto& g = (*native_groups)[i].GetDict();
      std::string local = i < native_order.size() ? native_order[i].ToString() : "saved-group-" + base::NumberToString(i);
      std::string id = group_bindings_.contains(local) ? group_bindings_.at(local) : local;
      if (!model && old) if (const auto* previous = At(*old, "groups", i); previous && previous->is_dict())
        if (const auto* saved = previous->GetDict().FindString("id")) id = *saved;
      groups.Append(base::DictValue().Set("id", id).Set("name", *g.FindString("name"))
          .Set("color", GroupColor(static_cast<tab_groups::TabGroupColorId>(g.FindInt("color").value_or(0))))
          .Set("collapsed", g.FindBool("collapsed").value_or(false)));
    }
    // Chromium has no visible empty group. Keep a received empty group's
    // metadata in the native capture until its first member materializes.
    const auto append_empty = [&](const std::string& id, const base::DictValue& group, bool fields) {
      if (std::ranges::any_of(groups, [&](const auto& v) {return *v.GetDict().FindString("id") == id;})) return;
      if (fields && group.FindBoolByDottedPath("deleted.v").value_or(false)) return;
      const auto* name = fields ? group.FindStringByDottedPath("name.v") : group.FindString("name");
      const auto* color = fields ? group.FindStringByDottedPath("color.v") : group.FindString("color");
      groups.Append(base::DictValue().Set("id", id).Set("name", name ? *name : "")
          .Set("color", color ? base::Value(*color) : base::Value())
          .Set("collapsed", fields ? group.FindBoolByDottedPath("collapsed.v").value_or(false) : group.FindBool("collapsed").value_or(false)));
    };
    if (old && old->FindList("groups")) for (const auto& value : *old->FindList("groups")) {
      const auto* id = value.GetDict().FindString("id");
      const auto* members = old->FindList("groupIds");
      if (id && (!members || !std::ranges::any_of(*members, [&](const auto& v) {return v.is_string() && v.GetString() == *id;})))
        append_empty(*id, value.GetDict(), false);
    }
    if (owner) for (auto [id, value] : group_records_[WindowIdentity(owner->browser) + ":" + owner->space_name])
      if (value.is_dict()) append_empty(std::string(id), value.GetDict(), true);
    std::vector<content::WebContents*> pages;
    if (model) for (int i = 0; i < model->count(); ++i)
      if (!blanc::private_tabs::IsPrivateTab(model->GetWebContentsAt(i))) pages.push_back(model->GetWebContentsAt(i));
    const auto* tabs = record.FindList("tabs");
    for (size_t i = 0; tabs && i < tabs->size(); ++i) {
      const auto& tab = (*tabs)[i].GetDict();
      auto* page = i < pages.size() ? pages[i] : nullptr;
      std::string local = page ? TabIdentity(page) : "";
      if (local.empty() && old) if (const auto* v = At(*old, "localIds", i); v && v->is_string()) local = v->GetString();
      std::string shared;
      if (!local.empty() && bindings_.contains(local)) shared = bindings_.at(local);
      if (shared.empty() && old) {
        const auto* locals = old->FindList("localIds");
        for (size_t j = 0; locals && j < locals->size(); ++j)
          if ((*locals)[j].is_string() && (*locals)[j].GetString() == local)
            if (const auto* v = At(*old, "tabIds", j); v && v->is_string()) shared = v->GetString();
        if (!page) if (const auto* v = At(*old, "tabIds", i); v && v->is_string()) shared = v->GetString();
      }
      if (!local.empty() && !shared.empty()) bindings_[local] = shared;
      urls.Append(*tab.FindString("url")); local_ids.Append(local);
      tab_ids.Append(shared.empty() ? base::Value() : base::Value(shared));
      base::DictValue metadata;
      if (old) if (const auto* v = At(*old, "meta", i); v && v->is_dict()) metadata = v->GetDict().Clone();
      if (page) {metadata.Set("title", base::UTF16ToUTF8(page->GetTitle())); metadata.Set("customTitle", CustomTabName(page));}
      meta.Append(std::move(metadata)); pins.Append(*tab.FindBool("pinned"));
      const int group = tab.FindInt("group").value_or(-1);
      group_ids.Append(group >= 0 && group < static_cast<int>(groups.size()) ?
          base::Value(*groups[group].GetDict().FindString("id")) : base::Value());
      policies.Append(tab.FindBool("inheritsDocumentPolicy").value_or(false)); files.Append(false);
    }
    auto out = base::DictValue().Set("urls", std::move(urls)).Set("localIds", std::move(local_ids))
        .Set("tabIds", std::move(tab_ids)).Set("meta", std::move(meta)).Set("pinned", std::move(pins))
        .Set("groups", std::move(groups)).Set("groupIds", std::move(group_ids))
        .Set("activeIndex", record.FindInt("active").value_or(0)).Set("documentPolicy", 1)
        .Set("inheritsDocumentPolicy", std::move(policies)).Set("localFiles", std::move(files));
    for (const char* key : {"splits", "splitIds"}) if (const auto* value = record.Find(key)) out.Set(key, value->Clone());
    return out;
  }
  void Loaded(base::DictValue result) {
    const auto* records = result.FindDict("records");
    if (!records) {pending_ = false; return;}
    disk_ = records->Clone();
    std::erase_if(group_records_, [&](const auto& entry) {
      for (auto* owner : Owner::Live()) if (owner->browser->GetProfile() == profile_ &&
          entry.first == WindowIdentity(owner->browser) + ":" + owner->space_name) return false;
      return true;
    });
    const auto& metadata = profile_->GetPrefs()->GetDict(kSpacesMetaPref);
    const auto* items = metadata.FindDict("items");
    const auto* order = metadata.FindList("order");
    base::ListValue rows, windows;
    if (items && order) for (const auto& id : *order) {
      if (!id.is_string()) continue;
      const auto* item = items->FindDict(id.GetString());
      const auto* record = records->FindDict(id.GetString());
      if (!item || !record) continue;
      auto row = Capture(nullptr, *record);
      for (auto [key, value] : *item) row.Set(key, value.Clone());
      row.Set("id", id.Clone());
      if (const auto* shared = record->FindDict("sharedCapture"))
        for (const char* key : {"sharedId", "sharedLink", "recoveredFrom"})
          if (const auto* value = shared->Find(key)) row.Set(key, value->Clone());
      for (auto* owner : Owner::Live()) if (owner->browser->GetProfile() == profile_ && owner->space_name == id.GetString()) {
        auto capture = CaptureNativeSpace(owner->browser);
        base::DictValue win;
        win.Set("id", WindowIdentity(owner->browser)); win.Set("workspaceId", id.Clone());
        if (capture && !owner->space_busy && !owner->space_expected) {
          if (const auto* saved = record->FindDict("sharedCapture")) capture->Set("sharedCapture", saved->Clone());
          auto current = Capture(owner, *capture);
          base::ListValue protected_ids;
          auto* model = owner->browser->GetTabStripModel();
          for (int i = 0; i < model->count(); ++i) {
            auto* tab = model->GetWebContentsAt(i);
            if (i == model->active_index() || tab->GetVisibility() == content::Visibility::VISIBLE ||
                TabIsCapturing(tab) || MainDocumentLoading(tab) || tab->NeedToFireBeforeUnloadOrUnloadEvents()) {
              const auto local = TabIdentity(tab);
              if (bindings_.contains(local)) protected_ids.Append(bindings_.at(local));
            }
          }
          win.Set("capture", current.Clone()); win.Set("protectedIds", std::move(protected_ids));
          for (auto [key, value] : current) row.Set(key, value.Clone());
        } else win.Set("holding", true);
        windows.Append(std::move(win));
      }
      // Resident pages are open too. Reconciliation must not replace their
      // capture; defer replay until their native window is shown again.
      if (auto* hold = SpaceHold::Get(profile_); hold && hold->Find(id.GetString()))
        windows.Append(base::DictValue().Set("id", "held:" + id.GetString()).Set("workspaceId", id.Clone()).Set("holding", true));
      rows.Append(std::move(row));
    }
    auto payload = base::DictValue().Set("revision", revision_).Set("rows", std::move(rows)).Set("windows", std::move(windows));
    if (!restoring_.empty()) {
      base::ListValue restoring;
      for (const auto& id : restoring_) restoring.Append(id);
      payload.Set("restoring", std::move(restoring));
    }
    Call("push", base::WriteJson(base::ListValue().Append(std::move(payload))).value(),
        base::BindOnce(&DesktopSpaces::Pushed, weak_.GetWeakPtr()));
  }
  void Pushed(bool ok, const std::string& json) {
    pending_ = false;
    auto result = ok ? base::JSONReader::ReadDict(json, base::JSON_PARSE_RFC) : std::nullopt;
    if (!result || result->FindBool("durable") == std::optional<bool>(false)) return;
    if (result->FindList("rows")) Library(*result);
  }
  void Library(const base::DictValue& value) {
    // Disk application below uses an exact prior-record compare. Never replace
    // a concurrent native edit or a currently open Space with a remote capture.
    const auto* rows = value.FindList("rows");
    if (!rows) return;
    base::DictValue replacements;
    auto meta = profile_->GetPrefs()->GetDict(kSpacesMetaPref).Clone();
    if (!meta.FindDict("items")) meta.Set("items", base::DictValue());
    if (!meta.FindList("order")) meta.Set("order", base::ListValue());
    for (const auto& value_row : *rows) {
      if (!value_row.is_dict()) return;
      const auto& row = value_row.GetDict();
      const auto* id = row.FindString("id");
      if (!id || id->empty() || id->size() > 120 || !row.FindList("urls")) return;
      bool open = false;
      for (auto* owner : Owner::Live()) if (owner->browser->GetProfile() == profile_ && owner->space_name == *id) open = true;
      if (auto* hold = SpaceHold::Get(profile_); hold && hold->Find(*id)) open = true;
      auto record = open && disk_.FindDict(*id) ? disk_.FindDict(*id)->Clone() : ToRecord(row);
      if (!ValidSpace(record)) return;
      record.Set("sharedCapture", row.Clone());
      auto replacement = base::DictValue().Set("after", std::move(record));
      if (const auto* before = disk_.Find(*id)) replacement.Set("before", before->Clone());
      replacements.Set(*id, std::move(replacement));
      base::DictValue item;
      if (const auto* old = meta.FindDict("items")->FindDict(*id)) item = old->Clone();
      for (const char* key : {"name", "color", "symbol", "sharedId", "sharedLink"})
        if (const auto* field = row.Find(key)) item.Set(key, field->Clone()); else item.Remove(key);
      item.Set("tabCount", static_cast<int>(row.FindList("urls")->size()));
      meta.FindDict("items")->Set(*id, std::move(item));
      if (!std::ranges::any_of(*meta.FindList("order"), [&](const auto& v) {return v.is_string() && v.GetString() == *id;}))
        meta.FindList("order")->Append(*id);
    }
    // A remote tombstone removes only a closed linked entry from the menu.
    // Retain its native checkpoint for Recently deleted and Undo.
    if (!meta.FindList("deleted")) meta.Set("deleted", base::ListValue());
    base::ListValue retained_order;
    for (const auto& id : *meta.FindList("order")) {
      if (!id.is_string()) continue;
      const auto* record = disk_.FindDict(id.GetString());
      const auto* shared = record ? record->FindDict("sharedCapture") : nullptr;
      const bool present = std::ranges::any_of(*rows, [&](const auto& r) {return r.is_dict() && r.GetDict().FindString("id") && *r.GetDict().FindString("id") == id.GetString();});
      bool open = false;
      for (auto* owner : Owner::Live()) if (owner->browser->GetProfile() == profile_ && owner->space_name == id.GetString()) open = true;
      if (auto* hold = SpaceHold::Get(profile_); hold && hold->Find(id.GetString())) open = true;
      if (!present && !open && !restoring_.contains(id.GetString()) && shared && shared->FindString("sharedId")) {
        if (!std::ranges::any_of(*meta.FindList("deleted"), [&](const auto& d) {return d == id;})) meta.FindList("deleted")->Append(id.Clone());
      } else retained_order.Append(id.Clone());
    }
    meta.Set("order", std::move(retained_order));
    const int revision = value.FindInt("revision").value_or(revision_);
    SpaceRunner()->PostTaskAndReplyWithResult(FROM_HERE,
        base::BindOnce(&SpaceDisk, Path(), "sharedSave", "", std::move(replacements)),
        base::BindOnce([](base::WeakPtr<DesktopSpaces> self, base::DictValue expected_meta, base::DictValue meta, int revision, base::ListValue restored, base::DictValue result) {
          if (!self || result.contains("error")) return;
          if (self->profile_->GetPrefs()->GetDict(kSpacesMetaPref) != expected_meta) return;
          self->profile_->GetPrefs()->SetDict(kSpacesMetaPref, std::move(meta));
          self->revision_ = revision;
          for (const auto& id : restored) if (id.is_string()) self->restoring_.erase(id.GetString());
          for (auto* owner : Owner::Live()) if (owner->browser->GetProfile() == self->profile_ && owner->view)
            owner->view->GetWebContents()->GetPrimaryMainFrame()->ExecuteJavaScript(u"window.BlancPrototypeHost?.spacesChanged()", base::NullCallback());
        }, weak_.GetWeakPtr(), profile_->GetPrefs()->GetDict(kSpacesMetaPref).Clone(), std::move(meta), revision, value.FindList("restored") ? value.FindList("restored")->Clone() : base::ListValue()));
  }
  static base::DictValue ToRecord(const base::DictValue& row) {
    base::ListValue tabs, groups;
    const auto* urls = row.FindList("urls");
    if (!urls) return {};
    const auto* source_groups = row.FindList("groups");
    std::map<std::string, int> group_index;
    if (source_groups) for (const auto& v : *source_groups) {
      if (!v.is_dict() || !v.GetDict().FindString("id")) continue;
      group_index[*v.GetDict().FindString("id")] = static_cast<int>(groups.size());
      groups.Append(base::DictValue().Set("name", v.GetDict().FindString("name") ? *v.GetDict().FindString("name") : "")
          .Set("color", 0).Set("collapsed", v.GetDict().FindBool("collapsed").value_or(false)));
    }
    for (size_t i = 0; i < urls->size(); ++i) {
      if (!(*urls)[i].is_string()) return {};
      const auto* group = At(row, "groupIds", i), *pin = At(row, "pinned", i), *policy = At(row, "inheritsDocumentPolicy", i);
      auto tab = base::DictValue().Set("url", (*urls)[i].Clone()).Set("pinned", pin && pin->is_bool() && pin->GetBool())
          .Set("group", group && group->is_string() && group_index.contains(group->GetString()) ? group_index.at(group->GetString()) : -1);
      if (policy && policy->is_bool() && policy->GetBool()) tab.Set("inheritsDocumentPolicy", true);
      tabs.Append(std::move(tab));
    }
    if (tabs.empty()) tabs.Append(base::DictValue().Set("url", "chrome://newtab/").Set("pinned", false).Set("group", -1));
    auto record = base::DictValue().Set("active", std::clamp(row.FindInt("activeIndex").value_or(0), 0, static_cast<int>(tabs.size()) - 1))
        .Set("tabs", std::move(tabs)).Set("groups", std::move(groups));
    for (const char* key : {"splits", "splitIds"}) if (const auto* value = row.Find(key)) record.Set(key, value->Clone());
    return record;
  }
  void Navigate(Owner* owner, const std::string& window, const std::string& space, int token, const base::DictValue& row) {
    const auto* id = row.FindString("id"), *url = row.FindStringByDottedPath("value.v.url");
    auto* model = owner->browser->GetTabStripModel();
    content::WebContents* tab = nullptr;
    if (id) for (int i = 0; i < model->count(); ++i) {
      const auto local = TabIdentity(model->GetWebContentsAt(i));
      if (bindings_.contains(local) && bindings_.at(local) == *id) tab = model->GetWebContentsAt(i);
    }
    if (!tab || !url || !GURL(*url).SchemeIsHTTPOrHTTPS() || GURL(*url).has_username() || GURL(*url).has_password() ||
        blanc::private_tabs::IsPrivateTab(tab) || HasInheritedDocumentPolicy(tab) || tab == model->GetActiveWebContents() ||
        tab->GetVisibility() == content::Visibility::VISIBLE || TabIsCapturing(tab) || tab->NeedToFireBeforeUnloadOrUnloadEvents() ||
        MainDocumentLoading(tab) || navigations_.size() >= 16) {Acknowledge(window, space, token, false); return;}
    if (tab->GetLastCommittedURL() == GURL(*url)) {Acknowledge(window, space, token, true); return;}
    navigations_[token] = std::make_unique<SharedNavigation>(tab, GURL(*url), base::BindOnce(
        [](base::WeakPtr<DesktopSpaces> self, std::string window, std::string space, int token, bool ok) {
          if (!self) return;
          self->navigations_.erase(token); self->Acknowledge(window, space, token, ok);
        }, weak_.GetWeakPtr(), window, space, token));
    content::NavigationController::LoadURLParams params{GURL(*url)};
    params.transition_type = ui::PAGE_TRANSITION_LINK;
    tab->GetController().LoadURLWithParams(params);
  }
  void Acknowledge(const std::string& window, const std::string& space, int token, bool ok) {
    auto* owner = Window(window, space);
    auto record = owner ? CaptureNativeSpace(owner->browser) : std::nullopt;
    if (!ok || !record) {
      blanc::SyncCall("desktop.spaces.rowDone", base::WriteJson(base::ListValue().Append(window).Append(space).Append(token).Append(false)).value(), base::DoNothing());
      return;
    }
    if (const auto* old = disk_.FindDict(space))
      if (const auto* saved = old->FindDict("sharedCapture")) record->Set("sharedCapture", saved->Clone());
    auto capture = Capture(owner, *record);
    auto saved = record->FindDict("sharedCapture") ? record->FindDict("sharedCapture")->Clone() : base::DictValue();
    for (auto [key, value] : capture) saved.Set(key, value.Clone());
    record->Set("sharedCapture", std::move(saved));
    auto change = base::DictValue().Set("after", record->Clone());
    if (const auto* before = disk_.Find(space)) change.Set("before", before->Clone());
    SpaceRunner()->PostTaskAndReplyWithResult(FROM_HERE,
        base::BindOnce(&SpaceDisk, Path(), "sharedSave", "", base::DictValue().Set(space, std::move(change))),
        base::BindOnce([](base::WeakPtr<DesktopSpaces> self, std::string window, std::string space, int token,
                         base::DictValue record, base::DictValue capture, base::DictValue result) {
          if (!self) return;
          const bool ok = !result.contains("error") && self->Window(window, space);
          if (ok) self->disk_.Set(space, std::move(record));
          // Bypass the waiting request, but retain the exact window/Space token.
          blanc::SyncCall("desktop.spaces.rowDone", base::WriteJson(base::ListValue().Append(window).Append(space)
              .Append(token).Append(ok).Append(std::move(capture))).value(), base::DoNothing());
        }, weak_.GetWeakPtr(), window, space, token, std::move(*record), std::move(capture)));
  }
  bool Layout(Owner* owner, const base::DictValue& value) {
    const auto* blob = value.FindDict("blob"), *records = blob ? blob->FindDict("tabs") : nullptr;
    const auto* order = value.FindList("order"), *groups = value.FindList("groups");
    const auto* blob_groups = blob ? blob->FindDict("groups") : nullptr;
    if (!records || !order || !groups || !blob_groups) return false;
    auto* model = owner->browser->GetTabStripModel();
    std::map<std::string, content::WebContents*> pages;
    for (int i = 0; i < model->count(); ++i) {
      auto* tab = model->GetWebContentsAt(i);
      const auto local = TabIdentity(tab);
      if (bindings_.contains(local)) pages[bindings_.at(local)] = tab;
    }
    // Never dismantle a local split to satisfy an incoming group/order edit.
    for (const auto& [id, tab] : pages) if (model->GetSplitForTab(model->GetIndexOfWebContents(tab))) return false;
    for (const auto& group_value : *groups) {
      if (!group_value.is_string()) continue;
      const auto& id = group_value.GetString();
      const auto* group = blob_groups->FindDict(id);
      if (!group) continue;
      std::vector<int> indices;
      for (const auto& [tab_id, page] : pages)
        if (const auto* record = records->FindDict(tab_id); record && record->FindStringByDottedPath("groupId.v") &&
            *record->FindStringByDottedPath("groupId.v") == id && !record->FindBoolByDottedPath("deleted.v").value_or(false) &&
            !model->IsTabPinned(model->GetIndexOfWebContents(page))) indices.push_back(model->GetIndexOfWebContents(page));
      if (indices.empty()) {group_records_[WindowIdentity(owner->browser) + ":" + owner->space_name].Set(id, group->Clone()); continue;}
      std::sort(indices.begin(), indices.end());
      std::optional<tab_groups::TabGroupId> native;
      for (const auto& local : GroupsInOrder(model))
        if (group_bindings_.contains(local.ToString()) && group_bindings_.at(local.ToString()) == id) native = local;
      if (native) model->AddToExistingGroup(indices, *native); else native = model->AddToNewGroup(indices);
      group_bindings_[native->ToString()] = id;
      group_records_[WindowIdentity(owner->browser) + ":" + owner->space_name].Remove(id);
      const auto* name = group->FindStringByDottedPath("name.v"), *color = group->FindStringByDottedPath("color.v");
      tab_groups::TabGroupColorId shade = kGroupColor;
      for (int i = 0; i <= 8; ++i) if (color && *color == GroupColor(static_cast<tab_groups::TabGroupColorId>(i))) shade = static_cast<tab_groups::TabGroupColorId>(i);
      model->ChangeTabGroupVisuals(*native, tab_groups::TabGroupVisualData(base::UTF8ToUTF16(name ? *name : ""), shade,
          group->FindBoolByDottedPath("collapsed.v").value_or(false)));
    }
    std::vector<int> slots;
    for (const auto& [id, tab] : pages) slots.push_back(model->GetIndexOfWebContents(tab));
    std::sort(slots.begin(), slots.end());
    size_t slot = 0;
    for (const auto& id : *order) {
      if (!id.is_string() || !pages.contains(id.GetString()) || slot >= slots.size()) continue;
      auto* tab = pages.at(id.GetString());
      const int at = model->GetIndexOfWebContents(tab), target = slots[slot++];
      if (at != target && model->IsTabPinned(at) == model->IsTabPinned(target)) model->MoveWebContentsAt(at, target, false);
    }
    for (const auto& [id, tab] : pages) {
      const auto* record = records->FindDict(id);
      const auto* group_id = record ? record->FindStringByDottedPath("groupId.v") : nullptr;
      const auto* group = group_id ? blob_groups->FindDict(*group_id) : nullptr;
      if (record && (!group || group->FindBoolByDottedPath("deleted.v").value_or(false)) &&
          model->GetTabGroupForTab(model->GetIndexOfWebContents(tab)))
        model->RemoveFromGroup({model->GetIndexOfWebContents(tab)});
    }
    return true;
  }
  void OnSyncEvent(const std::string& event, const std::string& json) override;
  bool ApplyRow(Owner* owner, const base::DictValue& row) {
    const auto* kind = row.FindString("kind"), *id = row.FindString("id"), *op = row.FindString("op");
    if (!kind || !id || !op) return false;
    if (*kind == "groups") {
      auto& group_records = group_records_[WindowIdentity(owner->browser) + ":" + owner->space_name];
      // A native group is materialized with its member tabs by Layout. Keep
      // its descriptor until then, including an empty group from another device.
      if (const auto* record = row.FindDict("record")) group_records.Set(*id, record->Clone());
      else if (const auto* field = row.FindString("field")) {
        if (!group_records.FindDict(*id)) group_records.Set(*id, base::DictValue());
        if (const auto* value = row.Find("value")) group_records.FindDict(*id)->Set(*field, value->Clone());
      }
      return true;
    }
    if (*kind != "tabs") return false;
    auto* model = owner->browser->GetTabStripModel();
    content::WebContents* tab = nullptr;
    for (int i = 0; i < model->count(); ++i) {
      auto* candidate = model->GetWebContentsAt(i);
      const auto local = TabIdentity(candidate);
      if (bindings_.contains(local) && bindings_.at(local) == *id) tab = candidate;
    }
    const auto* field = row.FindString("field");
    const auto* value = row.FindDict("value");
    if (*op == "create") {
      if (tab) return true;
      const auto* record = row.FindDict("record");
      const auto* nav = record ? record->FindDictByDottedPath("nav.v") : nullptr;
      const auto* url = nav ? nav->FindString("url") : nullptr;
      if (!url || !GURL(*url).SchemeIsHTTPOrHTTPS()) return false;
      sessions::tab_restore::Tab saved;
      sessions::SerializedNavigationEntry entry;
      entry.set_index(0); entry.set_virtual_url(GURL(*url));
      if (const auto* title = nav->FindString("title")) entry.set_title(base::UTF8ToUTF16(*title));
      saved.navigations.push_back(std::move(entry)); saved.current_navigation_index = 0;
      auto* live = BrowserLiveTabContext::From(owner->browser)->AddRestoredTab(saved, model->count(), false, false, sessions::tab_restore::TAB);
      if (!live) return false;
      for (int i = 0; i < model->count(); ++i) if (sessions::SessionTabHelper::IdForTab(model->GetWebContentsAt(i)) == live->GetSessionID()) tab = model->GetWebContentsAt(i);
      if (!tab) return false;
      bindings_[TabIdentity(tab)] = *id;
      if (const auto* name = record->FindStringByDottedPath("name.v")) RenameTab(owner->browser, tab, *name);
      model->SetTabPinned(model->GetIndexOfWebContents(tab), record->FindBoolByDottedPath("pinned.v").value_or(false));
      return true;
    }
    if (!tab) return *op == "close";
    const int at = model->GetIndexOfWebContents(tab);
    if (blanc::private_tabs::IsPrivateTab(tab) || HasInheritedDocumentPolicy(tab)) return false;
    if (*op == "close") {
      if (at == model->active_index() || tab->GetVisibility() == content::Visibility::VISIBLE || TabIsCapturing(tab) || tab->NeedToFireBeforeUnloadOrUnloadEvents()) return false;
      model->CloseWebContentsAt(at, TabCloseTypes::CLOSE_CREATE_HISTORICAL_TAB); return true;
    }
    if (!field || !value) return false;
    if (*field == "name") return RenameTab(owner->browser, tab, value->FindString("v") ? *value->FindString("v") : "");
    if (*field == "pinned" && value->FindBool("v")) {model->SetTabPinned(at, *value->FindBool("v")); return true;}
    if (*field == "groupId" || *field == "pos") return true;  // Layout applies the accepted record.
    // A navigation must be confirmed after it commits; never acknowledge a
    // load request or replace a protected page. Retain it for later replay.
    return false;
  }
  raw_ptr<Profile> profile_;
  raw_ptr<blanc::DesktopSyncService> service_;
  base::DictValue disk_;
  std::map<std::string, base::DictValue> group_records_;
  std::map<int, std::unique_ptr<SharedNavigation>> navigations_;
  std::map<std::string, std::string> bindings_, group_bindings_;
  int revision_ = 0;
  bool pending_ = false;
  std::set<std::string> restoring_;
  base::TimeTicks refreshed_;
  base::WeakPtrFactory<DesktopSpaces> weak_{this};
};

DesktopSpaces::DesktopSpaces(Profile* profile, blanc::DesktopSyncService* service)
    : profile_(profile), service_(service) {service_->AddObserver(this);}
DesktopSpaces::~DesktopSpaces() {service_->RemoveObserver(this);}
void DesktopSpaces::OnSyncEvent(const std::string& event, const std::string& json) {
    if (!base::StartsWith(event, "desktop-spaces-")) return;
    auto value = base::JSONReader::ReadDict(json, base::JSON_PARSE_RFC);
    if (!value) return;
    if (event == "desktop-spaces-library") {Library(*value); return;}
    const auto* window = value->FindString("windowId"), *space = value->FindString("workspaceId");
    if (!window || !space) return;
    auto* owner = Window(*window, *space);
    if (!owner) return;
    if (event == "desktop-spaces-layout") {Layout(owner, *value); return;}
    if (event == "desktop-spaces-deleted") {
      if (restoring_.contains(*space)) return;
      // Explicit remote deletion detaches the window, preserving every page
      // and its saved record for Undo. Reconciliation itself never removes it.
      auto meta = profile_->GetPrefs()->GetDict(kSpacesMetaPref).Clone();
      if (auto* order = meta.FindList("order")) order->EraseIf( [&](const auto& v) {return v.is_string() && v.GetString() == *space;});
      if (!meta.FindList("deleted")) meta.Set("deleted", base::ListValue());
      if (!std::ranges::any_of(*meta.FindList("deleted"), [&](const auto& v) {return v.is_string() && v.GetString() == *space;})) meta.FindList("deleted")->Append(*space);
      profile_->GetPrefs()->SetDict(kSpacesMetaPref, std::move(meta));
      owner->unbound_space = *space; owner->space_name.clear(); owner->space_saved.reset();
      return;
    }
    if (event == "desktop-spaces-bindings") {
      const auto* locals = value->FindList("localIds"), *shared = value->FindList("tabIds");
      if (locals && shared && locals->size() == shared->size()) for (size_t i = 0; i < locals->size(); ++i)
        if ((*locals)[i].is_string() && (*shared)[i].is_string()) bindings_[(*locals)[i].GetString()] = (*shared)[i].GetString();
      if (const auto* groups = value->FindDict("groupBindings")) for (auto [local, id] : *groups)
        if (id.is_string()) group_bindings_[std::string(local)] = id.GetString();
    }
    if (event == "desktop-spaces-row") {
      const auto* row = value->FindDict("row");
      const int token = value->FindInt("token").value_or(0);
      if (row && row->FindString("op") && *row->FindString("op") == "nav") Navigate(owner, *window, *space, token, *row);
      else {
        const auto* layout = value->FindDict("layout");
        auto* model = owner->browser->GetTabStripModel();
        bool can_layout = !value->FindBool("layoutRequired").value_or(false) || layout;
        if (layout) for (int i = 0; i < model->count(); ++i)
          if (model->GetSplitForTab(i)) can_layout = false;
        // Defer layout edits around a local split before changing any tab or
        // group descriptor. A successful receipt follows layout and disk save.
        bool ok = can_layout && row && ApplyRow(owner, *row);
        if (ok && layout) ok = Layout(owner, *layout);
        Acknowledge(*window, *space, token, ok);
      }
    }
  }
