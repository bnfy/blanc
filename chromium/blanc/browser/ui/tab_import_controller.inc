// Window-owned import controller. The renderer can request projections and
// submit opaque choices; filesystem paths and raw apply plans never cross it.
class TabImporter : public ui::SelectFileDialog::Listener {
 public:
  using Reply = base::OnceCallback<void(base::Value)>;
  explicit TabImporter(BrowserWindowInterface* browser);
  ~TabImporter() override;
  std::string Args(const std::string& operation, base::ListValue args) const {
    return base::WriteJson(base::ListValue().Append(owner_).Append(operation).Append(std::move(args))).value_or("[]");
  }
  void Call(const std::string& operation, base::ListValue args, Reply reply) {
    if (!browser_) {std::move(reply).Run(Error("profile-unavailable")); return;}
    const uint64_t generation = generation_;
    runner_.Call(Args(operation, std::move(args)), base::BindOnce(
        [](base::WeakPtr<TabImporter> self, uint64_t generation, Reply reply, bool ok, const std::string& text) {
          if (!self || generation != self->generation_) {std::move(reply).Run(Error("session-unavailable")); return;}
          auto value = ok ? base::JSONReader::Read(text, base::JSON_PARSE_RFC) : std::nullopt;
          std::move(reply).Run(value ? std::move(*value) : Error("import-unavailable"));
        }, weak_.GetWeakPtr(), generation, std::move(reply)));
  }
  static base::Value Error(const std::string& code) {return base::Value(base::DictValue().Set("error", code));}
  void Handle(std::string method, const base::ListValue& args, Reply reply) {
    if (method == "importDiscard") {
      ++generation_; sources_.clear(); applying_ = false;
      if (picker_) picker_->ListenerDestroyed(); picker_ = nullptr;
      if (picker_reply_) std::move(picker_reply_).Run(Error("session-unavailable"));
      runner_.Reset(); std::move(reply).Run(base::Value(base::DictValue().Set("ok", true))); return;
    }
    if (!browser_ || !browser_->GetProfile()->IsRegularProfile() || browser_->GetProfile()->IsOffTheRecord()) {std::move(reply).Run(Error("private-window")); return;}
    auto* active = browser_->GetTabStripModel()->GetActiveWebContents();
    if (active && active->GetBrowserContext()->IsOffTheRecord()) {std::move(reply).Run(Error("private-window")); return;}
#if BUILDFLAG(ENABLE_BLANC_TEST_HOOKS)
    if (method == "importDebug" && base::CommandLine::ForCurrentProcess()->HasSwitch("blanc-test") &&
        args.size() >= 1 && args[0].is_string()) {
      const auto& operation = args[0].GetString();
      if (operation == "reads") {std::move(reply).Run(base::Value(reads_)); return;}
      if (operation == "arc-reads") {std::move(reply).Run(base::Value(arc_reads_)); return;}
      if (operation == "has-arc") {Call("arcHasSession", {}, std::move(reply)); return;}
      if (operation == "fail-after" && args.size() == 2 && args[1].is_int()) {
        fail_after_ = args[1].GetInt(); std::move(reply).Run(base::Value(true)); return;
      }
      if (operation == "records") {
        SpaceRunner()->PostTaskAndReplyWithResult(FROM_HERE,
            base::BindOnce(&SpaceDisk, browser_->GetProfile()->GetPath().AppendASCII("BlancPrototypeSpaces.json"), "sharedRecords", "", base::DictValue()),
            base::BindOnce([](Reply reply, base::DictValue records) {std::move(reply).Run(base::Value(std::move(records)));}, std::move(reply))); return;
      }
    }
#endif
    if (applying_ && (method == "importApply" || method == "importArcApply" || method == "importOpenSource" || method == "importArcRead")) {
      std::move(reply).Run(Error("import-busy")); return;
    }
    if (method == "importSources" && args.empty()) {
      ++generation_; const auto generation = generation_;
      Call("discard", {}, base::BindOnce([](base::Value) {}));
      base::ThreadPool::PostTaskAndReplyWithResult(FROM_HERE, {base::MayBlock()}, base::BindOnce(&tab_import::Discover),
          base::BindOnce([](base::WeakPtr<TabImporter> self, uint64_t generation, Reply reply, std::vector<tab_import::Source> sources) {
            if (!self || generation != self->generation_) {std::move(reply).Run(Error("session-unavailable")); return;}
            for (auto& source : sources) {
              const auto old = std::ranges::find(self->sources_, source.path, &tab_import::Source::path);
              if (old != self->sources_.end()) source.id = old->id;
            }
            self->sources_ = std::move(sources); base::ListValue rows;
            for (const auto& source : self->sources_) rows.Append(base::DictValue().Set("id", source.id)
                .Set("browserId", source.browser_id).Set("browser", source.browser).Set("profile", source.profile)
                .Set("label", source.browser + " — " + source.profile));
            std::move(reply).Run(base::Value(base::DictValue().Set("sources", std::move(rows)).Set("unavailable", base::ListValue())));
          }, weak_.GetWeakPtr(), generation, std::move(reply))); return;
    }
    if (method == "importOpenSource" && args.size() == 2 && args[0].is_string() && args[1].is_dict()) {
      auto source = std::ranges::find(sources_, args[0].GetString(), &tab_import::Source::id);
      if (source == sources_.end()) {std::move(reply).Run(Error("source-unavailable")); return;}
      ++generation_;
      Call("discard", {}, base::BindOnce([](base::Value) {}));
      const bool after = args[1].GetDict().FindBool("afterQuit").value_or(false);
      const auto generation = generation_; const auto label = source->browser + " — " + source->profile;
      ++reads_;
      base::ThreadPool::PostTaskAndReplyWithResult(FROM_HERE, {base::MayBlock()}, base::BindOnce(&tab_import::ReadSource, source->path, after),
          base::BindOnce(&TabImporter::SourceRead, weak_.GetWeakPtr(), generation, label, after, std::move(reply))); return;
    }
    const std::map<std::string, std::string> commands = {{"importProject", "project"}, {"importSelection", "select"},
        {"importSuggest", "suggest"}, {"importCancel", "cancel"}, {"importArcCancel", "arcCancel"}};
    if (const auto found = commands.find(method); found != commands.end()) {Call(found->second, args.Clone(), std::move(reply)); return;}
    if (method == "importApply" && args.size() == 2 && args[0].is_string() && args[1].is_dict()) {
      base::ListValue names;
      auto* model = browser_->GetTabStripModel();
      for (const auto& id : GroupsInOrder(model)) names.Append(base::UTF16ToUTF8(GroupVisuals(model, id)->title()));
      auto request = args.Clone(); request.Append(std::move(names));
      applying_ = true;
      Call("plan", std::move(request), base::BindOnce(&TabImporter::ApplyTabs, weak_.GetWeakPtr(), args[0].GetString(), FinishApply(std::move(reply)))); return;
    }
    if (method == "importArcDetect" && args.empty()) {
      const auto path = tab_import::ArcPath();
      base::ThreadPool::PostTaskAndReplyWithResult(FROM_HERE, {base::MayBlock()},
          base::BindOnce([](base::FilePath path) {return path.empty() ? "unsupported" : base::PathExists(path) ? "found" : "missing";}, path),
          base::BindOnce([](Reply reply, const char* state) {std::move(reply).Run(base::Value(base::DictValue().Set("state", state)));}, std::move(reply))); return;
    }
    if (method == "importArcRead" && args.size() == 1 && args[0].is_string()) {
      if (picker_reply_) {std::move(reply).Run(Error("import-busy")); return;}
      ++generation_; Call("discard", {}, base::BindOnce([](base::Value) {}));
      if (args[0].GetString() == "arc") {ReadArc(tab_import::ArcPath(), "arc", std::move(reply)); return;}
      if (args[0].GetString() == "file" && !picker_reply_) {
        picker_reply_ = std::move(reply);
        picker_ = ui::SelectFileDialog::Create(this, nullptr);
        ui::SelectFileDialog::FileTypeInfo types; types.extensions = {{FILE_PATH_LITERAL("json")}};
        picker_->SelectFile(ui::SelectFileDialog::SELECT_OPEN_FILE, u"Choose StorableSidebar.json", {}, &types, 1,
            FILE_PATH_LITERAL("json"), browser_->GetWindow()->GetNativeWindow()); return;
      }
    }
    if (method == "importArcApply" && args.size() == 2 && args[0].is_string() && args[1].is_dict()) {
      auto request = args.Clone(); request.Append(SpaceNames()); request.Append(SpaceRoom());
      applying_ = true;
      Call("arcPlan", std::move(request), base::BindOnce(&TabImporter::ApplyArc, weak_.GetWeakPtr(), args[0].GetString(), FinishApply(std::move(reply)))); return;
    }
    std::move(reply).Run(Error("invalid-request"));
  }
  void FileSelected(const ui::SelectedFileInfo& file, int index) override;
  void FileSelectionCanceled() override;
  base::ListValue SpaceNames() const {
    base::ListValue names;
    if (browser_) if (const auto* items = browser_->GetProfile()->GetPrefs()->GetDict(kSpacesMetaPref).FindDict("items"))
      for (auto [id, value] : *items) if (value.is_dict()) if (const auto* name = value.GetDict().FindString("name")) names.Append(*name);
    return names;
  }
  int SpaceRoom() const {return std::max(0, 25 - static_cast<int>(SpaceNames().size()));}
  void ReadArc(base::FilePath path, std::string source, Reply reply) {
    if (path.empty()) {std::move(reply).Run(Error("missing")); return;}
    ++arc_reads_; const auto generation = generation_;
    base::ThreadPool::PostTaskAndReplyWithResult(FROM_HERE, {base::MayBlock()}, base::BindOnce(&tab_import::ReadStable, path, tab_import::kArcLimit),
        base::BindOnce([](base::WeakPtr<TabImporter> self, uint64_t generation, std::string source, Reply reply, tab_import::ReadResult read) {
          if (!self || generation != self->generation_) {std::move(reply).Run(Error("session-unavailable")); return;}
          if (!read.error.empty()) {std::move(reply).Run(Error(read.error)); return;}
          self->Call("arcOpen", base::ListValue().Append(std::move(read.bytes)).Append(source).Append(self->SpaceRoom()), std::move(reply));
        }, weak_.GetWeakPtr(), generation, std::move(source), std::move(reply)));
  }
  void SourceRead(uint64_t generation, std::string label, bool after_quit, Reply reply, tab_import::SourceRead read) {
    if (generation != generation_ || !browser_) {std::move(reply).Run(Error("session-unavailable")); return;}
    auto fallback = base::BindOnce([](base::WeakPtr<TabImporter> self, bool after, tab_import::SourceRead read, Reply reply, base::Value result) {
      if (!self || !result.is_dict() || !result.GetDict().contains("error") || after || !read.running || read.older.bytes.empty()) {
        std::move(reply).Run(std::move(result)); return;
      }
      self->Call("preflight", base::ListValue().Append(base::Base64Encode(read.older.bytes)), base::BindOnce(
          [](Reply reply, base::Value original, base::Value checked) {
            if (checked.is_dict() && checked.GetDict().FindBool("ok").value_or(false))
              std::move(reply).Run(base::Value(base::DictValue().Set("error", "source-locked").Set("recoverable", true)
                  .Set("recoverableTabCount", checked.GetDict().FindInt("count").value_or(0))));
            else std::move(reply).Run(std::move(original));
          }, std::move(reply), std::move(result)));
    }, weak_.GetWeakPtr(), after_quit, tab_import::SourceRead{{}, std::move(read.older), {}, read.running}, std::move(reply));
    if (!read.newest.error.empty()) {std::move(fallback).Run(Error(read.newest.error)); return;}
    Call("open", base::ListValue().Append(base::Base64Encode(read.newest.bytes)).Append(label), std::move(fallback));
  }
 private:
  Reply FinishApply(Reply reply) {
    return base::BindOnce([](base::WeakPtr<TabImporter> self, uint64_t generation, Reply reply, base::Value result) {
      if (self && self->generation_ == generation) self->applying_ = false;
      std::move(reply).Run(std::move(result));
    }, weak_.GetWeakPtr(), generation_, std::move(reply));
  }
  void ApplyTabs(std::string session, Reply reply, base::Value plan);
  void ApplyArc(std::string session, Reply reply, base::Value plan);
  base::WeakPtr<BrowserWindowInterface> browser_;
  std::string owner_ = base::Uuid::GenerateRandomV4().AsLowercaseString();
  uint64_t generation_ = 0;
  bool applying_ = false;
  std::vector<tab_import::Source> sources_;
  int reads_ = 0, arc_reads_ = 0;
#if BUILDFLAG(ENABLE_BLANC_TEST_HOOKS)
  int fail_after_ = -1;
#endif
  scoped_refptr<ui::SelectFileDialog> picker_;
  Reply picker_reply_;
  TabImportRunner runner_;
  base::WeakPtrFactory<TabImporter> weak_{this};
};
TabImporter::TabImporter(BrowserWindowInterface* browser) : browser_(browser->GetWeakPtr()) {}
TabImporter::~TabImporter() {
    if (picker_) picker_->ListenerDestroyed();

  }

void TabImporter::FileSelected(const ui::SelectedFileInfo& file, int) {
    if (picker_reply_) ReadArc(file.local_path, "file", std::move(picker_reply_));
  }
void TabImporter::FileSelectionCanceled() {if (picker_reply_) std::move(picker_reply_).Run(base::Value(base::DictValue().Set("cancelled", true)));}

void TabImporter::ApplyTabs(std::string session, Reply reply, base::Value plan) {
  if (!browser_ || !plan.is_dict()) {std::move(reply).Run(Error("session-unavailable")); return;}
  if (plan.GetDict().contains("error")) {std::move(reply).Run(std::move(plan)); return;}
  const auto* specs = plan.GetDict().FindList("tabs");
  if (!specs || specs->empty() || specs->size() > 500) {std::move(reply).Run(Error("invalid-proposal")); return;}
  auto* model = browser_->GetTabStripModel();
  auto* context = BrowserLiveTabContext::From(browser_.get());
  if (!context || model->closing_all()) {std::move(reply).Run(Error("window-unavailable")); return;}
  // Validate the complete plan before touching native models. The sandboxed
  // parser is not trusted to grant a navigation outside ordinary web pages.
  for (const auto& spec : *specs) {
    if (!spec.is_dict()) {std::move(reply).Run(Error("invalid-proposal")); return;}
    const auto* url = spec.GetDict().FindString("url");
    const auto* title = spec.GetDict().FindString("title");
    const auto* group = spec.GetDict().Find("groupName");
    if (!url || !GURL(*url).SchemeIsHTTPOrHTTPS() || url->size() > 16384 ||
        GURL(*url).has_username() || GURL(*url).has_password() || !title || title->size() > 4096 ||
        !spec.GetDict().FindBool("pinned") || !group || (!group->is_none() &&
        (!group->is_string() || GroupName(group->GetString()).empty()))) {std::move(reply).Run(Error("invalid-proposal")); return;}
  }
  std::vector<content::WebContents*> created;
  auto* active = model->GetActiveWebContents();
  const auto rollback = [&] {
    for (auto* tab : created) {
      const int index = model->GetIndexOfWebContents(tab);
      if (index >= 0) model->DetachWebContentsAtForInsertion(index).reset();
    }
    if (active && model->GetIndexOfWebContents(active) >= 0) model->ActivateTabAt(model->GetIndexOfWebContents(active));
  };
  for (const auto& value : *specs) {
    const auto& spec = value.GetDict();
    sessions::tab_restore::Tab saved;
    sessions::SerializedNavigationEntry nav;
    nav.set_index(0); nav.set_virtual_url(GURL(*spec.FindString("url")));
    nav.set_title(base::UTF8ToUTF16(*spec.FindString("title")));
    saved.navigations.push_back(std::move(nav)); saved.current_navigation_index = 0;
    // Logical pins preserve source order instead of moving to Chromium's
    // pinned prefix. They use the same persisted metadata as grouped pins.
    if (*spec.FindBool("pinned")) {
      saved.extra_data[kGroupPinKey] = "1";
      saved.extra_data[kPinnedHomeKey] = *spec.FindString("url");
    }
#if BUILDFLAG(ENABLE_BLANC_TEST_HOOKS)
    if (fail_after_ >= 0 && created.size() >= static_cast<size_t>(fail_after_)) {
      fail_after_ = -1; rollback(); std::move(reply).Run(Error("batch-failed")); return;
    }
#endif
    auto* live = context->AddRestoredTab(saved, model->count(), false, false, sessions::tab_restore::TAB);
    if (!live) {rollback(); std::move(reply).Run(Error("batch-failed")); return;}
    auto* tab = model->GetWebContentsAt(model->count() - 1);
    created.push_back(tab);
    if (sessions::SessionTabHelper::IdForTab(tab) != live->GetSessionID()) {rollback(); std::move(reply).Run(Error("batch-failed")); return;}
  }
  std::map<std::u16string, std::vector<int>> memberships;
  std::map<std::u16string, std::u16string> names;
  for (size_t i = 0; i < specs->size(); ++i) {
    if (const auto* name = (*specs)[i].GetDict().FindString("groupName")) {
      const auto normalized = GroupName(*name), key = base::i18n::ToLower(normalized);
      names.try_emplace(key, normalized); memberships[key].push_back(static_cast<int>(i));
    }
  }
  for (const auto& [key, positions] : memberships) {
    std::vector<int> indices;
    for (int position : positions) indices.push_back(model->GetIndexOfWebContents(created[position]));
    std::optional<tab_groups::TabGroupId> existing;
    for (const auto& id : GroupsInOrder(model))
      if (base::i18n::ToLower(GroupVisuals(model, id)->title()) == key) {existing = id; break;}
    if (existing) AddToPinnedGroup(model, indices, *existing);
    else {
      const auto group = NewPinnedGroup(model, indices);
      model->ChangeTabGroupVisuals(group, tab_groups::TabGroupVisualData(names.at(key), kGroupColor, false));
    }
  }
  model->ActivateTabAt(model->GetIndexOfWebContents(created.front()));
  created.front()->GetController().LoadIfNecessary();
  NoteChecklistTask(browser_->GetProfile(), "tabs");
  base::ListValue ids;
  for (auto* tab : created) ids.Append(base::NumberToString(sessions::SessionTabHelper::IdForTab(tab).id()));
  Call("cancel", base::ListValue().Append(session), base::BindOnce([](Reply reply, base::ListValue ids, base::Value) {
    std::move(reply).Run(base::Value(base::DictValue().Set("ok", true).Set("tabIds", std::move(ids))));
  }, std::move(reply), std::move(ids)));
}

// The Space record carries its import name in the same atomic write as its
// tabs. If the process ends before preferences are updated, the next metadata
// read completes the projection. Existing names (including renames) win.
void RecoverImportedSpaceNames(Profile* profile, const base::DictValue& records) {
  auto meta = profile->GetPrefs()->GetDict(kSpacesMetaPref).Clone();
  auto* items = meta.EnsureDict("items");
  auto* order = meta.EnsureList("order");
  bool changed = false;
  std::vector<std::pair<double, std::string>> ordered;
  for (auto [id, value] : records) if (value.is_dict())
    ordered.emplace_back(value.GetDict().FindDouble("importSequence").value_or(0), id);
  std::ranges::sort(ordered);
  for (const auto& [sequence, id] : ordered) {
    if (items->contains(id)) continue;
    const auto* record = records.FindDict(id);
    const auto* name = record->FindString("importName");
    if (!name || name->empty() || name->size() > 512) continue;
    items->Set(id, base::DictValue().Set("name", *name).Set("tabCount", static_cast<int>(record->FindList("tabs")->size()))); order->Append(id); changed = true;
  }
  if (changed) profile->GetPrefs()->SetDict(kSpacesMetaPref, std::move(meta));
}
void TabImporter::ApplyArc(std::string session, Reply reply, base::Value plan) {
  if (!browser_ || !plan.is_dict()) {std::move(reply).Run(Error("session-unavailable")); return;}
  if (plan.GetDict().contains("error")) {std::move(reply).Run(std::move(plan)); return;}
  const auto* spaces = plan.GetDict().FindList("spaces");
  const auto* favorites = plan.GetDict().FindList("favorites");
  if (!spaces || !favorites || spaces->size() > 25) {std::move(reply).Run(Error("invalid-plan")); return;}
  if (!favorites->empty() && !LoadedBookmarkModel(browser_->GetProfile())) {
    std::move(reply).Run(Error("storage-failed")); return;
  }
  base::DictValue records;
  base::ListValue names;
  for (const auto& value : *spaces) {
    if (!value.is_dict()) {std::move(reply).Run(Error("invalid-plan")); return;}
    const auto* name = value.GetDict().FindString("name");
    const auto* capture = value.GetDict().FindDict("capture");
    if (!name || name->empty() || name->size() > 512 || !capture) {std::move(reply).Run(Error("invalid-plan")); return;}
    const auto* urls = capture->FindList("urls"), *pins = capture->FindList("pinned"),
        *groups = capture->FindList("groups"), *group_ids = capture->FindList("groupIds"), *metadata = capture->FindList("meta");
    if (!urls || urls->empty() || urls->size() > 500 || !pins || pins->size() != urls->size() || !groups ||
        !group_ids || group_ids->size() != urls->size() || !metadata || metadata->size() != urls->size()) {
      std::move(reply).Run(Error("space-too-large")); return;
    }
    base::ListValue native_groups, native_tabs;
    std::map<std::string, int> indices;
    for (const auto& group : *groups) {
      if (!group.is_dict() || !group.GetDict().FindString("id") || !group.GetDict().FindString("name")) {std::move(reply).Run(Error("invalid-plan")); return;}
      indices[*group.GetDict().FindString("id")] = static_cast<int>(native_groups.size());
      native_groups.Append(base::DictValue().Set("name", *group.GetDict().FindString("name"))
          .Set("color", static_cast<int>(kGroupColor)).Set("collapsed", false));
    }
    for (size_t i = 0; i < urls->size(); ++i) {
      const auto& group = (*group_ids)[i];
      if (!(*urls)[i].is_string() || !(*pins)[i].is_bool() || !(*metadata)[i].is_dict() ||
          (!group.is_none() && (!group.is_string() || !indices.contains(group.GetString())))) {std::move(reply).Run(Error("invalid-plan")); return;}
      const auto* title = (*metadata)[i].GetDict().FindString("title");
      base::DictValue tab = base::DictValue().Set("url", (*urls)[i].GetString()).Set("pinned", (*pins)[i].GetBool())
          .Set("group", group.is_none() ? -1 : indices.at(group.GetString())).Set("title", title ? title->substr(0, 4096) : "");
      if ((*pins)[i].GetBool()) tab.Set("pinnedHomeUrl", (*urls)[i].GetString());
      native_tabs.Append(std::move(tab));
    }
    base::DictValue record = base::DictValue().Set("tabs", std::move(native_tabs)).Set("groups", std::move(native_groups)).Set("active", 0).Set("importName", *name).Set("importSequence", base::Time::Now().InMillisecondsFSinceUnixEpoch() + names.size() / 100.0);
    if (!ValidSpace(record)) {std::move(reply).Run(Error("invalid-plan")); return;}
    records.Set(base::Uuid::GenerateRandomV4().AsLowercaseString(), std::move(record)); names.Append(*name);
  }
  auto* profile = browser_->GetProfile();
  SpaceRunner()->PostTaskAndReplyWithResult(FROM_HERE,
      base::BindOnce(&SpaceDisk, profile->GetPath().AppendASCII("BlancPrototypeSpaces.json"), "importSpaces", "", records.Clone()),
      base::BindOnce([](base::WeakPtr<TabImporter> self, base::WeakPtr<Profile> profile, std::string session,
          Reply reply, base::DictValue records, base::ListValue names, base::ListValue favorites, int empty, int dropped, base::DictValue result) {
        if (result.contains("error")) {std::move(reply).Run(base::Value(std::move(result))); return;}
        if (!profile) {std::move(reply).Run(Error("profile-unavailable")); return;}
        RecoverImportedSpaceNames(profile.get(), records);
        for (auto* owner : Owner::Live()) {
          if (owner->browser->GetProfile() != profile.get() || !owner->view ||
              (self && self->browser_ == owner->browser)) continue;
          owner->view->GetWebContents()->GetPrimaryMainFrame()->ExecuteJavaScript(
              u"window.BlancPrototypeHost?.spacesChanged()", base::NullCallback());
        }
        base::ListValue entries;
        for (auto& favorite : favorites) if (favorite.is_dict()) {favorite.GetDict().Set("folder", "Arc"); entries.Append(std::move(favorite));}
        const auto imported = browser_import::ImportParsed(profile.get(), entries);
        // Space creation already committed; always report that result even if
        // Favorites became unavailable while the file write was running.
        int added = imported.is_dict() ? imported.GetDict().FindInt("added").value_or(0) : 0;
        int skipped = imported.is_dict() ? imported.GetDict().FindInt("skipped").value_or(0) : 0;
        if (self) self->Call("arcCancel", base::ListValue().Append(session), base::BindOnce([](base::Value) {}));
        std::move(reply).Run(base::Value(base::DictValue().Set("ok", true).Set("created", std::move(names))
            .Set("favoritesAdded", added).Set("favoritesSkipped", skipped).Set("emptyCount", empty).Set("droppedCount", dropped)));
      }, weak_.GetWeakPtr(), profile->GetWeakPtr(), std::move(session), std::move(reply), std::move(records), std::move(names), favorites->Clone(),
      plan.GetDict().FindInt("emptyCount").value_or(0), plan.GetDict().FindInt("droppedCount").value_or(0)));
}
