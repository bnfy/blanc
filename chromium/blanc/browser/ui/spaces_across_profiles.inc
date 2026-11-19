// Spaces across profiles (F41-83 to F41-92; plan
// docs/superpowers/plans/2026-11-19-fork-spaces-across-profiles.md). Every
// loaded regular profile mirrors the part of its Space list that may cross
// profiles into Local State, keyed by its directory ("Default",
// "Profile 1", ...), so a window of another profile lists those Spaces without
// loading it. A profile's mirror is written when it loads and whenever its
// blanc.spaces.meta changes; it stays after the profile unloads (V31) and goes
// when the profile is removed. Registered in browser_prefs.cc (patch 0106).
constexpr char kSpacesMirrorPref[] = "blanc.spaces.profiles";

// The rows of one Spaces dictionary: a profile's blanc.spaces.meta ({order,
// items, deleted}) when writing, a mirrored entry ({order, items}) when
// reading. Both sides go through the same pure rule, so a damaged or edited
// Local State never passes anything but the allowlisted fields.
std::vector<blanc::spaces_across_profiles::Space> SpacesMirrorRows(const base::DictValue& meta) {
  namespace s = blanc::spaces_across_profiles;
  std::vector<std::string> order;
  std::map<std::string, s::Space> items;
  std::set<std::string> deleted;
  if (const auto* list = meta.FindList("order"))
    for (const auto& id : *list) if (id.is_string()) order.push_back(id.GetString());
  if (const auto* list = meta.FindList("deleted"))
    for (const auto& id : *list) if (id.is_string()) deleted.insert(id.GetString());
  if (const auto* dict = meta.FindDict("items")) {
    for (const auto [id, value] : *dict) {
      if (!value.is_dict()) continue;
      const auto& item = value.GetDict();
      s::Space space;
      if (const auto* text = item.FindString("name")) space.name = *text;
      if (const auto* text = item.FindString("color")) space.color = *text;
      if (const auto* text = item.FindString("symbol")) space.symbol = *text;
      const double tabs = item.FindDouble("tabCount").value_or(0);
      space.tab_count = std::isfinite(tabs) ? static_cast<int>(std::clamp(tabs, 0.0, 10000.0)) : 0;
      items.emplace(id, std::move(space));
    }
  }
  return s::MirrorRows(order, items, deleted);
}

base::DictValue SpacesMirrorValue(const std::vector<blanc::spaces_across_profiles::Space>& rows) {
  base::ListValue order;
  base::DictValue items;
  for (const auto& row : rows) {
    order.Append(row.id);
    items.Set(row.id, base::DictValue().Set("name", row.name).Set("color", row.color)
        .Set("symbol", row.symbol).Set("tabCount", row.tab_count));
  }
  return base::DictValue().Set("order", std::move(order)).Set("items", std::move(items));
}

// Another profile's Spaces, as its mirror holds them; none when it has no
// mirror yet (V31). The Spaces menu's other-profile list reads it.
std::vector<blanc::spaces_across_profiles::Space> ReadSpacesMirror(const std::string& directory) {
  auto* local = g_browser_process->local_state();
  const auto* entry = local ? local->GetDict(kSpacesMirrorPref).FindDict(directory) : nullptr;
  return entry ? SpacesMirrorRows(*entry) : std::vector<blanc::spaces_across_profiles::Space>();
}

// Every Island host lists the Spaces again, but those of `except`'s profile:
// spaceMetaSave already pings that profile's other windows. Only a live frame
// that has committed the Island host runs the call.
void NotifySpacesMenus(Profile* except) {
  for (auto* owner : Owner::Live()) {
    if (!owner->view || owner->browser->GetProfile()->GetOriginalProfile() == except) continue;
    auto* host = owner->view->GetWebContents();
    auto* frame = host->GetPrimaryMainFrame();
    if (host->GetLastCommittedURL() == GURL("chrome://blanc-prototype/host.html") && frame->IsRenderFrameLive())
      frame->ExecuteJavaScript(u"window.BlancPrototypeHost?.spacesChanged()", base::NullCallback());
  }
}

class SpacesMirror final : public ProfileManagerObserver,
                           public ProfileObserver,
                           public ProfileAttributesStorage::Observer {
 public:
  static SpacesMirror* Get();
  // Once, from the first Island window: profiles loaded before then are
  // mirrored here, later ones as ProfileManager adds them.
  void Start();

  // ProfileManagerObserver: a profile loaded in this run (every run, unlike
  // the storage's OnProfileAdded below). Its mirror follows its Space list
  // from now on, and is written once now: the backfill V31 relies on.
  void OnProfileAdded(Profile* profile) override;
  // The profile is listed by others as live no longer.
  void OnProfileMarkedForPermanentDeletion(Profile*) override;
  void OnProfileManagerDestroying() override;

  // ProfileObserver: the profile unloads; its mirror stays (V31).
  void OnProfileWillBeDestroyed(Profile* profile) override;

  // ProfileAttributesStorage::Observer: a profile created on this device (once,
  // when it is first made). It is listed, with no Spaces until it loads.
  void OnProfileAdded(const base::FilePath&) override;
  // The profile's mirror goes with it.
  void OnProfileWasRemoved(const base::FilePath& path, const std::u16string&) override;
  // Other profiles' menus head its Spaces with its name.
  void OnProfileNameChanged(const base::FilePath&, const std::u16string&) override;
  // Both change whether the profile is live, so listed.
  void OnProfileIsOmittedChanged(const base::FilePath&) override;
  void OnProfileSigninRequiredChanged(const base::FilePath&) override;

 private:
  friend class base::NoDestructor<SpacesMirror>;
  SpacesMirror();
  ~SpacesMirror() override;

  void Write(Profile* profile);

  bool started_ = false;
  std::map<Profile*, std::unique_ptr<PrefChangeRegistrar>> registrars_;
  base::ScopedObservation<ProfileManager, ProfileManagerObserver> manager_{this};
  base::ScopedObservation<ProfileAttributesStorage, ProfileAttributesStorage::Observer> storage_{this};
  base::ScopedMultiSourceObservation<Profile, ProfileObserver> profiles_{this};
};

SpacesMirror::SpacesMirror() = default;
SpacesMirror::~SpacesMirror() = default;

SpacesMirror* SpacesMirror::Get() {
  static base::NoDestructor<SpacesMirror> mirror;
  return mirror.get();
}

void SpacesMirror::Start() {
  auto* manager = g_browser_process->profile_manager();
  if (started_ || !manager) return;
  started_ = true;
  manager_.Observe(manager);
  storage_.Observe(&manager->GetProfileAttributesStorage());
  for (auto* profile : manager->GetLoadedProfiles()) OnProfileAdded(profile);
}

void SpacesMirror::OnProfileAdded(Profile* profile) {
  if (!profile->IsRegularProfile() || registrars_.contains(profile)) return;
  auto registrar = std::make_unique<PrefChangeRegistrar>();
  registrar->Init(profile->GetPrefs());
  registrar->Add(kSpacesMetaPref, base::BindRepeating(&SpacesMirror::Write,
      base::Unretained(this), base::Unretained(profile)));
  registrars_.emplace(profile, std::move(registrar));
  profiles_.AddObservation(profile);
  Write(profile);
}

void SpacesMirror::OnProfileMarkedForPermanentDeletion(Profile*) { NotifySpacesMenus(nullptr); }

void SpacesMirror::OnProfileManagerDestroying() {
  registrars_.clear();
  profiles_.RemoveAllObservations();
  storage_.Reset();
  manager_.Reset();
}

void SpacesMirror::OnProfileWillBeDestroyed(Profile* profile) {
  registrars_.erase(profile);
  if (profiles_.IsObservingSource(profile)) profiles_.RemoveObservation(profile);
}

void SpacesMirror::OnProfileAdded(const base::FilePath&) { NotifySpacesMenus(nullptr); }

void SpacesMirror::OnProfileWasRemoved(const base::FilePath& path, const std::u16string&) {
  if (auto* local = g_browser_process->local_state()) {
    auto mirror = local->GetDict(kSpacesMirrorPref).Clone();
    if (mirror.Remove(path.BaseName().AsUTF8Unsafe())) local->SetDict(kSpacesMirrorPref, std::move(mirror));
  }
  NotifySpacesMenus(nullptr);
}

void SpacesMirror::OnProfileNameChanged(const base::FilePath&, const std::u16string&) { NotifySpacesMenus(nullptr); }
void SpacesMirror::OnProfileIsOmittedChanged(const base::FilePath&) { NotifySpacesMenus(nullptr); }
void SpacesMirror::OnProfileSigninRequiredChanged(const base::FilePath&) { NotifySpacesMenus(nullptr); }

void SpacesMirror::Write(Profile* profile) {
  auto* local = g_browser_process->local_state();
  auto* manager = g_browser_process->profile_manager();
  // A removed profile stays loaded until Blanc quits; it is never mirrored
  // again once OnProfileWasRemoved has erased it.
  if (!local || !manager ||
      !manager->GetProfileAttributesStorage().GetProfileAttributesWithPath(profile->GetPath())) return;
  const auto directory = profile->GetPath().BaseName().AsUTF8Unsafe();
  auto value = SpacesMirrorValue(SpacesMirrorRows(profile->GetPrefs()->GetDict(kSpacesMetaPref)));
  const auto* current = local->GetDict(kSpacesMirrorPref).FindDict(directory);
  if (current && *current == value) return;
  auto mirror = local->GetDict(kSpacesMirrorPref).Clone();
  mirror.Set(directory, std::move(value));
  local->SetDict(kSpacesMirrorPref, std::move(mirror));
  NotifySpacesMenus(profile);
}

void StartSpacesMirror() { SpacesMirror::Get()->Start(); }

// ---- Listing, opening and creating another profile's Spaces (plan Task 4) ----

// A live profile (Global Constraints): RouteProfile finds it (not omitted, no
// sign-in required) and it isn't marked for deletion.
ProfileAttributesEntry* LiveSpaceProfile(const std::string& id) {
  auto* entry = RouteProfile(id);
  return entry && !IsProfileDirectoryMarkedForDeletion(entry->GetPath()) ? entry : nullptr;
}

// spaceOtherProfiles: {} in a mini window or with fewer than two live
// profiles, else {profileId, profileName, others}. V32: this window's profile,
// then Personal, then the rest in the profile picker's order. The rows come
// from the mirror, so listing never loads a profile; openElsewhere from the
// Space each ordinary window shows.
base::DictValue OtherProfilesPayload(BrowserWindowInterface* browser) {
  namespace s = blanc::spaces_across_profiles;
  auto* manager = g_browser_process->profile_manager();
  if (IsMiniWindow(browser) || !manager) return {};
  auto& storage = manager->GetProfileAttributesStorage();
  auto* own = storage.GetProfileAttributesWithPath(browser->GetProfile()->GetOriginalProfile()->GetPath());
  if (!own) return {};
  const auto current = RouteProfileId(browser->GetProfile());
  auto entries = storage.GetAllProfilesAttributesSortedForDisplay();
  const auto rank = [&](ProfileAttributesEntry* entry) {
    const auto dir = entry->GetPath().BaseName().AsUTF8Unsafe();
    return (dir == "Default" ? "default" : dir) == current ? 0 : dir == "Default" ? 1 : 2;
  };
  std::ranges::stable_sort(entries, {}, rank);
  std::vector<s::Profile> profiles;
  std::map<std::string, std::vector<s::Space>> mirrors;
  for (auto* entry : entries) {
    const auto dir = entry->GetPath().BaseName().AsUTF8Unsafe();
    const auto id = dir == "Default" ? std::string("default") : dir;
    const bool live = !entry->IsOmitted() && !entry->IsSigninRequired() &&
        !IsProfileDirectoryMarkedForDeletion(entry->GetPath());
    profiles.push_back({id, RouteProfileName(entry), live});
    if (live && id != current) mirrors.emplace(id, ReadSpacesMirror(dir));
  }
  std::map<std::string, std::set<std::string>> shown;
  for (auto* owner : Owner::Live()) {
    auto* other = owner->browser.get();
    if (!other || !IsIslandWindow(other) || IsMiniWindow(other) || IsHoldWindow(other) || owner->space_name.empty())
      continue;
    shown[RouteProfileId(other->GetProfile())].insert(owner->space_name);
  }
  const auto others = s::OtherProfileSpaces(profiles, current, mirrors, shown);
  if (others.empty()) return {};
  base::ListValue list;
  for (const auto& other : others) {
    base::ListValue items;
    for (const auto& item : other.items)
      items.Append(base::DictValue().Set("id", item.id).Set("name", item.name).Set("color", item.color)
          .Set("symbol", item.symbol).Set("tabCount", item.tab_count).Set("openElsewhere", item.open_elsewhere));
    list.Append(base::DictValue().Set("id", other.id).Set("name", other.name).Set("status", other.status)
        .Set("full", other.full).Set("items", std::move(items)));
  }
  return base::DictValue().Set("profileId", current).Set("profileName", RouteProfileName(own))
      .Set("others", std::move(list));
}

// Shipping's Spaces error codes; spacePendingDone passes on no other.
bool IsSpaceErrorCode(const std::string& code) {
  static constexpr std::string_view kCodes[] = {"profile-unavailable", "not-found", "activation-failed", "busy",
      "duplicate-name", "limit", "invalid-name", "storage-failed", "saved-not-opened"};
  return std::ranges::find(kCodes, code) != std::end(kCodes);
}

// A new ordinary window of `profile` holding one new tab, without restoring
// the profile's last session; its Island opens or creates the Space and
// answers through `pending.done`. Null when no window can open.
BrowserWindowInterface* NewSpaceWindow(Profile* profile, PendingSpaceOpen pending) {
  if (profile->IsOffTheRecord() ||
      GetBrowserWindowCreationStatusForProfile(*profile) != BrowserWindowInterface::CreationStatus::kOk) return nullptr;
  BrowserWindowCreateParams params(profile, true);
  params.should_trigger_session_restore = false;
  auto* created = CreateBrowserWindow(std::move(params));
  if (!created) return nullptr;
  chrome::AddAndReturnTabAt(created, GURL("chrome://newtab/"), -1, true);
  PendingSpaceOpens()[created->GetSessionID().id()] = std::move(pending);
  created->GetWindow()->Show();
  return created;
}

// Brings forward the ordinary window of `profile` showing Space `space`; a
// hold window never counts, as OtherProfilesPayload's openElsewhere skips it.
bool FocusSpaceWindow(Profile* profile, const std::string& space) {
  for (auto* owner : Owner::Live()) {
    auto* browser = owner->browser.get();
    if (!browser || browser->GetProfile() != profile || !IsIslandWindow(browser) || IsMiniWindow(browser) ||
        IsHoldWindow(browser) || browser->IsDeleteScheduled() || owner->space_name != space) continue;
    auto* window = browser->GetWindow();
    if (window->IsMinimized()) window->Restore();
    window->Activate();
    return true;
  }
  return false;
}

using SpaceElsewhereDone = base::OnceCallback<void(base::DictValue)>;

// Opens and creates in another profile still waiting on its load or on their
// new window: "open\n<profile>\n<space>" or "create\n<profile>\n<folded name>".
// Every caller of one open shares its answer, so a double click on a row
// opens one window.
std::map<std::string, std::vector<SpaceElsewhereDone>>& SpacesElsewhere() {
  static base::NoDestructor<std::map<std::string, std::vector<SpaceElsewhereDone>>> waiting;
  return *waiting;
}
base::DictValue SpaceElsewhereError(const std::string& error) {
  return base::DictValue().Set("ok", false).Set("error", error);
}
void FinishSpaceElsewhere(const std::string& key, base::DictValue result) {
  const auto found = SpacesElsewhere().find(key);
  if (found == SpacesElsewhere().end()) return;
  auto waiting = std::move(found->second);
  SpacesElsewhere().erase(found);
  for (auto& done : waiting) std::move(done).Run(result.Clone());
}
// The new window's answer, {ok, detail, error?, workspaceId?}, as the menu's
// result: only the code and the Space's id cross back, never the detail.
void SpaceWindowAnswered(std::string key, base::DictValue answer) {
  const bool ok = answer.FindBool("ok").value_or(false);
  const auto* error = answer.FindString("error");
  auto result = ok ? base::DictValue().Set("ok", true).Set("action", "focus")
                   : SpaceElsewhereError(error ? *error : "activation-failed");
  if (const auto* space = answer.FindString("workspaceId")) result.Set("workspaceId", *space);
  FinishSpaceElsewhere(key, std::move(result));
}

// Chromium's own profile loading (profiles::LoadProfileAsync, the picker's
// loader; never SwitchToProfile, which restores the profile's last session).
// It drops its callback when the load fails, so `failed` answers then.
void WithSpaceProfile(const std::string& key, const std::string& profile_id, const base::FilePath& path,
                      base::OnceCallback<void(Profile*)> then) {
  base::ScopedClosureRunner failed(
      base::BindOnce(&FinishSpaceElsewhere, key, SpaceElsewhereError("profile-unavailable")));
  profiles::LoadProfileAsync(path, base::BindOnce(
      [](std::string key, std::string profile_id, base::ScopedClosureRunner failed,
         base::OnceCallback<void(Profile*)> then, Profile* profile) {
        failed.ReplaceClosure(base::OnceClosure());
        // Still live when it arrives: not removed, omitted, locked or marked
        // for deletion meanwhile.
        if (!profile || profile->IsOffTheRecord() || profile->ShutdownStarted() ||
            !LiveSpaceProfile(profile_id) || RouteProfileId(profile) != profile_id) {
          FinishSpaceElsewhere(key, SpaceElsewhereError("profile-unavailable"));
          return;
        }
        std::move(then).Run(profile);
      }, key, profile_id, std::move(failed), std::move(then)));
}

// In `meta`'s items and order, and not deleted.
bool SpaceListed(const base::DictValue& meta, const std::string& space) {
  const auto* items = meta.FindDict("items");
  const auto* order = meta.FindList("order");
  const auto* deleted = meta.FindList("deleted");
  const base::Value id(space);
  return items && items->FindDict(space) && order && std::ranges::find(*order, id) != order->end() &&
      !(deleted && std::ranges::find(*deleted, id) != deleted->end());
}

void OpenLoadedSpace(std::string key, std::string space, Profile* profile) {
  if (!SpaceListed(profile->GetPrefs()->GetDict(kSpacesMetaPref), space)) {
    FinishSpaceElsewhere(key, SpaceElsewhereError("not-found"));
    return;
  }
  if (FocusSpaceWindow(profile, space)) {
    FinishSpaceElsewhere(key, base::DictValue().Set("ok", true).Set("action", "focus"));
    return;
  }
  PendingSpaceOpen pending;
  pending.kind = "open";
  pending.id = space;
  pending.done = base::BindOnce(&SpaceWindowAnswered, key);
  if (!NewSpaceWindow(profile, std::move(pending))) FinishSpaceElsewhere(key, SpaceElsewhereError("activation-failed"));
}

// spaceOpenInProfile: Space `space` of profile `profile_id`, in the window of
// that profile showing it, else in a new one. Never touches `from`.
void OpenSpaceInProfile(BrowserWindowInterface* from, const std::string& profile_id, const std::string& space,
                        SpaceElsewhereDone done) {
  if (IsMiniWindow(from)) {std::move(done).Run(SpaceElsewhereError("busy")); return;}
  auto* entry = LiveSpaceProfile(profile_id);
  if (!entry || RouteProfileId(from->GetProfile()) == profile_id) {
    std::move(done).Run(SpaceElsewhereError("profile-unavailable"));
    return;
  }
  auto* loaded = g_browser_process->profile_manager()->GetProfileByPath(entry->GetPath());
  if (loaded && FocusSpaceWindow(loaded, space)) {
    std::move(done).Run(base::DictValue().Set("ok", true).Set("action", "focus"));
    return;
  }
  const auto key = "open\n" + profile_id + "\n" + space;
  auto& waiting = SpacesElsewhere()[key];
  waiting.push_back(std::move(done));
  if (waiting.size() > 1) return;  // Joins the open already under way.
  WithSpaceProfile(key, profile_id, entry->GetPath(), base::BindOnce(&OpenLoadedSpace, key, space));
}

void CreateLoadedSpace(std::string key, std::string name, std::string color, std::string symbol, Profile* profile) {
  const auto& meta = profile->GetPrefs()->GetDict(kSpacesMetaPref);
  const auto* items = meta.FindDict("items");
  const auto* order = meta.FindList("order");
  const auto folded = base::i18n::FoldCase(base::UTF8ToUTF16(name));
  if (items && order) {
    for (const auto& id : *order) {
      const auto* item = id.is_string() ? items->FindDict(id.GetString()) : nullptr;
      const auto* other = item ? item->FindString("name") : nullptr;
      if (other && base::i18n::FoldCase(base::UTF8ToUTF16(*other)) == folded) {
        FinishSpaceElsewhere(key, SpaceElsewhereError("duplicate-name"));
        return;
      }
    }
  }
  if (order && order->size() >= blanc::spaces_across_profiles::kMaxSpaces) {
    FinishSpaceElsewhere(key, SpaceElsewhereError("limit"));
    return;
  }
  PendingSpaceOpen pending;
  pending.kind = "create";
  pending.name = std::move(name);
  pending.color = std::move(color);
  pending.symbol = std::move(symbol);
  pending.done = base::BindOnce(&SpaceWindowAnswered, key);
  if (!NewSpaceWindow(profile, std::move(pending))) FinishSpaceElsewhere(key, SpaceElsewhereError("activation-failed"));
}

// spaceCreateInProfile: an empty Space named `raw_name` in profile
// `profile_id`, made and shown by a new window of that profile (only an empty
// start crosses profiles, spec §4.4).
void CreateSpaceInProfile(BrowserWindowInterface* from, const std::string& profile_id, const std::string& raw_name,
                          const std::string& color, const std::string& symbol, SpaceElsewhereDone done) {
  namespace s = blanc::spaces_across_profiles;
  if (IsMiniWindow(from)) {std::move(done).Run(SpaceElsewhereError("busy")); return;}
  auto* entry = LiveSpaceProfile(profile_id);
  if (!entry || RouteProfileId(from->GetProfile()) == profile_id) {
    std::move(done).Run(SpaceElsewhereError("profile-unavailable"));
    return;
  }
  // host.js spaceName: trimmed, inner spaces collapsed, 1 to 60 characters.
  const auto name = base::UTF16ToUTF8(base::CollapseWhitespace(base::UTF8ToUTF16(raw_name), false));
  const auto points = s::internal::CodePoints(name);
  if (points == 0 || points > 60) {std::move(done).Run(SpaceElsewhereError("invalid-name")); return;}
  if (!s::internal::ValidColor(color) || !s::internal::ValidSymbol(symbol)) {
    std::move(done).Run(SpaceElsewhereError("activation-failed"));
    return;
  }
  // The same name already being made there is taken, as it soon will be.
  const auto key = "create\n" + profile_id + "\n" + base::UTF16ToUTF8(base::i18n::FoldCase(base::UTF8ToUTF16(name)));
  if (SpacesElsewhere().contains(key)) {std::move(done).Run(SpaceElsewhereError("duplicate-name")); return;}
  SpacesElsewhere()[key].push_back(std::move(done));
  WithSpaceProfile(key, profile_id, entry->GetPath(), base::BindOnce(&CreateLoadedSpace, key, name, color, symbol));
}
