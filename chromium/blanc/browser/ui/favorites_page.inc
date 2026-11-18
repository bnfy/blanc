// The Favorites page in its own tab (F63; owner, November 18, 2026): the
// shipping page at chrome://blanc-prototype/pages/bookmarks.html, whose
// window.bowserPages (pages/favorites-adapter.js) is answered here from
// Chromium's bookmark model through favorites_page:: (utility_sheet_ops.inc).
// It answers only that exact page in the main frame of a regular profile's
// tab; anything else gets no reply.
class FavoritesHandler : public content::WebUIMessageHandler,
                         public bookmarks::BaseBookmarkModelObserver {
 public:
  FavoritesHandler();
  FavoritesHandler(const FavoritesHandler&) = delete;
  FavoritesHandler& operator=(const FavoritesHandler&) = delete;
  ~FavoritesHandler() override;

  void RegisterMessages() override;
  void OnJavascriptDisallowed() override;

 private:
  // The page's profile, or null when this document isn't the Favorites page
  // of a regular profile's tab.
  Profile* PageProfile() {
    auto* frame = web_ui()->GetRenderFrameHost();
    auto* profile = Profile::FromWebUI(web_ui());
    if (!profile || profile->IsOffTheRecord() || !frame ||
        frame != web_ui()->GetWebContents()->GetPrimaryMainFrame() ||
        !IsFavoritesPage(frame->GetLastCommittedURL()))
      return nullptr;
    return profile;
  }
  void Reply(const std::string& id, bool ok, base::Value value) {
    if (!PageProfile() || !IsJavascriptAllowed()) return;
    web_ui()->CallJavascriptFunctionUnsafe("blancFavoritesReply", base::Value(id), base::Value(ok), value);
  }
  void Answer(const std::string& id, base::Value value) { Reply(id, true, std::move(value)); }
  void Notify(const char* kind) {
    if (!PageProfile() || !IsJavascriptAllowed()) return;
    web_ui()->CallJavascriptFunctionUnsafe("blancFavoritesEvent", base::Value(kind));
  }
  // shipping's pages:bookmarks:changed: any change, here or elsewhere (the
  // heart, /save, Sync, another window). Favicons arrive in bursts, so the
  // notices are coalesced.
  void BookmarkModelChanged() override;
  void NotifyBookmarks() { Notify("bookmarks"); }
  void BookmarkNodeFaviconChanged(const bookmarks::BookmarkNode*) override;
  void BookmarkModelBeingDeleted() override;
  void PinsChanged() { Notify("pins"); }

  void Handle(const base::ListValue& message) {
    Profile* profile = PageProfile();
    if (!profile || message.size() != 3 || !message[0].is_string() || !message[1].is_string() ||
        !message[2].is_list())
      return;
    AllowJavascript();
    const std::string id = message[0].GetString();
    const std::string method = message[1].GetString();
    const auto& args = message[2].GetList();
    const auto arg = [&args](size_t i) { return i < args.size() ? args[i].Clone() : base::Value(); };
    auto* model = BookmarkModelFactory::GetForBrowserContext(profile);
    if (model && !bookmark_observation_.IsObserving()) bookmark_observation_.Observe(model);
    auto* prefs = profile->GetPrefs();
    if (prefs && prefs->FindPreference(kStartPagePinsPref) && pins_observer_.IsEmpty()) {
      pins_observer_.Init(prefs);
      pins_observer_.Add(kStartPagePinsPref, base::BindRepeating(
          &FavoritesHandler::PinsChanged, base::Unretained(this)));
    }

    // The page's other surfaces: the sheet's pages and the tab import, from
    // its links and its "Open tabs" choice.
    if (method == "openSheet" && args.size() == 1 && args[0].is_string()) {
      const std::string page = args[0].GetString();
      auto* browser = GlobalBrowserCollection::GetInstance()->FindBrowserWithTab(web_ui()->GetWebContents());
      const bool known = page == "history" || page == "downloads" || page == "settings" || page == "tab-import";
      Reply(id, true, base::Value(known && browser && OpenUtilitySheet(browser, page)));
      return;
    }
    if ((method == "pinsList" && args.empty()) ||
        (method == "pinsPin" && args.size() == 2 && args[0].is_string() && args[1].is_string()) ||
        (method == "pinsUnpin" && args.size() == 1 && args[0].is_string())) {
      if (!prefs || !prefs->FindPreference(kStartPagePinsPref)) {
        Reply(id, false, base::Value("Start Page pins unavailable")); return;
      }
      if (method == "pinsList") { Reply(id, true, base::Value(utility_sheet::Pins(prefs))); return; }
      Reply(id, true, ChangeStartPin(prefs, method == "pinsPin", args[0].GetString(),
                                     method == "pinsPin" ? args[1].GetString() : std::string()));
      return;
    }
    if (method == "capabilities" && args.empty()) {
      Reply(id, true, base::Value(base::DictValue()
          .Set("editable", CanEditFavorites(profile)).Set("tree", true)
          .Set("import", CanEditFavorites(profile))));
      return;
    }
    if (!model || !model->loaded()) {
      // Chromium loads the model at startup; the page asks again on the
      // change notice that follows the load.
      if (method == "tree") {
        Reply(id, true, base::Value(base::DictValue().Set("path", base::Value()).Set("name", "")
            .Set("key", "").Set("children", base::ListValue())));
      } else if (method == "list") {
        Reply(id, true, base::Value(base::ListValue()));
      } else {
        Reply(id, false, base::Value("Favorites are still loading."));
      }
      return;
    }
    if (method == "tree" && args.empty()) { Reply(id, true, base::Value(favorites_page::Tree(model))); return; }
    if (method == "list" && args.empty()) { Reply(id, true, base::Value(ListFavorites(model))); return; }
    if (method == "clearFavicon") { Reply(id, true, base::Value()); return; }
    // Every change below, imports included, needs Favorites editing
    // (Chromium's policy).
    if (!CanEditFavorites(profile)) { Reply(id, false, base::Value("Favorites editing is disabled.")); return; }
    if (method == "browserSources" && args.empty()) {
      browser_import::ListSources(base::BindOnce(&FavoritesHandler::Answer, weak_factory_.GetWeakPtr(), id));
      return;
    }
    if (method == "importBrowser" && args.size() == 1 && args[0].is_string()) {
      browser_import::ImportSource(profile->GetWeakPtr(), args[0].GetString(),
          base::BindOnce(&FavoritesHandler::Answer, weak_factory_.GetWeakPtr(), id));
      return;
    }
    if (method == "importEntries" && args.size() == 1 && args[0].is_list()) {
      Reply(id, true, browser_import::ImportParsed(profile, args[0].GetList()));
      return;
    }
    base::DictValue result;
    if (method == "createFolder") result = favorites_page::CreateFolder(model, arg(0), arg(1));
    else if (method == "renameFolder") result = favorites_page::RenameFolder(model, arg(0), arg(1));
    else if (method == "removeFolder") result = favorites_page::RemoveFolder(model, arg(0));
    else if (method == "moveFolder") result = favorites_page::MoveFolder(model, arg(0), arg(1));
    else if (method == "move") result = favorites_page::MoveFavorites(model, arg(0), arg(1));
    else if (method == "reorder") result = favorites_page::Reorder(model, arg(0), arg(1));
    else if (method == "removeMany") result = favorites_page::RemoveFavorites(model, arg(0));
    else if (method == "remove") {
      base::ListValue ids;
      ids.Append(arg(0));
      result = favorites_page::RemoveFavorites(model, base::Value(std::move(ids)));
    } else if (method == "edit") result = favorites_page::EditFavorite(model, prefs, arg(0), arg(1));
    else if (method == "setFolder") result = favorites_page::SetFolder(model, arg(0), arg(1));
    else { Reply(id, false, base::Value("Unknown Favorites request.")); return; }
    Reply(id, true, base::Value(std::move(result)));
  }

  base::ScopedObservation<bookmarks::BookmarkModel, bookmarks::BookmarkModelObserver>
      bookmark_observation_{this};
  PrefChangeRegistrar pins_observer_;
  base::OneShotTimer changed_;
  base::WeakPtrFactory<FavoritesHandler> weak_factory_{this};
};

// Out of line: Chromium's style checker reads this file as a header.
FavoritesHandler::FavoritesHandler() = default;
FavoritesHandler::~FavoritesHandler() = default;
void FavoritesHandler::RegisterMessages() {
  web_ui()->RegisterMessageCallback("blancFavorites",
      base::BindRepeating(&FavoritesHandler::Handle, base::Unretained(this)));
}
void FavoritesHandler::OnJavascriptDisallowed() {
  weak_factory_.InvalidateWeakPtrs();
  bookmark_observation_.Reset();
  pins_observer_.RemoveAll();
  changed_.Stop();
}
void FavoritesHandler::BookmarkModelChanged() {
  changed_.Start(FROM_HERE, base::Milliseconds(150),
                 base::BindOnce(&FavoritesHandler::NotifyBookmarks, base::Unretained(this)));
}
void FavoritesHandler::BookmarkNodeFaviconChanged(const bookmarks::BookmarkNode*) {
  BookmarkModelChanged();
}
void FavoritesHandler::BookmarkModelBeingDeleted() { bookmark_observation_.Reset(); }
