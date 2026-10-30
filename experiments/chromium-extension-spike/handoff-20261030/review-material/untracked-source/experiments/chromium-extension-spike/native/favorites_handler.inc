// Draft, not registered or exposed. Include inside blanc_prototype's anonymous
// namespace after start_page_pins.inc. The translation unit must include
// components/bookmarks/browser/bookmark_client.h and
// components/bookmarks/common/bookmark_pref_names.h. Folder comparison and
// storage-root helpers come from the containing translation unit.
// Import and sheet ownership remain explicit gaps; do not route the shipping
// Favorites page here until those and the review/acceptance checks are complete.
#include "chrome/browser/ui/favorites_folder_safety.h"
class FavoritesHandler : public content::WebUIMessageHandler,
                         public bookmarks::BaseBookmarkModelObserver {
 public:
  FavoritesHandler();
  ~FavoritesHandler() override;
  void RegisterMessages() override;
  void OnJavascriptDisallowed() override;

 private:
  bool Trusted() {
    auto* frame = web_ui()->GetRenderFrameHost();
    auto* profile = Profile::FromWebUI(web_ui());
    return profile && profile->IsRegularProfile() && !profile->IsOffTheRecord() && frame &&
        frame == web_ui()->GetWebContents()->GetPrimaryMainFrame() &&
        frame->GetLastCommittedURL() ==
            GURL("chrome://blanc-prototype/pages/bookmarks.html");
  }
  void Reply(const std::string& id, bool ok, base::Value value) {
    if (Trusted() && IsJavascriptAllowed())
      web_ui()->CallJavascriptFunctionUnsafe("blancFavoritesReply", base::Value(id),
                                            base::Value(ok), value);
  }
  void NotifyPins() {
    if (Trusted() && IsJavascriptAllowed())
      web_ui()->CallJavascriptFunctionUnsafe("blancFavoritesEvent", base::Value("pins"));
  }
  void NotifyPolicy() {
    if (Trusted() && IsJavascriptAllowed())
      web_ui()->CallJavascriptFunctionUnsafe("blancFavoritesEvent", base::Value("policy"));
  }
  bool MayMutate() {
    auto* contents = web_ui()->GetWebContents();
    const auto& committed = contents->GetPrimaryMainFrame()->GetLastCommittedURL();
    // IsLoading also covers subframes and resources after the top document
    // commits. Only a pending main-frame entry or changed visible URL makes
    // this committed Favorites document stale.
    return FavoritesMainFrameSettled(contents->GetController().GetPendingEntry() != nullptr,
                                     contents->GetVisibleURL() == committed);
  }
  void BookmarkModelLoaded(bool) override;
  void BookmarkModelBeingDeleted() override;
  void BookmarkModelChanged() override;
  void BookmarkNodeFaviconChanged(const bookmarks::BookmarkNode*) override;

  // Only user-owned permanent roots can contain editable rows. Never walk the
  // managed root, and still check the bookmark client for managed descendants.
  static void CollectUserNodes(bookmarks::BookmarkModel* model,
                               const bookmarks::BookmarkNode* parent,
                               std::vector<const bookmarks::BookmarkNode*>& nodes) {
    if (!parent) return;
    std::vector<const bookmarks::BookmarkNode*> stack;
    for (auto it = parent->children().rbegin(); it != parent->children().rend(); ++it)
      stack.push_back(it->get());
    while (!stack.empty()) {
      const auto* node = stack.back();
      stack.pop_back();
      if (model->client()->IsNodeManaged(node)) continue;
      nodes.push_back(node);
      if (node->is_folder())
        for (auto it = node->children().rbegin(); it != node->children().rend(); ++it)
          stack.push_back(it->get());
    }
  }
  static std::vector<const bookmarks::BookmarkNode*> UserNodes(bookmarks::BookmarkModel* model) {
    std::vector<const bookmarks::BookmarkNode*> nodes;
    for (const auto* root : {model->bookmark_bar_node(), model->other_node(),
                             model->mobile_node(), model->account_bookmark_bar_node(),
                             model->account_other_node(), model->account_mobile_node()})
      CollectUserNodes(model, root, nodes);
    return nodes;
  }
  static std::optional<std::u16string> FolderKey(const std::u16string& title) {
    const auto valid = ValidFolderName(base::UTF16ToUTF8(title));
    return valid ? FavoriteFolderKey(*valid) : std::nullopt;
  }
  static const bookmarks::BookmarkNode* FindUserFavorite(bookmarks::BookmarkModel* model,
                                                          const std::string& id) {
    int64_t wanted;
    if (!base::StringToInt64(id, &wanted)) return nullptr;
    for (const auto* node : UserNodes(model))
      if (node->is_url() && node->id() == wanted && IsFavoritable(node->url())) return node;
    return nullptr;
  }
  static bool InNamedFolder(const bookmarks::BookmarkNode* node,
                            const std::u16string& key) {
    const auto* parent = node->parent();
    if (!parent || parent->is_permanent_node()) return false;
    const auto valid = ValidFolderName(base::UTF16ToUTF8(parent->GetTitle()));
    const auto folded = valid ? FavoriteFolderKey(*valid) : std::nullopt;
    return folded && *folded == key;
  }
  static FavoritesFolderLocation Location(bookmarks::BookmarkModel* model,
                                          const bookmarks::BookmarkNode* node) {
    const auto* other = FavoriteStorageOtherRoot(model, node);
    const auto* parent = node ? node->parent() : nullptr;
    auto result = StorageLocation(model, other);
    result.flat = parent && (parent->is_permanent_node() || parent->parent() == other);
    return result;
  }
  static FavoritesFolderLocation StorageLocation(bookmarks::BookmarkModel* model,
                                                const bookmarks::BookmarkNode* other) {
    if (other && other == model->other_node()) return {FavoritesStorage::kLocal, true};
    if (other && other == model->account_other_node()) return {FavoritesStorage::kAccount, true};
    return {FavoritesStorage::kNone, false};
  }
  static bool GroupMatchesStorage(bookmarks::BookmarkModel* model,
      const std::vector<const bookmarks::BookmarkNode*>& nodes,
      const std::u16string& key, const bookmarks::BookmarkNode* storage) {
    const FavoritesFolderLocation target = StorageLocation(model, storage);
    const bookmarks::BookmarkNode* folder = nullptr;
    for (const auto* node : nodes) {
      if (!node->is_url() || !IsFavoritable(node->url()) || !InNamedFolder(node, key)) continue;
      if (!FavoritesSameFlatStorage(Location(model, node), target) ||
          !FavoritesSameContainer(folder, node->parent())) return false;
      folder = node->parent();
    }
    return true;
  }
  // Empty Chromium folders are not represented in shipping's flat Favorites
  // store; reuse only an exact spelling or create the requested spelling.
  static const bookmarks::BookmarkNode* ExactOrNewFolder(
      bookmarks::BookmarkModel* model, const bookmarks::BookmarkNode* other,
      const std::u16string& title) {
    if (!other) return nullptr;
    for (const auto& child : other->children())
      if (child->is_folder() && !model->client()->IsNodeManaged(child.get()) &&
          child->GetTitle() == title) return child.get();
    return model->AddFolder(other, other->children().size(), title);
  }
  // Shipping chooses the spelling of the oldest Favorite for a case-folded
  // folder, breaking equal-time ties by the string form of the item ID.
  static const bookmarks::BookmarkNode* CanonicalFolder(
      const std::vector<const bookmarks::BookmarkNode*>& nodes, const std::u16string& key) {
    const bookmarks::BookmarkNode* oldest = nullptr;
    for (const auto* node : nodes) {
      if (!node->is_url() || !IsFavoritable(node->url()) || !InNamedFolder(node, key)) continue;
      if (!oldest || node->date_added() < oldest->date_added() ||
          (node->date_added() == oldest->date_added() &&
           base::NumberToString(node->id()) < base::NumberToString(oldest->id()))) oldest = node;
    }
    return oldest ? oldest->parent() : nullptr;
  }
  static base::ListValue UserFavoriteRecords(bookmarks::BookmarkModel* model) {
    auto nodes = UserNodes(model);
    std::map<std::u16string, const bookmarks::BookmarkNode*> oldest;
    for (const auto* node : nodes) {
      if (!node->is_url() || !IsFavoritable(node->url())) continue;
      const auto* parent = node->parent();
      if (!parent || parent->is_permanent_node()) continue;
      const auto valid = ValidFolderName(base::UTF16ToUTF8(parent->GetTitle()));
      if (!valid) continue;
      const auto key = FavoriteFolderKey(*valid);
      if (!key) continue;
      auto found = oldest.find(*key);
      if (found == oldest.end() || node->date_added() < found->second->date_added() ||
          (node->date_added() == found->second->date_added() &&
           base::NumberToString(node->id()) < base::NumberToString(found->second->id())))
        oldest.insert_or_assign(*key, node);
    }
    base::ListValue records;
    for (const auto* node : nodes) {
      if (!node->is_url() || !IsFavoritable(node->url())) continue;
      auto record = FavoriteRecord(model, node, true);
      const auto* parent = node->parent();
      if (parent && !parent->is_permanent_node()) {
        const auto valid = ValidFolderName(base::UTF16ToUTF8(parent->GetTitle()));
        const auto key = valid ? FavoriteFolderKey(*valid) : std::nullopt;
        if (key) {
          const auto* first = oldest.at(*key);
          const auto canonical = ValidFolderName(base::UTF16ToUTF8(first->parent()->GetTitle()));
          record.Set("folder", base::UTF16ToUTF8(*canonical));
        } else {
          record.Set("folder", base::Value());
        }
      }
      records.Append(std::move(record));
    }
    return records;
  }
  void Handle(const base::ListValue& message) {
    if (!Trusted() || message.size() != 3 || !message[0].is_string() ||
        !message[1].is_string() || !message[2].is_list()) return;
    AllowJavascript();
    const auto& id = message[0].GetString();
    const auto& method = message[1].GetString();
    const auto& args = message[2].GetList();
    auto* profile = Profile::FromWebUI(web_ui());
    if (!policy_observing_) {
      policy_observer_.Init(profile->GetPrefs());
      policy_observer_.Add(bookmarks::prefs::kEditBookmarksEnabled,
          base::BindRepeating(&FavoritesHandler::NotifyPolicy, base::Unretained(this)));
      policy_observing_ = true;
    }
    if ((method == "pinsPin" || method == "pinsUnpin" || method == "remove" ||
         method == "setFolder" || method == "renameFolder" || method == "removeFolder") &&
        !MayMutate()) {
      Reply(id, false, base::Value("Wait for navigation to finish")); return;
    }
    if (method == "capabilities" && args.empty()) {
      Reply(id, true, base::Value(base::DictValue().Set("editable",
                                  profile->GetPrefs()->GetBoolean(bookmarks::prefs::kEditBookmarksEnabled))
                                  .Set("pins", true).Set("import", false))); return;
    }
    if ((method == "pinsList" && args.empty()) ||
        (method == "pinsPin" && args.size() == 2 && args[0].is_string() && args[1].is_string()) ||
        (method == "pinsUnpin" && args.size() == 1 && args[0].is_string())) {
      auto* prefs = profile->GetPrefs();
      if (!prefs || !prefs->FindPreference(kStartPagePinsPref)) {
        Reply(id, false, base::Value("Start Page pins unavailable")); return;
      }
      if (!pins_observing_) {
        pins_observer_.Init(prefs);
        pins_observer_.Add(kStartPagePinsPref, base::BindRepeating(
            &FavoritesHandler::NotifyPins, base::Unretained(this)));
        pins_observing_ = true;
      }
      auto pins = SanitizeStartPins(prefs->GetList(kStartPagePinsPref));
      if (method == "pinsList") {
        Reply(id, true, base::Value(base::DictValue().Set("max", static_cast<int>(kStartPageMaxPins))
                                     .Set("pins", std::move(pins)))); return;
      }
      // Favorites hides pin controls when editing is disabled. Enforce the
      // live policy in native code too; a direct WebUI message cannot bypass
      // the renderer and change pins while the control is unavailable.
      if (!prefs->GetBoolean(bookmarks::prefs::kEditBookmarksEnabled)) {
        Reply(id, false, base::Value("Favorites editing is disabled")); return;
      }
      base::DictValue candidate;
      candidate.Set("url", args[0].GetString());
      if (method == "pinsPin") candidate.Set("title", args[1].GetString());
      auto target = SanitizeStartPin(base::Value(std::move(candidate)));
      if (!target) {
        if (method == "pinsPin") Reply(id, true, base::Value(base::DictValue().Set("ok", false).Set("reason", "invalid")));
        else Reply(id, true, base::Value(false));
        return;
      }
      const auto* url = target->FindString("url");
      bool found = false;
      base::ListValue rest;
      for (const auto& item : pins) {
        if (*item.GetDict().FindString("url") == *url) found = true;
        else rest.Append(item.Clone());
      }
      if (method == "pinsPin" && !found && pins.size() >= kStartPageMaxPins) {
        Reply(id, true, base::Value(base::DictValue().Set("ok", false).Set("reason", "full"))); return;
      }
      if ((method == "pinsPin" && !found) || (method == "pinsUnpin" && found)) {
        base::ListValue next;
        if (method == "pinsPin") next.Append(std::move(*target));
        for (const auto& item : rest) next.Append(item.Clone());
        prefs->SetList(kStartPagePinsPref, std::move(next));
        prefs->CommitPendingWrite();
      }
      if (method == "pinsPin") Reply(id, true, base::Value(base::DictValue().Set("ok", true)));
      else Reply(id, true, base::Value(found));
      return;
    }
    auto* model = BookmarkModelFactory::GetForBrowserContext(profile);
    if (!model) { Reply(id, false, base::Value("Favorites unavailable")); return; }
    if (!observation_.IsObserving()) observation_.Observe(model);
    if (!model->loaded()) {
      if (method == "list" && args.empty() && pending_lists_.size() < 64)
        pending_lists_.push_back(id);
      else Reply(id, false, base::Value("Favorites are still loading"));
      return;
    }
    if (method == "list" && args.empty()) {
      Reply(id, true, base::Value(UserFavoriteRecords(model))); return;
    }
    if (!profile->GetPrefs()->GetBoolean(bookmarks::prefs::kEditBookmarksEnabled)) {
      Reply(id, false, base::Value("Favorites editing is disabled")); return;
    }
    if (method == "remove" && args.size() == 1 && args[0].is_string()) {
      const auto* node = FindUserFavorite(model, args[0].GetString());
      if (node) model->Remove(node, bookmarks::metrics::BookmarkEditSource::kUser, FROM_HERE);
      Reply(id, true, base::Value()); return;
    }
    if (method == "setFolder" && args.size() == 2 && args[0].is_string() &&
        (args[1].is_string() || args[1].is_none())) {
      const auto* node = FindUserFavorite(model, args[0].GetString());
      if (!node) { Reply(id, false, base::Value("Favorite not found")); return; }
      const auto source = Location(model, node);
      const auto* storage = FavoriteStorageOtherRoot(model, node);
      if (!FavoritesSameFlatStorage(source, StorageLocation(model, storage))) {
        Reply(id, false, base::Value("Use the native bookmark manager for nested or managed folders")); return;
      }
      const bookmarks::BookmarkNode* target = storage;
      if (args[1].is_string()) {
        auto folder = ValidFolderName(args[1].GetString());
        if (!folder) { Reply(id, false, base::Value("Invalid folder name")); return; }
        const auto key = FolderKey(*folder);
        if (!key) { Reply(id, false, base::Value("Unable to compare folder name")); return; }
        const auto nodes = UserNodes(model);
        if (!GroupMatchesStorage(model, nodes, *key, storage)) {
          Reply(id, false, base::Value("Use the native bookmark manager for an ambiguous folder")); return;
        }
        const auto* existing = CanonicalFolder(nodes, *key);
        if (existing && InNamedFolder(node, *key) &&
            node->parent()->GetTitle() == existing->GetTitle()) {
          Reply(id, true, base::Value()); return;
        }
        target = existing ? existing : ExactOrNewFolder(model, storage, *folder);
      } else if (node->parent()->is_permanent_node()) {
        Reply(id, true, base::Value()); return;
      }
      auto destination = StorageLocation(model, storage);
      destination.flat = target && (target->parent() == storage || target == storage);
      if (!target || !FavoritesSameFlatStorage(source, destination)) {
        Reply(id, false, base::Value("Folder is not available in this bookmark storage")); return;
      }
      if (node->parent() != target) model->Move(node, target, target->children().size());
      Reply(id, true, base::Value()); return;
    }
    if ((method == "removeFolder" && args.size() == 1 && args[0].is_string()) ||
        (method == "renameFolder" && args.size() == 2 && args[0].is_string() && args[1].is_string())) {
      auto old_name = ValidFolderName(args[0].GetString());
      auto new_name = method == "renameFolder" ? ValidFolderName(args[1].GetString()) : std::nullopt;
      if (!old_name || (method == "renameFolder" && !new_name)) {
        Reply(id, false, base::Value("Invalid folder name")); return;
      }
      const auto key = FolderKey(*old_name);
      const auto new_key = new_name ? FolderKey(*new_name) : std::nullopt;
      if (!key || (new_name && !new_key)) {
        Reply(id, false, base::Value("Unable to compare folder name")); return;
      }
      auto nodes = UserNodes(model);
      const auto* old_folder = CanonicalFolder(nodes, *key);
      if (!old_folder) { Reply(id, true, base::Value()); return; }
      const auto* storage = FavoriteStorageOtherRoot(model, old_folder);
      if (!storage || !GroupMatchesStorage(model, nodes, *key, storage) ||
          (new_key && !GroupMatchesStorage(model, nodes, *new_key, storage))) {
        Reply(id, false, base::Value("Use the native bookmark manager for nested or ambiguous folders")); return;
      }
      const bookmarks::BookmarkNode* target = storage;
      if (new_name && *new_key == *key) {
        // A case-only rename must not rename a native folder containing
        // non-Favorites. Re-home matching URL rows into a same-spelled folder.
        target = nullptr;
        bool needs_change = false;
        for (const auto* node : nodes) {
          if (!node->is_url() || !IsFavoritable(node->url()) || !InNamedFolder(node, *key)) continue;
          if (node->parent()->GetTitle() == *new_name && !target) target = node->parent();
          if (node->parent()->GetTitle() != *new_name) needs_change = true;
        }
        if (!needs_change) { Reply(id, true, base::Value()); return; }
        if (!target) target = ExactOrNewFolder(model, storage, *new_name);
      } else if (new_name) {
        const auto* existing = CanonicalFolder(nodes, *new_key);
        target = existing ? existing : ExactOrNewFolder(model, storage, *new_name);
      }
      if (!target || (target != storage && target->parent() != storage)) {
        Reply(id, false, base::Value("Folder is not available in this bookmark storage")); return;
      }
      for (const auto* node : nodes)
        if (node->is_url() && IsFavoritable(node->url()) && InNamedFolder(node, *key) && node->parent() != target)
          model->Move(node, target, target->children().size());
      Reply(id, true, base::Value()); return;
    }
    Reply(id, false, base::Value("Favorites action is not yet available"));
  }
  base::ScopedObservation<bookmarks::BookmarkModel, bookmarks::BookmarkModelObserver> observation_{this};
  std::vector<std::string> pending_lists_;
  PrefChangeRegistrar pins_observer_;
  bool pins_observing_ = false;
  PrefChangeRegistrar policy_observer_;
  bool policy_observing_ = false;
};

FavoritesHandler::FavoritesHandler() = default;
FavoritesHandler::~FavoritesHandler() = default;

void FavoritesHandler::RegisterMessages() {
  web_ui()->RegisterMessageCallback("blancFavorites",
      base::BindRepeating(&FavoritesHandler::Handle, base::Unretained(this)));
}

void FavoritesHandler::OnJavascriptDisallowed() {
  observation_.Reset();
  pending_lists_.clear();
  pins_observer_.Reset();
  pins_observing_ = false;
  policy_observer_.Reset();
  policy_observing_ = false;
}

void FavoritesHandler::BookmarkModelLoaded(bool) {
  auto pending = std::move(pending_lists_);
  pending_lists_.clear();
  auto* model = LoadedBookmarkModel(Profile::FromWebUI(web_ui()));
  for (const auto& id : pending) {
    if (model) Reply(id, true, base::Value(UserFavoriteRecords(model)));
    else Reply(id, false, base::Value("Favorites unavailable"));
  }
}

void FavoritesHandler::BookmarkModelBeingDeleted() {
  auto pending = std::move(pending_lists_);
  pending_lists_.clear();
  observation_.Reset();
  for (const auto& id : pending) Reply(id, false, base::Value("Favorites unavailable"));
}

void FavoritesHandler::BookmarkModelChanged() {
  if (Trusted() && IsJavascriptAllowed())
    web_ui()->CallJavascriptFunctionUnsafe("blancFavoritesEvent", base::Value("bookmarks"));
}

void FavoritesHandler::BookmarkNodeFaviconChanged(const bookmarks::BookmarkNode*) {
  BookmarkModelChanged();
}
